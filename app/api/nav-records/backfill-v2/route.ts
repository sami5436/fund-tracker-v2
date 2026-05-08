import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { FUNDS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

interface ChartResponse {
  chart: {
    result?: Array<{
      timestamp: number[];
      indicators: { quote: Array<{ close: (number | null)[] }> };
    }>;
    error?: { description: string } | null;
  };
}

// Daily closes for one ticker, indexed by YYYY-MM-DD (UTC date of the bar timestamp).
// US daily bars are timestamped at market open (9:30 ET), so the UTC date matches the trading date.
async function fetchHistoricalCloses(
  ticker: string,
  startUnix: number,
  endUnix: number
): Promise<Map<string, number>> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&period1=${startUnix}&period2=${endUnix}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as ChartResponse;
  const result = json.chart.result?.[0];
  if (!result) throw new Error('no chart result');

  const closes = result.indicators.quote[0]?.close ?? [];
  const map = new Map<string, number>();
  result.timestamp.forEach((ts, i) => {
    const close = closes[i];
    if (close == null) return;
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    map.set(date, close);
  });
  return map;
}

function prevTradingClose(map: Map<string, number>, dateStr: string): number | null {
  const d = new Date(`${dateStr}T12:00:00Z`);
  for (let i = 0; i < 10; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    const key = d.toISOString().slice(0, 10);
    if (map.has(key)) return map.get(key)!;
  }
  return null;
}

interface BackfillResult {
  date: string;
  status: 'updated' | 'skipped' | 'error';
  reason?: string;
  estimated_nav_v2?: number;
}

export async function POST(req: NextRequest) {
  const fundId = req.nextUrl.searchParams.get('fund_id');
  if (!fundId) {
    return NextResponse.json({ error: 'fund_id required' }, { status: 400 });
  }

  const fund = FUNDS.find((f) => f.id === fundId);
  if (!fund) {
    return NextResponse.json({ error: `unknown fund_id: ${fundId}` }, { status: 404 });
  }
  if (!fund.residualProxy) {
    return NextResponse.json(
      { error: `fund ${fundId} has no residualProxy configured — cannot compute v2` },
      { status: 400 }
    );
  }

  const { data: rows, error: loadErr } = await supabase
    .from('nav_records')
    .select('id, date, actual_nav')
    .eq('fund_id', fundId)
    .order('date', { ascending: true });

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!rows || rows.length < 2) {
    return NextResponse.json(
      { error: 'need at least 2 rows to backfill (first row has no prior baseline)' },
      { status: 400 }
    );
  }

  // Pull a date window covering all rows + buffer for prev-day lookback.
  const firstDate = rows[0].date;
  const lastDate = rows[rows.length - 1].date;
  const startBuffer = new Date(`${firstDate}T12:00:00Z`);
  startBuffer.setUTCDate(startBuffer.getUTCDate() - 14);
  const endBuffer = new Date(`${lastDate}T12:00:00Z`);
  endBuffer.setUTCDate(endBuffer.getUTCDate() + 2);
  const startUnix = Math.floor(startBuffer.getTime() / 1000);
  const endUnix = Math.floor(endBuffer.getTime() / 1000);

  const tickers = [...fund.holdings.map((h) => h.ticker), fund.residualProxy];
  const closesByTicker = new Map<string, Map<string, number>>();

  for (const ticker of tickers) {
    try {
      const map = await fetchHistoricalCloses(ticker, startUnix, endUnix);
      closesByTicker.set(ticker, map);
    } catch (err) {
      return NextResponse.json(
        { error: `failed to fetch ${ticker}: ${(err as Error).message}` },
        { status: 502 }
      );
    }
  }

  const residualWeight = 1 - fund.totalTop10Weight / 100;
  const proxyTicker = fund.residualProxy;
  const proxyMap = closesByTicker.get(proxyTicker);
  if (!proxyMap) {
    return NextResponse.json({ error: `no closes loaded for proxy ${proxyTicker}` }, { status: 500 });
  }

  const results: BackfillResult[] = [];

  // Skip i=0 — no prior row in DB to use as baseline.
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const prior = rows[i - 1];
    const date = row.date;

    let top10Contribution = 0;
    let missing: string | null = null;

    for (const h of fund.holdings) {
      const map = closesByTicker.get(h.ticker);
      if (!map) {
        missing = h.ticker;
        break;
      }
      const todayClose = map.get(date);
      const prevClose = prevTradingClose(map, date);
      if (todayClose == null || prevClose == null || prevClose === 0) {
        missing = h.ticker;
        break;
      }
      const changePct = ((todayClose - prevClose) / prevClose) * 100;
      top10Contribution += (changePct * h.weight) / 100;
    }

    if (missing) {
      results.push({ date, status: 'skipped', reason: `missing close for ${missing}` });
      continue;
    }

    const proxyTodayClose = proxyMap.get(date);
    const proxyPrevClose = prevTradingClose(proxyMap, date);
    if (proxyTodayClose == null || proxyPrevClose == null || proxyPrevClose === 0) {
      results.push({ date, status: 'skipped', reason: `missing close for ${proxyTicker}` });
      continue;
    }
    const proxyChangePct = ((proxyTodayClose - proxyPrevClose) / proxyPrevClose) * 100;

    const v2Change = top10Contribution + residualWeight * proxyChangePct;
    const v2Nav = Number(prior.actual_nav) * (1 + v2Change / 100);
    const v2NavRounded = parseFloat(v2Nav.toFixed(4));

    const { error: updateErr } = await supabase
      .from('nav_records')
      .update({ estimated_nav_v2: v2NavRounded })
      .eq('id', row.id);

    if (updateErr) {
      results.push({ date, status: 'error', reason: updateErr.message });
    } else {
      results.push({ date, status: 'updated', estimated_nav_v2: v2NavRounded });
    }
  }

  const updated = results.filter((r) => r.status === 'updated').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const errored = results.filter((r) => r.status === 'error').length;

  return NextResponse.json({
    fund_id: fundId,
    proxy: proxyTicker,
    rows_total: rows.length,
    first_row_skipped: { date: rows[0].date, reason: 'no prior baseline' },
    updated,
    skipped,
    errored,
    results,
  });
}
