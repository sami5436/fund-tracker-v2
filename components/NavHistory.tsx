'use client';

import { useState } from 'react';
import type { NavRow } from '@/lib/types';

type SortCol = 'date' | 'estimated_nav' | 'estimated_nav_v2' | 'actual_nav' | 'diff' | 'diff_v2';

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className="inline-flex flex-col ml-1 gap-px align-middle">
      <svg viewBox="0 0 6 4" className={`w-1.5 h-1 ${active && dir === 'asc' ? 'text-gray-600' : 'text-gray-300'}`} fill="currentColor">
        <path d="M3 0L6 4H0L3 0Z" />
      </svg>
      <svg viewBox="0 0 6 4" className={`w-1.5 h-1 ${active && dir === 'desc' ? 'text-gray-600' : 'text-gray-300'}`} fill="currentColor">
        <path d="M3 4L0 0H6L3 4Z" />
      </svg>
    </span>
  );
}

interface Props {
  records: NavRow[] | undefined;
  onDelete: (date: string) => void;
  proxyOnly?: boolean;
}

function diffOf(actual: number, est: number | null): number | null {
  return est != null ? actual - est : null;
}
function diffPctOf(actual: number, est: number | null): number | null {
  return est != null && est !== 0 ? ((actual - est) / est) * 100 : null;
}

interface MaeStats {
  count: number;
  mae: number;     // mean absolute $ error
  maePct: number;  // mean absolute % error
}
function computeMae(rows: NavRow[], pick: (r: NavRow) => number | null): MaeStats | null {
  const samples = rows
    .map((r) => {
      const est = pick(r);
      if (est == null) return null;
      return {
        absDiff: Math.abs(r.actual_nav - est),
        absPct: est !== 0 ? Math.abs((r.actual_nav - est) / est) * 100 : 0,
      };
    })
    .filter((v): v is { absDiff: number; absPct: number } => v !== null);
  if (samples.length === 0) return null;
  return {
    count: samples.length,
    mae: samples.reduce((a, b) => a + b.absDiff, 0) / samples.length,
    maePct: samples.reduce((a, b) => a + b.absPct, 0) / samples.length,
  };
}

function primaryEstimate(row: NavRow, proxyOnly: boolean): number | null {
  return proxyOnly ? row.estimated_nav_v2 ?? row.estimated_nav : row.estimated_nav;
}

function primaryDiff(row: NavRow, proxyOnly: boolean): number | null {
  return proxyOnly ? row.diff_v2 ?? diffOf(row.actual_nav, row.estimated_nav_v2 ?? row.estimated_nav) : row.diff;
}

function primaryDiffPct(row: NavRow, proxyOnly: boolean): number | null {
  return proxyOnly
    ? row.diff_pct_v2 ?? diffPctOf(row.actual_nav, row.estimated_nav_v2 ?? row.estimated_nav)
    : row.diff_pct;
}

