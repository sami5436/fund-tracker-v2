'use client';

import { useState } from 'react';
import type { NavRecord } from '@/lib/types';

interface Props {
  fundId: string;
  estimatedNav: number;
  onSave: (record: NavRecord) => Promise<void>;
}

function todayCST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

// Returns a blocking reason string, or null if the date is ok to save
function marketCloseBlock(date: string): string | null {
  const today = todayCST();
  if (date > today) return 'Cannot log a future date.';

  // Block weekend dates — funds have no NAV on Sat/Sun
  const day = new Date(`${date}T12:00:00`).getDay(); // noon avoids DST edge cases
  if (day === 0 || day === 6) return 'No NAV on weekends — pick a trading day.';

  if (date < today) return null; // Past weekdays always fine

  // Same day — require after 11:00 PM CST (when official NAV is published)
  const cstTime = new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/Chicago',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  if (cstTime < '23:00') return `Official NAV posts ~11:00 PM CST (currently ${cstTime} CST) — check back then.`;
  return null;
}

export default function ActualNavEntry({ fundId, estimatedNav, onSave }: Props) {
  const [date, setDate] = useState(todayCST);
  const [actualInput, setActualInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const blockReason = marketCloseBlock(date);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (blockReason) return;
    const actual = parseFloat(actualInput);
    if (isNaN(actual) || actual <= 0) return;

    setStatus('saving');
    try {
      await onSave({
        date,
        actualNav: actual,
        estimatedNav: parseFloat(estimatedNav.toFixed(2)),
        fundId,
      });
      setActualInput('');
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed');
      setStatus('error');
      setTimeout(() => setStatus('idle'), 4000);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
        Log End-of-Day Actual NAV
      </label>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full sm:w-auto border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-manipulation"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Actual NAV</span>
          <div className="flex items-center gap-1">
            <span className="text-gray-400 font-medium">$</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={actualInput}
              onChange={(e) => setActualInput(e.target.value)}
              className="w-full sm:w-28 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!actualInput || !!blockReason || status === 'saving'}
            className="flex-1 sm:flex-none min-h-[44px] px-5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors touch-manipulation"
          >
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>
          {status === 'saved' && <span className="text-xs text-green-600 font-medium">Saved!</span>}
          {status === 'error' && <span className="text-xs text-red-500 font-medium">{errorMsg}</span>}
        </div>
      </form>

      {blockReason ? (
        <p className="text-xs text-amber-500 mt-2">{blockReason}</p>
      ) : (
        <p className="text-xs text-gray-400 mt-2">
          Estimated at save time: <span className="font-medium tabular-nums">${estimatedNav.toFixed(2)}</span>
        </p>
      )}
    </div>
  );
}
