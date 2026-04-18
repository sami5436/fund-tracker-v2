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

function marketCloseBlock(date: string): string | null {
  const today = todayCST();
  if (date > today) return 'Cannot log a future date.';
  const day = new Date(`${date}T12:00:00`).getDay();
  if (day === 0 || day === 6) return 'No NAV on weekends.';
  if (date < today) return null;
  const cstTime = new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/Chicago',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  if (cstTime < '23:00') return `NAV posts ~11 PM CST (now ${cstTime} CST).`;
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
    <div>
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-center">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-manipulation"
        />
        <div className="flex items-center gap-1">
          <span className="text-gray-400 text-sm">$</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={actualInput}
            onChange={(e) => setActualInput(e.target.value)}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          disabled={!actualInput || !!blockReason || status === 'saving'}
          className="px-4 py-2 min-h-[36px] rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors touch-manipulation"
        >
          {status === 'saving' ? 'Saving…' : 'Save Actual Fund Price'}
        </button>
        {status === 'saved' && <span className="text-xs text-green-600 font-medium">Saved</span>}
        {status === 'error' && <span className="text-xs text-red-500">{errorMsg}</span>}
      </form>
      {blockReason && <p className="text-xs text-amber-500 mt-1.5">{blockReason}</p>}
    </div>
  );
}