export default function NavHistory({ records, onDelete, proxyOnly = false }: Props) {
  const [sortCol, setSortCol] = useState<SortCol>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function handleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  if (!records) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 text-center text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 text-center text-sm text-gray-400">
        No entries yet — save an end-of-day actual NAV above.
      </div>
    );
  }

  const hasV2 = !proxyOnly && records.some((r) => r.estimated_nav_v2 != null);

  const sorted = [...records].sort((a, b) => {
    let av: number | string | null;
    let bv: number | string | null;
    if (sortCol === 'date') { av = a.date; bv = b.date; }
    else if (sortCol === 'estimated_nav') { av = primaryEstimate(a, proxyOnly); bv = primaryEstimate(b, proxyOnly); }
    else if (sortCol === 'estimated_nav_v2') {
      av = hasV2 ? a.estimated_nav_v2 : primaryEstimate(a, proxyOnly);
      bv = hasV2 ? b.estimated_nav_v2 : primaryEstimate(b, proxyOnly);
    }
    else if (sortCol === 'actual_nav') { av = a.actual_nav; bv = b.actual_nav; }
    else if (sortCol === 'diff_v2') {
      av = hasV2 ? a.diff_v2 : primaryDiff(a, proxyOnly);
      bv = hasV2 ? b.diff_v2 : primaryDiff(b, proxyOnly);
    }
    else { av = primaryDiff(a, proxyOnly); bv = primaryDiff(b, proxyOnly); }
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const maeV1 = computeMae(records, (r) => primaryEstimate(r, proxyOnly));
  const maeV2 = hasV2 ? computeMae(records, (r) => r.estimated_nav_v2) : null;

  function Th({
    col,
    label,
    className = '',
  }: {
    col: SortCol;
    label: string;
    className?: string;
  }) {
    return (
      <th
        onClick={() => handleSort(col)}
        className={`py-3 px-3 text-xs font-medium text-gray-400 uppercase tracking-wide cursor-pointer select-none active:bg-gray-100 ${className}`}
      >
        {label}<SortIcon active={sortCol === col} dir={sortDir} />
      </th>
    );
  }

  function DiffCell({ diff, diffPct }: { diff: number | null; diffPct: number | null }) {
    const isPos = diff != null && diff > 0;
    const isNeg = diff != null && diff < 0;
    return (
      <td className={`px-3 py-3.5 text-right tabular-nums font-semibold ${isPos ? 'text-green-600' : isNeg ? 'text-red-600' : 'text-gray-400'}`}>
        {diff != null ? (
          <>
            {isPos ? '+' : ''}{Number(diff).toFixed(2)}
            {diffPct != null && (
              <span className="text-xs font-normal ml-1 text-gray-500">
                ({isPos ? '+' : ''}{diffPct.toFixed(2)}%)
              </span>
            )}
          </>
        ) : '—'}
      </td>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          {hasV2 && (
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="py-1.5" colSpan={2} />
              <th className="py-1.5 px-3 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-l border-gray-200" colSpan={2}>
                v1 · proportional
              </th>
              <th className="py-1.5 px-3 text-center text-[10px] font-semibold uppercase tracking-wider text-blue-600 border-l border-gray-200" colSpan={2}>
                v2 · proxy residual
              </th>
              <th className="py-1.5" />
            </tr>
          )}
          <tr className="bg-gray-50 border-b border-gray-100">
            <Th col="date" label="Date" className="text-left" />
            <Th col="actual_nav" label="Actual" className="text-right" />
            <Th col="estimated_nav" label="Est." className={`text-right ${hasV2 ? 'border-l border-gray-200' : ''}`} />
            <Th col="diff" label="Diff" className="text-right" />
            {hasV2 && <Th col="estimated_nav_v2" label="Est." className="text-right border-l border-gray-200" />}
            {hasV2 && <Th col="diff_v2" label="Diff" className="text-right" />}
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const estimate = primaryEstimate(r, proxyOnly);
            const diff = primaryDiff(r, proxyOnly) ?? diffOf(r.actual_nav, estimate);
            const diffPct = primaryDiffPct(r, proxyOnly) ?? diffPctOf(r.actual_nav, estimate);
            const diffV2 = r.diff_v2 ?? diffOf(r.actual_nav, r.estimated_nav_v2);
            const diffPctV2 = r.diff_pct_v2 ?? diffPctOf(r.actual_nav, r.estimated_nav_v2);
            return (
              <tr key={r.date} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <td className="px-3 py-3.5 font-medium text-gray-700 tabular-nums text-sm">{r.date}</td>
                <td className="px-3 py-3.5 text-right tabular-nums font-semibold text-gray-900">
                  ${Number(r.actual_nav).toFixed(2)}
                </td>
                <td className={`px-3 py-3.5 text-right tabular-nums text-gray-500 ${hasV2 ? 'border-l border-gray-200' : ''}`}>
                  {estimate != null ? `$${Number(estimate).toFixed(2)}` : '—'}
                </td>
                <DiffCell diff={diff} diffPct={diffPct} />
                {hasV2 && (
                  <td className="px-3 py-3.5 text-right tabular-nums text-gray-500 border-l border-gray-200">
                    {r.estimated_nav_v2 != null ? `$${Number(r.estimated_nav_v2).toFixed(2)}` : '—'}
                  </td>
                )}
                {hasV2 && <DiffCell diff={diffV2} diffPct={diffPctV2} />}
                <td className="px-3 py-3.5">
                  <button
                    onClick={() => onDelete(r.date)}
                    className="text-gray-300 hover:text-red-400 transition-colors p-1 -m-1 touch-manipulation"
                    title="Delete"
                  >
                    <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <line x1="1" y1="1" x2="11" y2="11" />
                      <line x1="11" y1="1" x2="1" y2="11" />
                    </svg>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        {(maeV1 || maeV2) && (
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-200 text-xs">
              <td className="px-3 py-2.5 font-medium text-gray-500 uppercase tracking-wide" colSpan={2}>
                Mean Abs. Error
              </td>
              <td className={`px-3 py-2.5 text-right tabular-nums text-gray-700 font-semibold ${hasV2 ? 'border-l border-gray-200' : ''}`} colSpan={2}>
                {maeV1 ? (
                  <>
                    ${maeV1.mae.toFixed(2)}
                    <span className="font-normal text-gray-500 ml-1">({maeV1.maePct.toFixed(2)}%)</span>
                    <span className="block text-[10px] font-normal text-gray-400 mt-0.5">n={maeV1.count}</span>
                  </>
                ) : '—'}
              </td>
              {hasV2 && (
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold border-l border-gray-200" colSpan={2}>
                  {maeV2 ? (
                    <>
                      <span className={maeV1 && maeV2.mae < maeV1.mae ? 'text-green-600' : 'text-gray-700'}>
                        ${maeV2.mae.toFixed(2)}
                      </span>
                      <span className="font-normal text-gray-500 ml-1">({maeV2.maePct.toFixed(2)}%)</span>
                      <span className="block text-[10px] font-normal text-gray-400 mt-0.5">n={maeV2.count}</span>
                    </>
                  ) : '—'}
                </td>
              )}
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
