'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  annualizedVolatility,
  buildGrowthSeries,
  cagr,
  correlation,
  maxDrawdown,
  projectionCone,
  type CompareAsset,
  type CompareResponse,
} from '@/lib/compare';

const COLORS = ['#2563eb', '#059669', '#d97706', '#db2777', '#7c3aed', '#0891b2'];
const BENCHMARK_COLOR = '#64748b';
const STORAGE_KEY = 'fund_compare_symbols';
const DEFAULT_SYMBOLS = ['FOCPX', 'QQQ', 'FXAIX'];
const MAX_SELECTED = 6;

const QUICK_PICKS = [
  { symbol: 'FOCPX', label: 'Fidelity OTC' },
  { symbol: 'FXAIX', label: 'Fidelity 500' },
  { symbol: 'QQQ', label: 'Nasdaq 100' },
  { symbol: 'VOO', label: 'Vanguard 500' },
  { symbol: 'VTI', label: 'Total US' },
  { symbol: 'SCHD', label: 'Dividend' },
  { symbol: 'VXUS', label: 'International' },
  { symbol: 'FSELX', label: 'Semiconductors' },
];

const CRASH_WINDOWS = [
  {
    label: '2008 Financial Crisis',
    start: '2007-10-09',
    end: '2009-03-09',
  },
  {
    label: 'COVID Crash',
    start: '2020-02-19',
    end: '2020-03-23',
  },
  {
    label: '2022 Bear Market',
    start: '2022-01-03',
    end: '2022-10-12',
  },
  {
    label: '2025 Tariff Selloff',
    start: '2025-02-14',
    end: '2025-04-04',
  },
  {
    label: '2026 Iran Volatility',
    start: '2026-01-01',
    end: '2026-03-30',
  },
];

const fetcher = (url: string) =>
  fetch(url).then(async (response) => {
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
    return body;
  });

function formatPct(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value > 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;
}

