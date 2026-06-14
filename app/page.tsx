'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { FUNDS } from '@/lib/constants';
import type { StockQuote } from '@/lib/types';
import { formatSignedDollar } from '@/lib/format';
import FundView from '@/components/FundView';
import FundFinder from '@/components/FundFinder';
import FundCompare from '@/components/FundCompare';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const FINDER_ID = 'finder';
const COMPARE_ID = 'compare';

export default function Home() {
  const [activeId, setActiveId] = useState<string>(FUNDS[0].id);
  const activeFund = FUNDS.find((f) => f.id === activeId);
  const [clock, setClock] = useState('');

  const { data: spyData } = useSWR<StockQuote[]>(
    '/api/stocks?tickers=SPY',
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false }
  );
  const spy = spyData?.[0];
  const spyUp = spy?.changePct != null && spy.changePct > 0;
  const spyDown = spy?.changePct != null && spy.changePct < 0;

  useEffect(() => {
    function tick() {
      const now = new Date();
      setClock(
        now.toLocaleTimeString('en-US', {
          timeZone: 'America/Chicago',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }) +
          ' CST · ' +
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky header + tabs */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-xl mx-auto px-3 sm:px-4">
          <div className="flex flex-col gap-2 pb-2 pt-3 sm:flex-row sm:items-start sm:justify-between sm:pt-5">
            <h1 className="text-xl font-bold text-gray-900 shrink-0">Fund Nowcast</h1>
            <div className="flex min-w-0 flex-col items-start gap-1 sm:items-end sm:gap-0.5">
              {clock && (
                <span className="max-w-full text-xs text-gray-400 tabular-nums">
                  {clock}
                </span>
              )}
              {spy?.price != null && (
                <span className="inline-flex max-w-full flex-wrap items-center text-xs tabular-nums border border-gray-200 rounded-md px-2.5 py-1 bg-white sm:text-sm">
                  <span className="text-gray-500 font-medium">SPY</span>
                  <span className="text-gray-700 ml-1">${spy.price.toFixed(2)}</span>
                  {spy.changePct != null && (
                    <span
                      className={`ml-1 font-semibold ${
                        spyUp ? 'text-green-600' : spyDown ? 'text-red-600' : 'text-gray-400'
                      }`}
                    >
                      {spy.prevClose != null && (
                        <>{formatSignedDollar(spy.price - spy.prevClose)} </>
                      )}
                      ({spyUp ? '+' : ''}{spy.changePct.toFixed(2)}%)
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          <div className="-mx-3 flex -mb-px overflow-x-auto overscroll-x-contain px-3 hide-scrollbar sm:-mx-4 sm:px-4">
            {FUNDS.map((fund) => (
              <button
                key={fund.id}
                onClick={() => setActiveId(fund.id)}
                className={`px-4 py-3 min-h-[44px] shrink-0 text-sm font-medium border-b-2 transition-colors touch-manipulation ${
                  activeId === fund.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {fund.name}
              </button>
            ))}
            <button
              onClick={() => setActiveId(FINDER_ID)}
              className={`px-4 py-3 min-h-[44px] shrink-0 text-sm font-medium border-b-2 transition-colors touch-manipulation ${
                activeId === FINDER_ID
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Fund Finder
            </button>
            <button
              onClick={() => setActiveId(COMPARE_ID)}
              className={`px-4 py-3 min-h-[44px] shrink-0 text-sm font-medium border-b-2 transition-colors touch-manipulation ${
                activeId === COMPARE_ID
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Compare
            </button>
          </div>
        </div>
      </div>

      {activeFund ? (
        <>
          {/* Fund name subheader */}
          <div className="max-w-xl mx-auto px-3 pt-4 pb-1 sm:px-4 sm:pt-5">
            <p className="font-semibold text-gray-800 text-base">{activeFund.fullName}</p>
            <p className="text-xs text-gray-400 mt-0.5">{activeFund.subtitle}</p>
          </div>

          {/* Main content */}
          <div className="max-w-xl mx-auto px-3 py-3 sm:px-4 sm:py-4">
            <FundView key={activeFund.id} fund={activeFund} />
          </div>
        </>
      ) : activeId === COMPARE_ID ? (
        <>
          <div className="max-w-6xl mx-auto px-3 pt-4 pb-1 sm:px-4 sm:pt-5">
            <p className="font-semibold text-gray-800 text-base">Fund Comparison Lab</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Compare returns, crash behavior, correlation, and long-range outcomes.
            </p>
          </div>
          <div className="max-w-6xl mx-auto px-3 py-3 sm:px-4 sm:py-4">
            <FundCompare />
          </div>
        </>
      ) : (
        <>
          <div className="max-w-xl mx-auto px-3 pt-4 pb-1 sm:px-4 sm:pt-5">
            <p className="font-semibold text-gray-800 text-base">Fidelity Fund Finder</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Rank tickers, filter by category/risk/rating, find funds that match.
            </p>
          </div>
          <div className="max-w-xl mx-auto px-3 py-3 sm:px-4 sm:py-4">
            <FundFinder />
          </div>
        </>
      )}
    </div>
  );
}
