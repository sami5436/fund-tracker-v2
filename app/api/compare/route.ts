import { NextRequest, NextResponse } from 'next/server';
import type { CompareAsset, ComparePoint } from '@/lib/compare';

export const dynamic = 'force-dynamic';

declare global {
  // eslint-disable-next-line no-var
  var _compareCache: Map<string, { data: CompareAsset; expiresAt: number }> | undefined;
  // eslint-disable-next-line no-var
  var _compareInFlight: Map<string, Promise<CompareAsset>> | undefined;
}

const cache = (globalThis._compareCache ??= new Map());
const inFlight = (globalThis._compareInFlight ??= new Map());
const CACHE_TTL = 6 * 60 * 60 * 1000;
const MAX_SYMBOLS = 7;

async function fetchAsset(symbol: string): Promise<CompareAsset> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - Math.floor(25 * 365.25 * 24 * 60 * 60);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${period1}&period2=${period2}&interval=1d&events=div%2Csplits`;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const json = await response.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description ?? 'No chart data');

  const timestamps: number[] = result.timestamp ?? [];
  const adjusted: (number | null)[] =
    result.indicators?.adjclose?.[0]?.adjclose ??
    result.indicators?.quote?.[0]?.close ??
    [];
  const points: ComparePoint[] = [];

  for (let index = 0; index < timestamps.length; index++) {
    const price = adjusted[index];
    if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
      points.push({
        date: new Date(timestamps[index] * 1000).toISOString().slice(0, 10),
        price,
      });
    }
  }

  return {
    symbol,
    name: result.meta?.longName ?? result.meta?.shortName ?? symbol,
    quoteType: result.meta?.instrumentType ?? 'Asset',
    points,
  };
}

async function getAsset(symbol: string): Promise<CompareAsset> {
  const cached = cache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const existing = inFlight.get(symbol);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const data = await fetchAsset(symbol);
      cache.set(symbol, { data, expiresAt: Date.now() + CACHE_TTL });
      return data;
    } finally {
      inFlight.delete(symbol);
    }
  })();

  inFlight.set(symbol, promise);
  return promise;
}

export async function GET(request: NextRequest) {
  const symbols = Array.from(
    new Set(
      (request.nextUrl.searchParams.get('tickers') ?? '')
        .split(',')
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean)
    )
  );

  if (!symbols.length) {
    return NextResponse.json({ error: 'tickers required' }, { status: 400 });
  }
  if (symbols.length > MAX_SYMBOLS) {
    return NextResponse.json({ error: `maximum ${MAX_SYMBOLS} tickers` }, { status: 400 });
  }
  if (symbols.some((symbol) => !/^[A-Z0-9.^=-]{1,15}$/.test(symbol))) {
    return NextResponse.json({ error: 'invalid ticker' }, { status: 400 });
  }

  const assets = await Promise.all(
    symbols.map(async (symbol): Promise<CompareAsset> => {
      try {
        return await getAsset(symbol);
      } catch (error) {
        console.error(`[compare] ${symbol}:`, (error as Error).message);
        return {
          symbol,
          name: symbol,
          quoteType: 'Unknown',
          points: [],
          error: 'Could not load price history',
        };
      }
    })
  );

  return NextResponse.json({ assets });
}
