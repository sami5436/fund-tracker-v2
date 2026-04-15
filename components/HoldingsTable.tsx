'use client';

import type { HoldingWithData } from '@/lib/types';

function ChangeBadge({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-gray-300">—</span>;
  }
  if (value === 0) {
    return <span className="text-gray-400">0.00%</span>;
  }
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${
        value > 0
          ? 'bg-green-50 text-green-700'
          : 'bg-red-50 text-red-600'
      }`}
    >
      {value > 0 ? '+' : ''}
      {value.toFixed(2)}%
    </span>
  );
}

export default function HoldingsTable({ holdings }: { holdings: HoldingWithData[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm min-w-[360px]">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-2.5 font-medium text-gray-400 text-xs uppercase tracking-wide">
              Stock
            </th>
            <th className="text-right px-4 py-2.5 font-medium text-gray-400 text-xs uppercase tracking-wide">
              Weight
            </th>
            <th className="text-right px-4 py-2.5 font-medium text-gray-400 text-xs uppercase tracking-wide">
              Price
            </th>
            <th className="text-right px-4 py-2.5 font-medium text-gray-400 text-xs uppercase tracking-wide">
              Change
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {holdings.map((h) => (
            <tr key={h.ticker} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <span className="font-semibold text-gray-900">{h.ticker}</span>
                <span className="ml-2 text-xs text-gray-400">{h.name}</span>
              </td>
              <td className="px-4 py-3 text-right text-gray-500 tabular-nums text-xs">
                {h.weight.toFixed(2)}%
              </td>
              <td className="px-4 py-3 text-right font-medium text-gray-700 tabular-nums">
                {h.price !== null ? `$${h.price.toFixed(2)}` : <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-3 text-right">
                <ChangeBadge value={h.changePct} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
