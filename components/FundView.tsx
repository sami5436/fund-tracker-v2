'use client';

import { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import type { FundConfig, StockQuote, HoldingWithData, TickerSeries } from '@/lib/types';
import HoldingsTable from './HoldingsTable';
import InsightsPanel from './InsightsPanel';
import NavChart from './NavChart';

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
  // Scale to full fund assuming unobserved holdings move proportionally
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

  // Use string state so the input handles partial values like "73."
  const [navInput, setNavInput] = useState(fund.defaultNav.toFixed(2));
  const [nav, setNav] = useState(fund.defaultNav);
  const [navUpdated, setNavUpdated] = useState<string | null>(null);
  const [clockTime, setClockTime] = useState('');
  const [clockDate, setClockDate] = useState('');

  // Load NAV from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(fund.navStorageKey);
    if (stored) {
      const v = parseFloat(stored);
      if (!isNaN(v) && v > 0) {
        setNav(v);
        setNavInput(stored);
      }
    }
  }, [fund.navStorageKey]);

  // Live clock (updates every 30s — sufficient for display)
  useEffect(() => {
    function tick() {
      const now = new Date();
      setClockTime(
        now.toLocaleTimeString('en-US', {
          timeZone: 'America/Chicago',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }) + ' CST'
      );
      setClockDate(
        now.toLocaleDateString('en-US', {
          timeZone: 'America/Chicago',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      );
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const handleNavChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setNavInput(raw);
      const parsed = parseFloat(raw);
      if (!isNaN(parsed) && parsed > 0) {
        setNav(parsed);
        localStorage.setItem(fund.navStorageKey, raw);
        setNavUpdated(
          new Date().toLocaleString('en-US', {
            timeZone: 'America/Chicago',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })
        );
      }
    },
    [fund.navStorageKey]
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

  return (
    <div className="space-y-4">
      {/* NAV Input */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
          Last Official NAV
        </label>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400 font-medium">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={navInput}
            onChange={handleNavChange}
            className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {navUpdated && (
            <span className="text-xs text-gray-400 ml-1">Set {navUpdated}</span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">Updates ~11 PM CST each trading day</p>
      </div>

      {/* Primary metric — Estimated NAV */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Estimated NAV</p>
        <p className="text-4xl font-bold text-gray-900 tabular-nums mt-1.5">
          ${estimatedNav.toFixed(2)}
        </p>
        <div
          className={`flex items-center gap-1.5 mt-2 text-sm font-semibold ${
            isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-400'
          }`}
        >
          <span className="text-base">{isPositive ? '▲' : isNegative ? '▼' : '—'}</span>
          <span>
            {isPositive ? '+' : ''}
            {fundChange.toFixed(3)}%
          </span>
          <span className="text-xs font-normal text-gray-400">
            · top {fund.holdings.length} holdings
          </span>
        </div>
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
            Official NAV
          </p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">${nav.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
            As of
          </p>
          <p className="text-sm font-semibold text-gray-900">{clockTime}</p>
          <p className="text-xs text-gray-400 mt-0.5">{clockDate}</p>
        </div>
      </div>

      {/* Intraday chart */}
      {series && series.length > 0 && (
        <NavChart
          holdings={fund.holdings}
          series={series}
          officialNav={nav}
          totalTop10Weight={fund.totalTop10Weight}
        />
      )}

      {/* Refresh */}
      <button
        onClick={() => {
          mutate();
          mutateSeries();
        }}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 py-3 border border-gray-200 bg-white rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshIcon spinning={isLoading} />
        {isLoading ? 'Refreshing…' : 'Refresh Prices'}
      </button>

      {/* Holdings table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Top 10 Holdings</h2>
          <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
            {fund.totalTop10Weight}% of fund
          </span>
        </div>

        {isLoading && !quotes ? (
          <div className="bg-white rounded-xl border border-gray-200 py-10 text-center text-gray-400 text-sm">
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

      <p className="text-xs text-gray-400 text-center pb-6">
        Estimate only · Not investment advice
      </p>
    </div>
  );
}
