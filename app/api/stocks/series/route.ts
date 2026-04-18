import { NextRequest, NextResponse } from 'next/server';
import type { TickerSeries } from '@/lib/types';

export const dynamic = 'force-dynamic';

declare global {
  // eslint-disable-next-line no-var
  var _seriesCache: Map<string, { data: TickerSeries; expiresAt: number }> | undefined;
  // eslint-disable-next-line no-var
  var _seriesInFlight: Map<string, Promise<TickerSeries>> | undefined;
}

const seriesCache = (globalThis._seriesCache ??= new Map());
const inFlight = (globalThis._seriesInFlight ??= new Map());
// 5-min bars — refresh every 2 min so a new bar lands within one refresh cycle
const CACHE_TTL = 120_000;

async function fetchSeries(ticker: string): Promise<TickerSeries> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=5m&range=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('No chart data');

  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  const prevClose: number | null =
    result.meta?.chartPreviousClose ?? result.meta?.previousClose ?? null;

  return { ticker, prevClose, timestamps, closes };
}

async function getSeries(ticker: string): Promise<TickerSeries> {
  const cached = seriesCache.get(ticker);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const existing = inFlight.get(ticker);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const data = await fetchSeries(ticker);
      seriesCache.set(ticker, { data, expiresAt: Date.now() + CACHE_TTL });
      return data;
    } finally {
      inFlight.delete(ticker);
    }
  })();

  inFlight.set(ticker, promise);
  return promise;
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

  const data = await Promise.all(
    tickers.map(async (ticker) => {
      try {
        return await getSeries(ticker);
      } catch (err) {
        console.error(`[series] ${ticker}:`, (err as Error).message);
        return { ticker, prevClose: null, timestamps: [], closes: [] } satisfies TickerSeries;
      }
    })
  );

  return NextResponse.json(data);
}
