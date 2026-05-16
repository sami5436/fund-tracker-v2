'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import type { FidelityFund, StockQuote } from '@/lib/types';
import { POPULAR_TICKERS } from '@/lib/popular-tickers';
import FundDetailsModal from './FundDetailsModal';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

interface Filters {
  category: string;          // '' = any
  minRating: number;         // 0-5 (0 = any)
  maxRisk: number;           // 1-5 (5 = any)
  maxExpense: number | null; // percent, null = any
  minAum: number;            // USD, 0 = any
}

const DEFAULT_FILTERS: Filters = {
  category: '',
  minRating: 0,
  maxRisk: 5,
  maxExpense: null,
  minAum: 0,
};

interface ScoredFund {
  fund: FidelityFund;
  score: number;
  matches: { ticker: string; weight: number; rank: number }[];
}

function scoreFunds(funds: FidelityFund[], ranked: string[]): ScoredFund[] {
  if (!ranked.length) {
    return funds.map((fund) => ({ fund, score: 0, matches: [] }));
  }
  const n = ranked.length;
  const positionWeight = (i: number) => n - i; // first ticker weighted n, last 1

  return funds
    .map((fund) => {
      const matches: ScoredFund['matches'] = [];
      let score = 0;
      ranked.forEach((tk, i) => {
        const h = fund.holdings.find((x) => x.ticker.toUpperCase() === tk.toUpperCase());
        if (h && h.weight > 0) {
          score += h.weight * positionWeight(i);
          matches.push({ ticker: h.ticker, weight: h.weight, rank: i + 1 });
        }
      });
      return { fund, score, matches };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

function applyFilters(funds: FidelityFund[], f: Filters): FidelityFund[] {
  return funds.filter((fund) => {
    if (f.category && fund.category !== f.category) return false;
    if (f.minRating > 0 && (fund.morningstarRating ?? 0) < f.minRating) return false;
    if (f.maxRisk < 5 && (fund.riskRating ?? 0) > f.maxRisk) return false;
    if (f.maxExpense != null && (fund.expenseRatio ?? Infinity) > f.maxExpense) return false;
    if (f.minAum > 0 && (fund.totalAssets ?? 0) < f.minAum) return false;
    return true;
  });
}

function formatAum(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

function TickerRow({
  ticker,
  rank,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  ticker: string;
  rank: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-3 py-2">
      <div className="flex flex-col">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="text-gray-400 hover:text-gray-700 disabled:text-gray-200 disabled:cursor-not-allowed leading-none"
          aria-label={`Move ${ticker} up`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="text-gray-400 hover:text-gray-700 disabled:text-gray-200 disabled:cursor-not-allowed leading-none"
          aria-label={`Move ${ticker} down`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      <span className="text-xs font-semibold text-gray-400 w-5 tabular-nums">#{rank}</span>
      <span className="font-mono text-sm font-semibold text-gray-900 flex-1">{ticker}</span>
      <button
        onClick={onRemove}
        className="text-gray-400 hover:text-red-500 text-lg leading-none px-1"
        aria-label={`Remove ${ticker}`}
      >
        ×
      </button>
    </div>
  );
}

export default function FundFinder() {
  const { data, error, isLoading } = useSWR<{ funds: FidelityFund[] }>(
    '/api/funds',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60 * 60 * 1000 }
  );

  const [ranked, setRanked] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailsFund, setDetailsFund] = useState<FidelityFund | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);

  const funds = data?.funds ?? [];

  const categories = useMemo(() => {
    const set = new Set<string>();
    funds.forEach((f) => { if (f.category) set.add(f.category); });
    return Array.from(set).sort();
  }, [funds]);

  const filtered = useMemo(() => applyFilters(funds, filters), [funds, filters]);
  const scored = useMemo(() => scoreFunds(filtered, ranked), [filtered, ranked]);

  const quoteKey = useMemo(() => {
    if (!scored.length) return null;
    const tickers = Array.from(new Set(scored.map((s) => s.fund.ticker))).sort();
    return `/api/stocks?tickers=${tickers.join(',')}`;
  }, [scored]);

  const { data: quotes } = useSWR<StockQuote[]>(quoteKey, fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });

  const quoteMap = useMemo(() => {
    const map = new Map<string, StockQuote>();
    quotes?.forEach((q) => map.set(q.ticker.toUpperCase(), q));
    return map;
  }, [quotes]);

  // Build an index of every unique (ticker, name) — merging fund top-10 holdings
  // with a curated list of popular tickers so company-name search works even
  // for stocks that don't appear in any fund's top-10 yet.
  const tickerIndex = useMemo(() => {
    const map = new Map<string, { ticker: string; name: string; fundCount: number }>();
    funds.forEach((f) => {
      f.holdings.forEach((h) => {
        if (!h.ticker) return;
        const key = h.ticker.toUpperCase();
        const existing = map.get(key);
        if (existing) {
          existing.fundCount += 1;
          if (existing.name.length < h.name.length) existing.name = h.name;
        } else {
          map.set(key, { ticker: key, name: h.name, fundCount: 1 });
        }
      });
    });
    POPULAR_TICKERS.forEach((p) => {
      const key = p.ticker.toUpperCase();
      if (!map.has(key)) {
        map.set(key, { ticker: key, name: p.name, fundCount: 0 });
      } else {
        const existing = map.get(key)!;
        if (existing.name.length < p.name.length) existing.name = p.name;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.fundCount - a.fundCount);
  }, [funds]);

  const suggestions = useMemo(() => {
    const q = input.trim().toUpperCase();
    if (!q) return [];
    const exclude = new Set(ranked);
    const tickerPrefix: typeof tickerIndex = [];
    const nameWordPrefix: typeof tickerIndex = [];
    const nameSubstr: typeof tickerIndex = [];
    for (const t of tickerIndex) {
      if (exclude.has(t.ticker)) continue;
      const upperName = t.name.toUpperCase();
      if (t.ticker.startsWith(q)) {
        tickerPrefix.push(t);
        continue;
      }
      // Match query against any word in the name (e.g., "APPLE" → "Apple Inc.").
      const words = upperName.split(/[\s,.()&]+/).filter(Boolean);
      if (words.some((w) => w.startsWith(q))) {
        nameWordPrefix.push(t);
      } else if (upperName.includes(q)) {
        nameSubstr.push(t);
      }
    }
    return [...tickerPrefix, ...nameWordPrefix, ...nameSubstr].slice(0, 8);
  }, [input, tickerIndex, ranked]);

  function addTicker(tickerOverride?: string) {
    const t = (tickerOverride ?? input).trim().toUpperCase();
    if (!t || ranked.includes(t)) {
      setInput('');
      setSuggestionsOpen(false);
      return;
    }
    setRanked((prev) => [...prev, t]);
    setInput('');
    setSuggestionsOpen(false);
    setHighlightedIdx(0);
  }

  function removeTicker(t: string) {
    setRanked((prev) => prev.filter((x) => x !== t));
  }

  function moveTicker(idx: number, delta: -1 | 1) {
    setRanked((items) => {
      const target = idx + delta;
      if (target < 0 || target >= items.length) return items;
      const next = items.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  const hasActiveFilters =
    filters.category !== '' ||
    filters.minRating > 0 ||
    filters.maxRisk < 5 ||
    filters.maxExpense != null ||
    filters.minAum > 0;

  return (
    <div className="space-y-4">
      {/* Ticker priority */}
      <section className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-900">Priority Holdings</h2>
          <span className="text-xs text-gray-400">use ▲▼ to reorder</span>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Add tickers you want funds to hold. Top of list = highest weight in scoring.
        </p>

        <div className="flex gap-2 mb-3 relative">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value.toUpperCase());
                setSuggestionsOpen(true);
                setHighlightedIdx(0);
              }}
              onFocus={() => setSuggestionsOpen(true)}
              onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' && suggestions.length) {
                  e.preventDefault();
                  setHighlightedIdx((i) => Math.min(i + 1, suggestions.length - 1));
                } else if (e.key === 'ArrowUp' && suggestions.length) {
                  e.preventDefault();
                  setHighlightedIdx((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (suggestionsOpen && suggestions.length) {
                    addTicker(suggestions[highlightedIdx]?.ticker);
                  } else {
                    addTicker();
                  }
                } else if (e.key === 'Escape') {
                  setSuggestionsOpen(false);
                }
              }}
              placeholder="Type ticker or name (e.g. NVDA, Apple)"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
              autoComplete="off"
            />
            {suggestionsOpen && suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-20 max-h-64 overflow-y-auto">
                {suggestions.map((s, i) => (
                  <li key={s.ticker}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addTicker(s.ticker);
                      }}
                      onMouseEnter={() => setHighlightedIdx(i)}
                      className={`w-full text-left px-3 py-1.5 flex items-baseline gap-2 ${
                        i === highlightedIdx ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className="font-mono font-bold text-sm text-gray-900 w-14 shrink-0">
                        {s.ticker}
                      </span>
                      <span className="text-xs text-gray-600 truncate flex-1 normal-case">
                        {s.name}
                      </span>
                      <span className="text-[10px] text-gray-400 shrink-0">
                        {s.fundCount} fund{s.fundCount === 1 ? '' : 's'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={() => addTicker()}
            disabled={!input.trim()}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>

        {ranked.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-2">No tickers added yet.</p>
        ) : (
          <div className="space-y-1.5">
            {ranked.map((t, i) => (
              <TickerRow
                key={t}
                ticker={t}
                rank={i + 1}
                isFirst={i === 0}
                isLast={i === ranked.length - 1}
                onMoveUp={() => moveTicker(i, -1)}
                onMoveDown={() => moveTicker(i, 1)}
                onRemove={() => removeTicker(t)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Filters */}
      <section className="bg-white border border-gray-200 rounded-lg">
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-900"
        >
          <span className="flex items-center gap-2">
            Filters
            {hasActiveFilters && (
              <span className="text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                active
              </span>
            )}
          </span>
          <span className="text-gray-400 text-xs">{filtersOpen ? '▴ hide' : '▾ show'}</span>
        </button>

        {filtersOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
              >
                <option value="">Any</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Min Morningstar Rating: {filters.minRating === 0 ? 'Any' : `${filters.minRating}★`}
              </label>
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4, 5].map((r) => (
                  <button
                    key={r}
                    onClick={() => setFilters({ ...filters, minRating: r })}
                    className={`flex-1 py-1 text-xs rounded ${
                      filters.minRating === r
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {r === 0 ? 'Any' : `${r}★`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Max Risk: {filters.maxRisk === 5 ? 'Any' : filters.maxRisk}
              </label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((r) => (
                  <button
                    key={r}
                    onClick={() => setFilters({ ...filters, maxRisk: r })}
                    className={`flex-1 py-1 text-xs rounded ${
                      filters.maxRisk === r
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {r === 5 ? 'Any' : `≤${r}`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Max Expense Ratio (%)
              </label>
              <input
                type="number"
                step="0.05"
                min="0"
                placeholder="Any"
                value={filters.maxExpense ?? ''}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    maxExpense: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Min AUM
              </label>
              <select
                value={filters.minAum}
                onChange={(e) => setFilters({ ...filters, minAum: Number(e.target.value) })}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
              >
                <option value={0}>Any size</option>
                <option value={1e8}>$100M+</option>
                <option value={1e9}>$1B+</option>
                <option value={1e10}>$10B+</option>
                <option value={5e10}>$50B+</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Reset filters
              </button>
            )}
          </div>
        )}
      </section>

      {/* Results */}
      <section className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">
            {ranked.length > 0 ? 'Ranked Matches' : 'All Funds'}
          </h2>
          <span className="text-xs text-gray-400">
            {isLoading ? 'loading…' : `${scored.length} of ${funds.length}`}
          </span>
        </div>

        {error && (
          <p className="text-xs text-red-600 py-2">
            Failed to load funds. Try refreshing.
          </p>
        )}

        {isLoading && (
          <p className="text-xs text-gray-400 italic py-2">
            Fetching fund metadata from Yahoo Finance…
          </p>
        )}

        {!isLoading && scored.length === 0 && ranked.length > 0 && (
          <p className="text-xs text-gray-400 italic py-2">
            No funds in this universe hold those tickers in their top 10. Try different tickers or loosen filters.
          </p>
        )}

        {!isLoading && scored.length === 0 && ranked.length === 0 && funds.length > 0 && (
          <p className="text-xs text-gray-400 italic py-2">
            Add a ticker above to rank funds, or browse all {funds.length} loaded.
          </p>
        )}

        <div className="space-y-2">
          {scored.map(({ fund, score, matches }) => {
            const quote = quoteMap.get(fund.ticker.toUpperCase());
            return (
            <div
              key={fund.ticker}
              className="border border-gray-200 rounded-md px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono font-semibold text-sm text-gray-900">
                      {fund.ticker}
                    </span>
                    {fund.morningstarRating != null && (
                      <span className="text-xs text-amber-600">
                        {'★'.repeat(fund.morningstarRating)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 truncate">{fund.name}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {fund.category ?? '—'} · {formatAum(fund.totalAssets)} ·{' '}
                    {fund.expenseRatio != null ? `${fund.expenseRatio.toFixed(2)}% exp` : '—'}
                  </p>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end">
                  {quote?.price != null ? (
                    <div className="border border-gray-300 rounded px-1.5 py-0.5 flex flex-col items-end leading-tight">
                      <div className="text-sm font-semibold text-gray-900 tabular-nums">
                        ${quote.price.toFixed(2)}
                      </div>
                      {quote.changePct != null && (
                        <div
                          className={`text-[11px] font-medium tabular-nums ${
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
                  ) : (
                    <div className="text-[11px] text-gray-300">—</div>
                  )}
                  {ranked.length > 0 && (
                    <div className="mt-1 leading-tight">
                      <div className="text-sm font-bold text-blue-600 tabular-nums">
                        {score.toFixed(1)}
                      </div>
                      <div className="text-[10px] text-gray-400">score</div>
                    </div>
                  )}
                </div>
              </div>

              {matches.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {matches.map((m) => (
                    <span
                      key={m.ticker}
                      className="text-[11px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded"
                    >
                      {m.ticker} <span className="text-blue-400">{m.weight.toFixed(1)}%</span>
                    </span>
                  ))}
                </div>
              )}

              <button
                onClick={() => setDetailsFund(fund)}
                className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
              >
                View details
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            );
          })}
        </div>
      </section>

      {detailsFund && (
        <FundDetailsModal fund={detailsFund} onClose={() => setDetailsFund(null)} />
      )}
    </div>
  );
}
