'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import type { FundConfig, StockQuote, HoldingWithData, TickerSeries, NavRecord, NavRow } from '@/lib/types';
import HoldingsTable from './HoldingsTable';
import InsightsPanel from './InsightsPanel';
import NavChart from './NavChart';
import ActualNavEntry from './ActualNavEntry';
import NavHistory from './NavHistory';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// v1: scale top-10 weighted change up to 100% (assumes residual moves like top-10)
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

function weightedContribution(holdings: FundConfig['holdings'], quotes: StockQuote[]): number {
  return holdings.reduce((sum, h) => {
    const q = quotes.find((q) => q.ticker === h.ticker);
    if (q?.changePct == null) return sum;
    return sum + (q.changePct * h.weight) / 100;
  }, 0);
}

// v2: top-10 contribution + (1 - top10) × proxy ETF change.
// If proxyExclusionHoldings is configured, first remove that basket from the proxy.
function calculateFundChangeV2(
  holdings: FundConfig['holdings'],
  quotes: StockQuote[],
  totalWeight: number,
  proxyTicker: string,
  proxyExclusionHoldings?: FundConfig['proxyExclusionHoldings']
): number | null {
  const proxyQuote = quotes.find((q) => q.ticker === proxyTicker);
  if (proxyQuote?.changePct == null) return null;

  const top10Contribution = weightedContribution(holdings, quotes);
  const residualWeight = 1 - totalWeight / 100;
  let residualChangePct = proxyQuote.changePct;

  if (proxyExclusionHoldings?.length) {
    const proxyExclusionContribution = weightedContribution(proxyExclusionHoldings, quotes);
    const proxyExclusionWeight = proxyExclusionHoldings.reduce((sum, h) => sum + h.weight, 0) / 100;
    if (proxyExclusionWeight >= 1) return null;
    residualChangePct = (proxyQuote.changePct - proxyExclusionContribution) / (1 - proxyExclusionWeight);
  }

  return top10Contribution + residualWeight * residualChangePct;
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
  const holdingTickers = fund.holdings.map((h) => h.ticker);
  const proxyExclusionTickers = fund.proxyExclusionHoldings?.map((h) => h.ticker) ?? [];
  const quoteTickers = fund.residualProxy
    ? Array.from(new Set([...holdingTickers, fund.residualProxy, ...proxyExclusionTickers]))
    : holdingTickers;
  const tickers = quoteTickers.join(',');
  const seriesTickers = holdingTickers.join(',');

  const { data: quotes, mutate, isLoading } = useSWR<StockQuote[]>(
    `/api/stocks?tickers=${tickers}`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false }
  );

  const { data: series, mutate: mutateSeries } = useSWR<TickerSeries[]>(
    `/api/stocks/series?tickers=${seriesTickers}`,
    fetcher,
    { refreshInterval: 120_000, revalidateOnFocus: false }
  );

  const { data: navRows, mutate: mutateRecords } = useSWR<NavRow[]>(
    `/api/nav-records?fund_id=${fund.id}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const [nav, setNav] = useState(fund.defaultNav);

  // Header + baseline: most recent entry strictly before today's CST date.
  // (So all of Thursday → Wednesday's row, even if Thursday is already logged.)
  const mostRecentRow = useMemo(() => {
    if (!navRows || navRows.length === 0) return undefined;
    const todayCST = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    return navRows.find((r) => r.date < todayCST);
  }, [navRows]);

  useEffect(() => {
    if (mostRecentRow) setNav(Number(mostRecentRow.actual_nav));
  }, [mostRecentRow]);

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
          estimated_nav_v2: record.estimatedNavV2 ?? null,
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

  const fundChangeV2 = quotes && fund.residualProxy
    ? calculateFundChangeV2(
        fund.holdings,
        quotes,
        fund.totalTop10Weight,
        fund.residualProxy,
        fund.proxyExclusionHoldings
      )
    : null;
  const estimatedNavV2 = fundChangeV2 != null ? nav * (1 + fundChangeV2 / 100) : null;
  const primaryFundChange = fundChangeV2 ?? fundChange;
  const primaryEstimatedNav = estimatedNavV2 ?? estimatedNav;
  const isPrimaryPositive = primaryFundChange > 0;
  const isPrimaryNegative = primaryFundChange < 0;
  const usingProxyEstimate = fundChangeV2 != null && estimatedNavV2 != null;

  const holdingsWithData: HoldingWithData[] = fund.holdings.map((h) => {
    const q = quotes?.find((q) => q.ticker === h.ticker);
    return {
      ...h,
      price: q?.price ?? null,
      changePct: q?.changePct ?? null,
      updatedAt: q?.updatedAt ?? null,
    };
  });

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
          <ActualNavEntry
            fundId={fund.id}
            estimatedNav={estimatedNav}
            estimatedNavV2={estimatedNavV2}
            onSave={saveRecord}
          />
        </div>
      </div>

      {/* Estimated NAV */}
      <div className="bg-white rounded-xl border-2 border-gray-900 p-4">
        <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
          <span className="text-4xl font-bold text-gray-900 tabular-nums">
            ${primaryEstimatedNav.toFixed(2)}
          </span>
          {usingProxyEstimate && (
            <span className="inline-flex items-center text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
              proxy adjusted
            </span>
          )}
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
              isPrimaryPositive ? 'text-green-600' : isPrimaryNegative ? 'text-red-600' : 'text-gray-400'
            }`}
          >
            <span>{isPrimaryPositive ? '+' : ''}{primaryFundChange.toFixed(3)}%</span>
            <span className="text-sm font-normal text-gray-400">
              {usingProxyEstimate
                ? `· top ${fund.holdings.length} + ${fund.residualProxy} residual`
                : `· top ${fund.holdings.length} holdings`}
            </span>
          </div>
        </div>
      </div>

      {/* Estimated NAV v1 — proportional top-10 scale, shown as a comparison when proxy estimate exists */}
      {usingProxyEstimate && (
        <div className="bg-white rounded-xl border border-gray-300 border-dashed p-4">
          <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
            <span className="text-3xl font-bold text-gray-900 tabular-nums">
              ${estimatedNav.toFixed(2)}
            </span>
            <span className="inline-flex items-center text-[10px] font-semibold text-gray-600 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
              v1
            </span>
            <span className="text-sm text-gray-400">
              &mdash; proportional top-{fund.holdings.length} scale
            </span>
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <div
              className={`flex items-center gap-1.5 text-sm font-semibold ${
                isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-400'
              }`}
            >
              <span>{isPositive ? '+' : ''}{fundChange.toFixed(3)}%</span>
              <span className="text-xs font-normal text-gray-400">
                · assumes the unknown {(100 - fund.totalTop10Weight).toFixed(2)}% moves like the top holdings
              </span>
            </div>
          </div>
        </div>
      )}

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
          officialNav={nav}
          estimatedNav={primaryEstimatedNav}
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

      {/* Math explainer */}
      <details className="bg-white rounded-xl border border-gray-200 group">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 select-none flex items-center justify-between hover:bg-gray-50 rounded-xl">
          <span>How is this calculated?</span>
          <svg
            className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </summary>
        <div className="px-4 pb-4 text-sm text-gray-600 space-y-3 border-t border-gray-100 pt-3">
          <p>
            We can&apos;t see {fund.name}&apos;s full holdings — only the top 10
            ({fund.totalTop10Weight}% of the fund). The other{' '}
            <span className="font-semibold">{(100 - fund.totalTop10Weight).toFixed(2)}%</span>{' '}
            is unknown. So we estimate it.
          </p>

          <div>
            <p className="font-semibold text-gray-800 mb-1">Step 1 — Top 10 contribution</p>
            <p>
              For each top-10 stock, multiply today&apos;s % change by its weight in the fund, then
              add them up. (e.g. NVDA up 1% × 11.75% weight = 0.118% of fund move.)
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-800 mb-1">Step 2 — Fill in the unknown</p>
            <p className="mb-1">
              <span className="inline-block px-1.5 py-0.5 mr-1 text-[10px] font-semibold rounded bg-gray-100 text-gray-600">v1</span>
              Pretend the unknown {(100 - fund.totalTop10Weight).toFixed(2)}% moves the same way as
              the top 10 — just scale the top-10 change up to 100%.
            </p>
            {fund.residualProxy && (
              <p>
                <span className="inline-block px-1.5 py-0.5 mr-1 text-[10px] font-semibold rounded bg-blue-50 text-blue-700 border border-blue-200">v2</span>
                Use {fund.residualProxy} as a stand-in for the unknown chunk.{' '}
                {fund.proxyExclusionHoldings?.length
                  ? `First remove the directly modeled holdings from ${fund.residualProxy}, then take that adjusted % change × ${(100 - fund.totalTop10Weight).toFixed(2)}% and add it to the top-10 contribution.`
                  : `Take its % change × ${(100 - fund.totalTop10Weight).toFixed(2)}% and add it to the top-10 contribution.`}
              </p>
            )}
          </div>

          <div>
            <p className="font-semibold text-gray-800 mb-1">Step 3 — Apply to yesterday&apos;s NAV</p>
            <p className="font-mono text-xs bg-gray-50 px-2 py-1.5 rounded border border-gray-100">
              estimated NAV = yesterday&apos;s actual × (1 + today&apos;s % change)
            </p>
          </div>

          <p className="text-xs text-gray-400 pt-1">
            Prices come from Yahoo Finance and refresh every 60 seconds.
          </p>
        </div>
      </details>

      <p className="text-xs text-gray-400 text-center pb-6">
        Estimate only · Not investment advice
      </p>
    </div>
  );
}
