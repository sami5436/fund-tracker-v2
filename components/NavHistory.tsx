'use client';

import { useState } from 'react';
import type { NavRow } from '@/lib/types';

type SortCol = 'date' | 'estimated_nav' | 'actual_nav' | 'diff';

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className={`ml-1 text-[10px] ${active ? 'text-gray-600' : 'text-gray-300'}`}>
      {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );
}

interface Props {
  records: NavRow[] | undefined;
  onDelete: (date: string) => void;
}

export default function NavHistory({ records, onDelete }: Props) {
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

  const sorted = [...records].sort((a, b) => {
    let av: number | string | null;
    let bv: number | string | null;
    if (sortCol === 'date') { av = a.date; bv = b.date; }
    else if (sortCol === 'estimated_nav') { av = a.estimated_nav; bv = b.estimated_nav; }
    else if (sortCol === 'actual_nav') { av = a.actual_nav; bv = b.actual_nav; }
    else { av = a.diff; bv = b.diff; }
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  function Th({
    col,
    label,
    className = '',
    hideOnMobile = false,
  }: {
    col: SortCol;
    label: string;
    className?: string;
    hideOnMobile?: boolean;
  }) {
    return (
      <th
        onClick={() => handleSort(col)}
        className={`py-3 px-3 text-xs font-medium text-gray-400 uppercase tracking-wide cursor-pointer select-none active:bg-gray-100 ${className} ${hideOnMobile ? 'hidden sm:table-cell' : ''}`}
      >
        {label}<SortIcon active={sortCol === col} dir={sortDir} />
      </th>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm min-w-[300px]">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <Th col="date" label="Date" className="text-left" />
            <Th col="estimated_nav" label="Est." className="text-right" hideOnMobile />
            <Th col="actual_nav" label="Actual" className="text-right" />
            <Th col="diff" label="Diff" className="text-right" />
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const diff = r.diff ?? (r.estimated_nav != null ? r.actual_nav - r.estimated_nav : null);
            const diffPct = r.diff_pct ?? (r.estimated_nav != null && r.estimated_nav !== 0
              ? ((r.actual_nav - r.estimated_nav) / r.estimated_nav) * 100
              : null);
            const isPos = diff != null && diff > 0;
            const isNeg = diff != null && diff < 0;
            return (
              <tr key={r.date} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <td className="px-3 py-3.5 font-medium text-gray-700 tabular-nums text-sm">{r.date}</td>
                <td className="px-3 py-3.5 text-right tabular-nums text-gray-500 hidden sm:table-cell">
                  {r.estimated_nav != null ? `$${Number(r.estimated_nav).toFixed(2)}` : '—'}
                </td>
                <td className="px-3 py-3.5 text-right tabular-nums font-semibold text-gray-900">
                  ${Number(r.actual_nav).toFixed(2)}
                </td>
                <td className={`px-3 py-3.5 text-right tabular-nums font-semibold ${isPos ? 'text-green-600' : isNeg ? 'text-red-600' : 'text-gray-400'}`}>
                  {diff != null ? (
                    <>
                      {isPos ? '+' : ''}{Number(diff).toFixed(2)}
                      {diffPct != null && (
                        <span className="text-xs font-normal ml-1 hidden sm:inline">
                          ({isPos ? '+' : ''}{diffPct.toFixed(2)}%)
                        </span>
                      )}
                    </>
                  ) : '—'}
                </td>
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
      </table>
    </div>
  );
}
