'use client';

import { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import type { FundConfig, StockQuote, HoldingWithData, TickerSeries, NavRecord, NavRow } from '@/lib/types';
import HoldingsTable from './HoldingsTable';
import InsightsPanel from './InsightsPanel';
import NavChart from './NavChart';
import ActualNavEntry from './ActualNavEntry';
import NavHistory from './NavHistory';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function calculateFundChange(
  holdings: FundConfig['holdings'],
  quotes: StockQuote[],
  totalWeight: number
): number {
  const contributions = holdings
    .map((h) => {
      const q = quotes.find((q) => q.ticker === h.ticker);
      if (q?.changePct == null) return null;
      return (q.changePct * h.weight) / 100;
    })
    .filter((v): v is number => v !== null);

  if (!contributions.length) return 0;
  const weightedSum = contributions.reduce((a, b) => a + b, 0);
  return (weightedSum / totalWeight) * 100;
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export default function FundView({ fund }: { fund: FundConfig }) {
  const tickers = fund.holdings.map((h) => h.ticker).join(',');

  const { data: quotes, mutate, isLoading } = useSWR<StockQuote[]>(
    `/api/stocks?tickers=${tickers}`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false }
  );

  const { data: series, mutate: mutateSeries } = useSWR<TickerSeries[]>(
    `/api/stocks/series?tickers=${tickers}`,
    fetcher,
    { refreshInterval: 120_000, revalidateOnFocus: false }
  );

  const { data: navRows, mutate: mutateRecords } = useSWR<NavRow[]>(
    `/api/nav-records?fund_id=${fund.id}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const [nav, setNav] = useState(fund.defaultNav);

  useEffect(() => {
    if (navRows && navRows.length > 0) setNav(Number(navRows[0].actual_nav));
  }, [navRows]);

  const saveRecord = useCallback(
    async (record: NavRecord) => {
      const res = await fetch('/api/nav-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fund_id: record.fundId,
          date: record.date,
          actual_nav: record.actualNav,
          estimated_nav: record.estimatedNav,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await mutateRecords();
    },
    [mutateRecords]
  );

  const deleteRecord = useCallback(
    async (date: string) => {
      await fetch(`/api/nav-records?fund_id=${fund.id}&date=${date}`, { method: 'DELETE' });
      mutateRecords();
    },
    [fund.id, mutateRecords]
  );


  const fundChange = quotes
    ? calculateFundChange(fund.holdings, quotes, fund.totalTop10Weight)
    : 0;
  const estimatedNav = nav * (1 + fundChange / 100);
  const isPositive = fundChange > 0;
  const isNegative = fundChange < 0;

  const holdingsWithData: HoldingWithData[] = fund.holdings.map((h) => {
    const q = quotes?.find((q) => q.ticker === h.ticker);
    return {
      ...h,
      price: q?.price ?? null,
      changePct: q?.changePct ?? null,
      updatedAt: q?.updatedAt ?? null,
    };
  });

  const mostRecentRow = navRows?.[0];

  return (
    <div className="space-y-3">

      {/* Official NAV + entry combined */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            {mostRecentRow ? (
              <>
                <span className="text-3xl font-bold text-gray-900 tabular-nums">
                  ${Number(mostRecentRow.actual_nav).toFixed(2)}
                </span>
                <span className="text-base text-gray-400 ml-2">
                  — last official NAV price from{' '}
                  {new Date(`${mostRecentRow.date}T12:00:00`).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </>
            ) : (
              <span className="text-base text-gray-400">No entries yet — log one below</span>
            )}
          </div>
        </div>
        <div className="px-4 py-3">
          <ActualNavEntry fundId={fund.id} estimatedNav={estimatedNav} onSave={saveRecord} />
        </div>
      </div>

      {/* Estimated NAV */}
      <div className="bg-white rounded-xl border-2 border-gray-900 p-4">
        <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
          <span className="text-4xl font-bold text-gray-900 tabular-nums">
            ${estimatedNav.toFixed(2)}
          </span>
          <span className="text-base text-gray-400">
            &mdash; estimated from today&apos;s market from {' '}
            {mostRecentRow
              ? `$${Number(mostRecentRow.actual_nav).toFixed(2)} on ${new Date(`${mostRecentRow.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}`
              : ''}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <div
            className={`flex items-center gap-1.5 text-base font-semibold ${
              isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-400'
            }`}
          >
            <span>{isPositive ? '+' : ''}{fundChange.toFixed(3)}%</span>
            <span className="text-sm font-normal text-gray-400">
              · top {fund.holdings.length} holdings
            </span>
          </div>
        </div>
      </div>

      {/* Refresh */}
      <button
        onClick={() => { mutate(); mutateSeries(); }}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 min-h-[44px] py-2.5 border border-gray-200 bg-white rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
      >
        <RefreshIcon spinning={isLoading} />
        {isLoading ? 'Refreshing…' : 'Refresh Prices'}
      </button>

      {/* Holdings table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-900">Top 10 Holdings</h2>
          <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
            {fund.totalTop10Weight}% of fund
          </span>
        </div>
        {isLoading && !quotes ? (
          <div className="bg-white rounded-xl border border-gray-200 py-8 text-center text-gray-400 text-sm">
            Loading prices…
          </div>
        ) : (
          <HoldingsTable holdings={holdingsWithData} />
        )}
      </div>

      {/* Insights */}
      {quotes && (
        <InsightsPanel
          holdings={holdingsWithData}
          fundChange={fundChange}
          officialNav={nav}
          estimatedNav={estimatedNav}
          totalTop10Weight={fund.totalTop10Weight}
        />
      )}

      {/* Intraday chart */}
      {series && series.length > 0 && (
        <NavChart
          holdings={fund.holdings}
          series={series}
          officialNav={nav}
          totalTop10Weight={fund.totalTop10Weight}
        />
      )}

      {/* Estimated vs actual history */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Estimated vs Actual NAV</h2>
        <NavHistory records={navRows} onDelete={deleteRecord} />
      </div>

      <p className="text-xs text-gray-400 text-center pb-6">
        Estimate only · Not investment advice
      </p>
    </div>
  );
}
