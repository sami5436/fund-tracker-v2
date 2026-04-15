import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export const dynamic = 'force-dynamic';

interface QuoteData {
  ticker: string;
  price: number | null;
  prevClose: number | null;
  changePct: number | null;
  updatedAt: string | null;
}

// Server-side cache: prevents hammering Yahoo Finance on every 60s client refresh
const quoteCache = new Map<string, { data: QuoteData; expiresAt: number }>();
const CACHE_TTL = 55_000; // 55 seconds

async function fetchQuote(ticker: string): Promise<QuoteData> {
  const cached = quoteCache.get(ticker);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const quote = await yahooFinance.quote(ticker);

  const price = quote.regularMarketPrice ?? null;
  const prevClose = quote.regularMarketPreviousClose ?? null;
  const changePct =
    price !== null && prevClose !== null && prevClose !== 0
      ? ((price - prevClose) / prevClose) * 100
      : null;

  let updatedAt: string | null = null;
  if (quote.regularMarketTime) {
    updatedAt =
      quote.regularMarketTime instanceof Date
        ? quote.regularMarketTime.toISOString()
        : new Date((quote.regularMarketTime as number) * 1000).toISOString();
  }

  const data: QuoteData = { ticker, price, prevClose, changePct, updatedAt };
  quoteCache.set(ticker, { data, expiresAt: Date.now() + CACHE_TTL });
  return data;
}

// Fetch tickers sequentially with a small delay to avoid crumb rate limits
async function fetchSequential(tickers: string[], delayMs = 120): Promise<QuoteData[]> {
  const results: QuoteData[] = [];
  for (const ticker of tickers) {
    try {
      results.push(await fetchQuote(ticker));
    } catch (err) {
      console.error(`[stocks] ${ticker}:`, (err as Error).message);
      results.push({ ticker, price: null, prevClose: null, changePct: null, updatedAt: null });
    }
    if (delayMs > 0 && tickers.indexOf(ticker) < tickers.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return results;
}

export async function GET(request: NextRequest) {
  const tickers = request.nextUrl.searchParams
    .get('tickers')
    ?.split(',')
    .map((t) => t.trim())
    .filter(Boolean) ?? [];

  if (!tickers.length) {
    return NextResponse.json({ error: 'No tickers provided' }, { status: 400 });
  }

  // Split into cached vs uncached — only stagger-fetch the uncached ones
  const now = Date.now();
  const uncached = tickers.filter((t) => {
    const c = quoteCache.get(t);
    return !c || c.expiresAt <= now;
  });

  if (uncached.length > 0) {
    await fetchSequential(uncached);
  }

  // All tickers now either freshly fetched or served from cache
  const data = tickers.map((ticker) => {
    const cached = quoteCache.get(ticker);
    return cached?.data ?? { ticker, price: null, prevClose: null, changePct: null, updatedAt: null };
  });

  return NextResponse.json(data);
}
