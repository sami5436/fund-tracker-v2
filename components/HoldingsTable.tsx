'use client';

import { useState } from 'react';
import type { HoldingWithData } from '@/lib/types';

type SortCol = 'ticker' | 'weight' | 'price' | 'changePct';

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className={`ml-1 text-[10px] ${active ? 'text-gray-600' : 'text-gray-300'}`}>
      {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );
}

function ChangeBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-300">—</span>;
  if (value === 0) return <span className="text-gray-400">0.00%</span>;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${
        value > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
      }`}
    >
      {value > 0 ? '+' : ''}{value.toFixed(2)}%
    </span>
  );
}

export default function HoldingsTable({ holdings }: { holdings: HoldingWithData[] }) {
  const [sortCol, setSortCol] = useState<SortCol>('weight');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function handleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  const sorted = [...holdings].sort((a, b) => {
    const av = sortCol === 'ticker' ? a.ticker : sortCol === 'weight' ? a.weight : sortCol === 'price' ? a.price : a.changePct;
    const bv = sortCol === 'ticker' ? b.ticker : sortCol === 'weight' ? b.weight : sortCol === 'price' ? b.price : b.changePct;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  function Th({ col, label, className = '' }: { col: SortCol; label: string; className?: string }) {
    return (
      <th
        className={`py-3 px-3 font-medium text-gray-400 text-xs uppercase tracking-wide cursor-pointer select-none active:bg-gray-100 ${className}`}
        onClick={() => handleSort(col)}
      >
        {label}<SortIcon active={sortCol === col} dir={sortDir} />
      </th>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm min-w-[320px]">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <Th col="ticker" label="Stock" className="text-left" />
            <Th col="weight" label="Wt" className="text-right" />
            <Th col="price" label="Price" className="text-right" />
            <Th col="changePct" label="Chg" className="text-right" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {sorted.map((h) => (
            <tr key={h.ticker} className="hover:bg-gray-50 transition-colors">
              <td className="px-3 py-3">
                <span className="font-semibold text-gray-900">{h.ticker}</span>
                <span className="ml-2 text-xs text-gray-400 hidden sm:inline">{h.name}</span>
              </td>
              <td className="px-3 py-3 text-right text-gray-500 tabular-nums text-xs">
                {h.weight.toFixed(2)}%
              </td>
              <td className="px-3 py-3 text-right font-medium text-gray-700 tabular-nums">
                {h.price !== null ? `$${h.price.toFixed(2)}` : <span className="text-gray-300">—</span>}
              </td>
              <td className="px-3 py-3 text-right">
                <ChangeBadge value={h.changePct} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
