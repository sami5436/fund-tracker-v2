import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface QuoteData {
  ticker: string;
  price: number | null;
  prevClose: number | null;
  changePct: number | null;
  updatedAt: string | null;
}

declare global {
  // eslint-disable-next-line no-var
  var _quoteCache: Map<string, { data: QuoteData; expiresAt: number }> | undefined;
  var _inFlight: Map<string, Promise<QuoteData>> | undefined;
}

const quoteCache = (globalThis._quoteCache ??= new Map());
const inFlight = (globalThis._inFlight ??= new Map());
const CACHE_TTL = 55_000;

// Uses Yahoo Finance v8 chart API — same endpoint as yfinance (Python), no crumb required
async function fetchQuoteFromChart(ticker: string): Promise<QuoteData> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error('No chart data');

  const price: number | null = meta.regularMarketPrice ?? null;
  const prevClose: number | null = meta.chartPreviousClose ?? meta.previousClose ?? null;
  const changePct =
    price !== null && prevClose !== null && prevClose !== 0
      ? ((price - prevClose) / prevClose) * 100
      : null;
  const updatedAt = meta.regularMarketTime
    ? new Date(meta.regularMarketTime * 1000).toISOString()
    : null;

  return { ticker, price, prevClose, changePct, updatedAt };
}

async function fetchQuote(ticker: string): Promise<QuoteData> {
  const cached = quoteCache.get(ticker);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const existing = inFlight.get(ticker);
  if (existing) return existing;

  const promise = (async (): Promise<QuoteData> => {
    try {
      const data = await fetchQuoteFromChart(ticker);
      quoteCache.set(ticker, { data, expiresAt: Date.now() + CACHE_TTL });
      return data;
    } finally {
      inFlight.delete(ticker);
    }
  })();

  inFlight.set(ticker, promise);
  return promise;
}

async function fetchAll(tickers: string[]): Promise<QuoteData[]> {
  return Promise.all(
    tickers.map(async (ticker) => {
      try {
        return await fetchQuote(ticker);
      } catch (err) {
        console.error(`[stocks] ${ticker}:`, (err as Error).message);
        return { ticker, price: null, prevClose: null, changePct: null, updatedAt: null };
      }
    })
  );
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

  const now = Date.now();
  const uncached = tickers.filter((t) => {
    const c = quoteCache.get(t);
    return !c || c.expiresAt <= now;
  });

  if (uncached.length > 0) await fetchAll(uncached);

  const data = tickers.map((ticker) => {
    const cached = quoteCache.get(ticker);
    return cached?.data ?? { ticker, price: null, prevClose: null, changePct: null, updatedAt: null };
  });

  return NextResponse.json(data);
}