function formatMoney(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function assetColor(index: number, benchmark: boolean): string {
  return benchmark ? BENCHMARK_COLOR : COLORS[index % COLORS.length];
}

function Metric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'neutral';
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p
        className={`mt-1 text-sm font-semibold tabular-nums ${
          tone === 'positive'
            ? 'text-emerald-600'
            : tone === 'negative'
              ? 'text-rose-600'
              : 'text-slate-800'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function GrowthChart({
  assets,
  years,
}: {
  assets: CompareAsset[];
  years: number;
}) {
  const rows = useMemo(() => buildGrowthSeries(assets, years), [assets, years]);
  if (rows.length < 2) {
    return <div className="py-16 text-center text-sm text-slate-400">Not enough common history.</div>;
  }

  const W = 920;
  const H = 330;
  const PAD = { top: 18, right: 18, bottom: 34, left: 64 };
  const allValues = rows.flatMap((row) => Object.values(row.values));
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const padding = Math.max((rawMax - rawMin) * 0.08, 100);
  const min = Math.max(0, rawMin - padding);
  const max = rawMax + padding;
  const x = (index: number) =>
    PAD.left + (index / Math.max(rows.length - 1, 1)) * (W - PAD.left - PAD.right);
  const y = (value: number) =>
    PAD.top + (1 - (value - min) / Math.max(max - min, 1)) * (H - PAD.top - PAD.bottom);
  const yTicks = Array.from({ length: 5 }, (_, index) => min + ((max - min) * index) / 4);
  const xIndexes = Array.from({ length: 5 }, (_, index) =>
    Math.round((index * (rows.length - 1)) / 4)
  );
  const last = rows[rows.length - 1];

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible" role="img">
        <title>Growth of ten thousand dollars</title>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="#e2e8f0"
              strokeDasharray="4 5"
            />
            <text
              x={PAD.left - 9}
              y={y(tick) + 4}
              textAnchor="end"
              fontSize="11"
              fill="#94a3b8"
            >
              ${(tick / 1000).toFixed(tick >= 10000 ? 0 : 1)}k
            </text>
          </g>
        ))}
        {assets.map((asset, index) => {
          const benchmark = asset.symbol === 'SPY';
          const path = rows
            .map((row, rowIndex) => {
              const value = row.values[asset.symbol];
              return value == null ? '' : `${rowIndex === 0 ? 'M' : 'L'} ${x(rowIndex)} ${y(value)}`;
            })
            .filter(Boolean)
            .join(' ');
          return (
            <path
              key={asset.symbol}
              d={path}
              fill="none"
              stroke={assetColor(index, benchmark)}
              strokeWidth={benchmark ? 1.7 : 2.5}
              strokeDasharray={benchmark ? '6 5' : undefined}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        {xIndexes.map((index, labelIndex) => (
          <text
            key={`${rows[index].date}-${labelIndex}`}
            x={x(index)}
            y={H - 8}
            textAnchor={labelIndex === 0 ? 'start' : labelIndex === 4 ? 'end' : 'middle'}
            fontSize="11"
            fill="#94a3b8"
          >
            {new Date(`${rows[index].date}T00:00:00Z`).toLocaleDateString('en-US', {
              month: 'short',
              year: '2-digit',
              timeZone: 'UTC',
            })}
          </text>
        ))}
      </svg>
      <div className="mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {assets.map((asset, index) => {
          const benchmark = asset.symbol === 'SPY';
          const value = last.values[asset.symbol];
          return (
            <div key={asset.symbol} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: assetColor(index, benchmark) }}
                />
                <span className="min-w-0 truncate text-xs font-semibold text-slate-600">
                  {asset.symbol}{benchmark ? ' benchmark' : ''}
                </span>
              </div>
              <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                {value != null ? formatMoney(value) : '-'}
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ProjectionChart({ asset }: { asset: CompareAsset }) {
  const cone = useMemo(() => projectionCone(asset.points), [asset]);
  if (!cone.length) {
    return <div className="py-14 text-center text-sm text-slate-400">Not enough history to model.</div>;
  }

  const W = 520;
  const H = 250;
  const PAD = { top: 14, right: 12, bottom: 28, left: 54 };
  const max = Math.max(...cone.map((point) => point.high));
  const x = (year: number) => PAD.left + (year / 10) * (W - PAD.left - PAD.right);
  const y = (value: number) =>
    PAD.top + (1 - value / max) * (H - PAD.top - PAD.bottom);
  const area = [
    ...cone.map((point) => `${x(point.year)},${y(point.high)}`),
    ...[...cone].reverse().map((point) => `${x(point.year)},${y(point.low)}`),
  ].join(' ');
  const medianPath = cone
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.year)} ${y(point.median)}`)
    .join(' ');
  const terminal = cone[cone.length - 1];

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
        <title>Historical ten year projection cone for {asset.symbol}</title>
        {[0, 2, 4, 6, 8, 10].map((year) => (
          <g key={year}>
            <line
              x1={x(year)}
              x2={x(year)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="#e2e8f0"
            />
            <text x={x(year)} y={H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8">
              {year}y
            </text>
          </g>
        ))}
        <polygon points={area} fill="rgba(37, 99, 235, 0.12)" />
        <path d={medianPath} fill="none" stroke="#2563eb" strokeWidth="2.5" />
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(10_000)}
          y2={y(10_000)}
          stroke="#94a3b8"
          strokeDasharray="4 4"
        />
        <text x={PAD.left - 8} y={y(10_000) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
          $10k
        </text>
      </svg>
      <div className="mt-3 grid grid-cols-1 gap-2 min-[380px]:grid-cols-3">
        <Metric label="Low path" value={formatMoney(terminal.low)} tone="negative" />
        <Metric label="Median" value={formatMoney(terminal.median)} tone="positive" />
        <Metric label="High path" value={formatMoney(terminal.high)} tone="positive" />
      </div>
    </>
  );
}

function correlationColor(value: number | null): string {
  if (value == null) return '#f8fafc';
  if (value >= 0.85) return 'rgba(244, 63, 94, 0.18)';
  if (value >= 0.4) return 'rgba(245, 158, 11, 0.16)';
  if (value >= 0) return 'rgba(16, 185, 129, 0.16)';
  return 'rgba(14, 165, 233, 0.18)';
}

export default function FundCompare() {
  const [selected, setSelected] = useState<string[]>(DEFAULT_SYMBOLS);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [growthYears, setGrowthYears] = useState(10);
  const [projectionSymbol, setProjectionSymbol] = useState(DEFAULT_SYMBOLS[0]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (Array.isArray(stored) && stored.length > 0) {
        setSelected(stored.filter((value) => typeof value === 'string').slice(0, MAX_SELECTED));
      }
    } catch {
      // Ignore malformed local state.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
    if (!selected.includes(projectionSymbol)) {
      setProjectionSymbol(selected[0] ?? '');
    }
  }, [selected, projectionSymbol]);

  const requested = selected.includes('SPY') ? selected : [...selected, 'SPY'];
  const query = requested.map(encodeURIComponent).join(',');
  const { data, error, isLoading } = useSWR<CompareResponse>(
    selected.length ? `/api/compare?tickers=${query}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60 * 60 * 1000 }
  );

  const assets = useMemo(
    () => (data?.assets ?? []).filter((asset) => asset.points.length >= 2),
    [data]
  );
  const primaryAssets = assets.filter((asset) => selected.includes(asset.symbol));
  const benchmark = selected.includes('SPY')
    ? null
    : assets.find((asset) => asset.symbol === 'SPY') ?? null;
  const chartAssets = benchmark ? [...primaryAssets, benchmark] : primaryAssets;
  const failed = (data?.assets ?? []).filter((asset) => asset.error).map((asset) => asset.symbol);
  const activeProjection =
    primaryAssets.find((asset) => asset.symbol === projectionSymbol) ?? primaryAssets[0];

  function addSymbol(raw: string) {
    const symbol = raw.trim().toUpperCase();
    if (!symbol) return;
    if (!/^[A-Z0-9.^=-]{1,15}$/.test(symbol)) {
      setInputError('Use a valid Yahoo Finance ticker.');
      return;
    }
    if (selected.includes(symbol)) {
      setInputError(`${symbol} is already selected.`);
      return;
    }
    if (selected.length >= MAX_SELECTED) {
      setInputError(`Compare up to ${MAX_SELECTED} assets.`);
      return;
    }
    setSelected((current) => [...current, symbol]);
    setInput('');
    setInputError('');
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    addSymbol(input);
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl bg-slate-950 px-4 py-5 text-white shadow-xl shadow-slate-200 sm:px-7 sm:py-6">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="relative">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-blue-300">
            Comparative risk lab
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Put every fund through the same market.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Total-return history, drawdowns through real crashes, correlation, and a volatility-based
            projection range. SPY is included automatically as the benchmark.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {selected.map((symbol, index) => (
              <span
                key={symbol}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/15 bg-white/10 py-1.5 pl-2.5 pr-1 text-sm backdrop-blur"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: COLORS[index % COLORS.length] }}
                />
                <span className="font-semibold">{symbol}</span>
                <button
                  type="button"
                  onClick={() => setSelected((current) => current.filter((item) => item !== symbol))}
                  className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white touch-manipulation"
                  aria-label={`Remove ${symbol}`}
                >
                  <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3l6 6M9 3L3 9" />
                  </svg>
                </button>
              </span>
            ))}
          </div>

          <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setInputError('');
              }}
              placeholder={selected.length >= MAX_SELECTED ? 'Selection limit reached' : 'Add ticker: VOO, FSELX, ^GSPC...'}
              disabled={selected.length >= MAX_SELECTED}
              className="min-h-[44px] flex-1 rounded-xl border border-white/15 bg-white/10 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-400 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || selected.length >= MAX_SELECTED}
              className="min-h-[44px] rounded-xl bg-blue-500 px-5 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add asset
            </button>
          </form>
          {inputError && <p className="mt-2 text-xs text-rose-300">{inputError}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            {QUICK_PICKS.map((pick) => {
              const added = selected.includes(pick.symbol);
              return (
                <button
                  key={pick.symbol}
                  type="button"
                  disabled={added || selected.length >= MAX_SELECTED}
                  onClick={() => addSymbol(pick.symbol)}
                  className="min-h-[44px] rounded-full border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:border-white/30 hover:text-white disabled:opacity-30 touch-manipulation"
                >
                  <span className="font-semibold">{pick.symbol}</span>
                  <span className="ml-1.5 text-slate-500">{pick.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {!selected.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <p className="font-semibold text-slate-800">Add a fund or ETF to start comparing.</p>
        </div>
      ) : isLoading && !data ? (
        <div className="space-y-4">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-8 text-center text-sm text-rose-700">
          {error.message}
        </div>
      ) : (
        <>
          {failed.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Could not load: {failed.join(', ')}.
            </div>
          )}

          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Scoreboard
                </p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">Return versus risk</h3>
              </div>
              <p className="hidden text-xs text-slate-400 sm:block">Adjusted prices include reinvested distributions.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {primaryAssets.map((asset, index) => {
                const return10 = cagr(asset.points, 10);
                const volatility = annualizedVolatility(asset.points);
                const drawdown = maxDrawdown(asset.points);
                return (
                  <article
                    key={asset.symbol}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    style={{ borderTopWidth: 3, borderTopColor: COLORS[index % COLORS.length] }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-lg font-black tracking-tight text-slate-950">{asset.symbol}</p>
                        <p className="truncate text-xs text-slate-400">{asset.name}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {asset.quoteType}
                      </span>
                    </div>
                    <div className="mt-5 grid grid-cols-1 gap-3 min-[380px]:grid-cols-3">
                      <Metric
                        label="10y CAGR"
                        value={formatPct(return10)}
                        tone={return10 != null && return10 >= 0 ? 'positive' : 'negative'}
                      />
                      <Metric label="5y volatility" value={formatPct(volatility)} />
                      <Metric
                        label="Max drawdown"
                        value={formatPct(drawdown?.drawdown ?? null)}
                        tone="negative"
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-col items-stretch justify-between gap-3 min-[420px]:flex-row min-[420px]:items-center">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Wealth path
                </p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">$10,000 invested</h3>
              </div>
              <div className="grid grid-cols-4 rounded-lg bg-slate-100 p-1">
                {[
                  { label: '1Y', value: 1 },
                  { label: '5Y', value: 5 },
                  { label: '10Y', value: 10 },
                  { label: 'Max', value: 25 },
                ].map((range) => (
                  <button
                    key={range.label}
                    type="button"
                    onClick={() => setGrowthYears(range.value)}
                    className={`min-h-[40px] rounded-md px-3 py-1.5 text-xs font-semibold transition touch-manipulation ${
                      growthYears === range.value
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <GrowthChart assets={chartAssets} years={growthYears} />
            </div>
          </section>

          <div className="grid min-w-0 gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Compounding
              </p>
              <h3 className="mt-1 text-lg font-bold text-slate-900">Annualized total return</h3>
              <div className="mt-4 max-w-full overflow-x-auto overscroll-x-contain touch-pan-x">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400">
                      <th className="pb-2 text-left font-medium">Asset</th>
                      {[1, 3, 5, 10].map((years) => (
                        <th key={years} className="pb-2 text-right font-medium">{years}y</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chartAssets.map((asset, index) => {
                      const benchmarkAsset = asset.symbol === 'SPY' && !selected.includes('SPY');
                      return (
                        <tr key={asset.symbol} className="border-t border-slate-100">
                          <td className="py-3 pr-3">
                            <span
                              className="mr-2 inline-block h-2 w-2 rounded-full"
                              style={{ background: assetColor(index, benchmarkAsset) }}
                            />
                            <span className="font-semibold text-slate-800">{asset.symbol}</span>
                            {benchmarkAsset && <span className="ml-1 text-[10px] text-slate-400">benchmark</span>}
                          </td>
                          {[1, 3, 5, 10].map((years) => {
                            const value = cagr(asset.points, years);
                            return (
                              <td
                                key={years}
                                className={`py-3 text-right font-medium tabular-nums ${
                                  value == null
                                    ? 'text-slate-300'
                                    : value >= 0
                                      ? 'text-emerald-600'
                                      : 'text-rose-600'
                                }`}
                              >
                                {formatPct(value)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Forward range
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">10-year projection cone</h3>
                </div>
                <select
                  value={activeProjection?.symbol ?? ''}
                  onChange={(event) => setProjectionSymbol(event.target.value)}
                  className="min-h-[44px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                >
                  {primaryAssets.map((asset) => (
                    <option key={asset.symbol} value={asset.symbol}>{asset.symbol}</option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Historical daily return and volatility, shown as an 80% range. This is not a forecast.
              </p>
              <div className="mt-3">
                {activeProjection && <ProjectionChart asset={activeProjection} />}
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Stress test
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">Peak-to-trough in real selloffs</h3>
            <p className="mt-1 text-xs text-slate-400">
              Worst drawdown observed inside each dated market window.
            </p>
            <div className="mt-4 max-w-full overflow-x-auto overscroll-x-contain touch-pan-x">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="text-xs text-slate-400">
                    <th className="pb-2 text-left font-medium">Market event</th>
                    {chartAssets.map((asset) => (
                      <th key={asset.symbol} className="pb-2 text-right font-medium">{asset.symbol}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CRASH_WINDOWS.map((window) => (
                    <tr key={window.label} className="border-t border-slate-100">
                      <td className="py-3 pr-4">
                        <p className="font-medium text-slate-700">{window.label}</p>
                        <p className="text-[10px] text-slate-400">{window.start} to {window.end}</p>
                      </td>
                      {chartAssets.map((asset) => {
                        const drawdown = maxDrawdown(asset.points, window.start, window.end);
                        return (
                          <td key={asset.symbol} className="py-3 text-right font-semibold tabular-nums text-rose-600">
                            {formatPct(drawdown?.drawdown ?? null)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Diversification
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">Five-year weekly correlation</h3>
            <p className="mt-1 text-xs text-slate-400">
              Above 0.85 usually means the funds are behaving like the same bet.
            </p>
            <div className="mt-4 max-w-full overflow-x-auto overscroll-x-contain touch-pan-x">
              <table className="border-separate border-spacing-1 text-xs">
                <thead>
                  <tr>
                    <th />
                    {chartAssets.map((asset) => (
                      <th key={asset.symbol} className="px-2 py-1 font-semibold text-slate-500">
                        {asset.symbol}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chartAssets.map((rowAsset) => (
                    <tr key={rowAsset.symbol}>
                      <th className="px-2 py-2 text-left font-semibold text-slate-600">{rowAsset.symbol}</th>
                      {chartAssets.map((columnAsset) => {
                        const value =
                          rowAsset.symbol === columnAsset.symbol
                            ? 1
                            : correlation(rowAsset.points, columnAsset.points);
                        return (
                          <td
                            key={columnAsset.symbol}
                            className="min-w-[58px] rounded-lg px-3 py-2 text-center font-semibold tabular-nums text-slate-700"
                            style={{ background: correlationColor(value) }}
                          >
                            {value == null ? '-' : value.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-slate-400">
              <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-rose-100" />Same bet</span>
              <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-100" />Related</span>
              <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-100" />Diversifying</span>
              <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-sky-100" />Inverse</span>
            </div>
          </section>

          <p className="pb-6 text-center text-xs text-slate-400">
            Historical analysis only. Adjusted price data from Yahoo Finance. Not investment advice.
          </p>
        </>
      )}
    </div>
  );
}
