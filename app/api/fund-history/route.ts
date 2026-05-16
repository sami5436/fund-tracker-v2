import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface HistoryPoint {
  t: number;       // unix seconds
  price: number;   // adjusted close (treats dividends as reinvested)
}

interface HistoryResponse {
  ticker: string;
  range: string;
  points: HistoryPoint[];
  startDate: string | null;
  endDate: string | null;
}

declare global {
  // eslint-disable-next-line no-var
  var _historyCache: Map<string, { data: HistoryResponse; expiresAt: number }> | undefined;
  // eslint-disable-next-line no-var
  var _historyInFlight: Map<string, Promise<HistoryResponse>> | undefined;
}

const cache = (globalThis._historyCache ??= new Map());
const inFlight = (globalThis._historyInFlight ??= new Map());
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours — historical prices barely change

async function fetchHistory(ticker: string, range: string): Promise<HistoryResponse> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?interval=1mo&range=${encodeURIComponent(range)}&events=div`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('no chart data');

  const timestamps: number[] = result.timestamp ?? [];
  const adj: (number | null)[] =
    result.indicators?.adjclose?.[0]?.adjclose ??
    result.indicators?.quote?.[0]?.close ??
    [];

  const points: HistoryPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const price = adj[i];
    if (typeof price === 'number' && isFinite(price) && price > 0) {
      points.push({ t: timestamps[i], price });
    }
  }

  return {
    ticker,
    range,
    points,
    startDate: points.length ? new Date(points[0].t * 1000).toISOString() : null,
    endDate: points.length ? new Date(points[points.length - 1].t * 1000).toISOString() : null,
  };
}

async function getHistory(ticker: string, range: string): Promise<HistoryResponse> {
  const key = `${ticker}:${range}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.data;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const data = await fetchHistory(ticker, range);
      cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
      return data;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker')?.trim().toUpperCase();
  const range = request.nextUrl.searchParams.get('range')?.trim() ?? '10y';
  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });
  if (!/^[A-Z0-9.-]{1,10}$/.test(ticker)) {
    return NextResponse.json({ error: 'invalid ticker' }, { status: 400 });
  }
  if (!/^(1mo|3mo|6mo|1y|2y|5y|10y|ytd|max)$/.test(range)) {
    return NextResponse.json({ error: 'invalid range' }, { status: 400 });
  }

  try {
    const data = await getHistory(ticker, range);
    return NextResponse.json(data);
  } catch (err) {
    console.error(`[fund-history] ${ticker}:`, (err as Error).message);
    return NextResponse.json({ error: 'fetch failed', ticker, points: [] }, { status: 502 });
  }
}
