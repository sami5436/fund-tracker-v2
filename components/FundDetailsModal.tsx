'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import type { FidelityFund, StockQuote } from '@/lib/types';

interface HistoryPoint {
  t: number;
  price: number;
}

interface HistoryResponse {
  ticker: string;
  range: string;
  points: HistoryPoint[];
  startDate: string | null;
  endDate: string | null;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

const RANGE_OPTIONS: { label: string; value: string }[] = [
  { label: '1Y', value: '1y' },
  { label: '5Y', value: '5y' },
  { label: '10Y', value: '10y' },
  { label: 'Max', value: 'max' },
];

function formatAum(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

function formatPct(n: number | null, withSign = false): string {
  if (n == null) return '—';
  const sign = withSign && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function formatMoney(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function GrowthChart({
  points,
  height = 200,
}: {
  points: HistoryPoint[];
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <div className="text-xs text-gray-400 italic py-8 text-center">
        Not enough history to chart.
      </div>
    );
  }

  const W = 600;
  const H = height;
  const PAD = { top: 8, right: 8, bottom: 22, left: 8 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const base = points[0].price;
  const values = points.map((p) => (10000 * p.price) / base);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - ((v - min) / range) * innerH;

  let pathD = `M ${x(0)} ${y(values[0])}`;
  for (let i = 1; i < values.length; i++) pathD += ` L ${x(i)} ${y(values[i])}`;

  const areaD = `${pathD} L ${x(values.length - 1)} ${PAD.top + innerH} L ${x(0)} ${PAD.top + innerH} Z`;

  const finalValue = values[values.length - 1];
  const growthPct = ((finalValue - 10000) / 10000) * 100;
  const positive = finalValue >= 10000;

  // x-axis year labels — pick ~4-6 evenly spaced
  const labelCount = Math.min(5, points.length);
  const labels: { x: number; year: string }[] = [];
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.round((i / (labelCount - 1)) * (points.length - 1));
    const year = new Date(points[idx].t * 1000).getFullYear().toString();
    labels.push({ x: x(idx), year });
  }

  const stroke = positive ? '#16a34a' : '#dc2626';
  const fill = positive ? 'rgba(22,163,74,0.10)' : 'rgba(220,38,38,0.10)';

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div>
          <div className="text-xs text-gray-500">$10,000 today is worth</div>
          <div className="text-2xl font-bold text-gray-900 tabular-nums">
            {formatMoney(finalValue)}
          </div>
        </div>
        <div
          className={`text-sm font-semibold tabular-nums ${
            positive ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {growthPct > 0 ? '+' : ''}
          {growthPct.toFixed(1)}%
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-auto"
        style={{ maxHeight: H }}
      >
        <path d={areaD} fill={fill} />
        <path d={pathD} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
        {/* x-axis tick labels */}
        {labels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={H - 6}
            fontSize={11}
            fill="#9ca3af"
            textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}
          >
            {l.year}
          </text>
        ))}
      </svg>
    </div>
  );
}

export default function FundDetailsModal({
  fund,
  onClose,
}: {
  fund: FidelityFund;
  onClose: () => void;
}) {
  const [range, setRange] = useState('10y');

  const { data: history, isLoading: histLoading } = useSWR<HistoryResponse>(
    `/api/fund-history?ticker=${fund.ticker}&range=${range}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60 * 60 * 1000 }
  );

  const { data: quotes } = useSWR<StockQuote[]>(
    `/api/stocks?tickers=${fund.ticker}`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false }
  );
  const quote = quotes?.[0];

  // Esc key closes; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/50 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-lg sm:shadow-xl overflow-hidden flex flex-col max-h-screen sm:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (sticky) */}
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-200 shrink-0">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-mono font-bold text-base text-gray-900">{fund.ticker}</span>
              {fund.morningstarRating != null && (
                <span className="text-xs text-amber-600">
                  {'★'.repeat(fund.morningstarRating)}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-700 leading-snug">{fund.name}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {fund.category ?? '—'}
              {fund.family ? ` · ${fund.family}` : ''}
            </p>
          </div>
          <div className="flex items-start gap-3 shrink-0">
            {quote?.price != null && (
              <div className="border border-gray-300 rounded px-2 py-0.5 flex flex-col items-end leading-tight">
                <div className="text-base font-bold text-gray-900 tabular-nums">
                  ${quote.price.toFixed(2)}
                </div>
                {quote.changePct != null && (
                  <div
                    className={`text-xs font-medium tabular-nums ${
                      quote.changePct > 0
                        ? 'text-green-600'
                        : quote.changePct < 0
                          ? 'text-red-600'
                          : 'text-gray-500'
                    }`}
                  >
                    {quote.changePct > 0 ? '+' : ''}
                    {quote.changePct.toFixed(2)}%
                  </div>
                )}
              </div>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-gray-400 hover:text-gray-700 p-1 -m-1"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body (scrollable) */}
        <div className="overflow-y-auto flex-1 overscroll-contain">
          {/* Growth chart */}
          <section className="px-4 py-4 border-b border-gray-100">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Growth of $10,000
              </h3>
              <div className="flex gap-1">
                {RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setRange(opt.value)}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded ${
                      range === opt.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {histLoading && (
              <div className="text-xs text-gray-400 italic py-8 text-center">Loading chart…</div>
            )}
            {!histLoading && history && history.points.length > 0 && (
              <GrowthChart points={history.points} />
            )}
            {!histLoading && (!history || history.points.length === 0) && (
              <div className="text-xs text-gray-400 italic py-8 text-center">
                No price history available for this fund.
              </div>
            )}
          </section>

          {/* Returns */}
          <section className="px-4 py-4 border-b border-gray-100">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Returns
            </h3>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: 'YTD', value: fund.ytdReturn },
                { label: '1Y', value: fund.return1Y },
                { label: '5Y', value: fund.return5Y },
                { label: '10Y', value: fund.return10Y },
              ].map((r) => (
                <div key={r.label} className="bg-gray-50 rounded-md py-2">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">{r.label}</div>
                  <div
                    className={`text-sm font-bold tabular-nums ${
                      r.value == null
                        ? 'text-gray-400'
                        : r.value > 0
                          ? 'text-green-600'
                          : r.value < 0
                            ? 'text-red-600'
                            : 'text-gray-700'
                    }`}
                  >
                    {formatPct(r.value, true)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Key metrics */}
          <section className="px-4 py-4 border-b border-gray-100">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Key Metrics
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              <Stat label="Expense Ratio" value={formatPct(fund.expenseRatio)} />
              <Stat label="Fund Assets" value={formatAum(fund.totalAssets)} />
              <Stat label="Yield" value={formatPct(fund.yield)} />
              <Stat label="Beta (5Y)" value={fund.beta != null ? fund.beta.toFixed(2) : '—'} />
              <Stat label="Turnover" value={formatPct(fund.turnover)} />
              <Stat
                label="Risk Rating"
                value={fund.riskRating != null ? `${fund.riskRating} / 5` : '—'}
              />
              <Stat
                label="52-Week Low"
                value={fund.low52 != null ? `$${fund.low52.toFixed(2)}` : '—'}
              />
              <Stat
                label="52-Week High"
                value={fund.high52 != null ? `$${fund.high52.toFixed(2)}` : '—'}
              />
              {fund.inceptionDate && (
                <Stat label="Inception" value={fund.inceptionDate} />
              )}
            </dl>
          </section>

          {/* Top 10 holdings */}
          <section className="px-4 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Top 10 Holdings
            </h3>
            {fund.holdings.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No holdings data available.</p>
            ) : (
              <ol className="space-y-1.5">
                {fund.holdings.map((h, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 text-sm text-gray-700"
                  >
                    <span className="text-gray-400 w-5 text-right tabular-nums text-xs">
                      {i + 1}.
                    </span>
                    <span
                      className={`font-mono font-bold w-16 shrink-0 text-xs ${
                        h.ticker ? '' : 'text-gray-400'
                      }`}
                    >
                      {h.ticker || '—'}
                    </span>
                    <span className="flex-1 truncate text-gray-600 text-xs">
                      {h.name || '(unnamed)'}
                    </span>
                    <span className="tabular-nums font-semibold w-14 text-right text-xs">
                      {h.weight.toFixed(2)}%
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-500 text-xs">{label}</dt>
      <dd className="text-gray-900 font-medium tabular-nums text-right">{value}</dd>
    </div>
  );
}
