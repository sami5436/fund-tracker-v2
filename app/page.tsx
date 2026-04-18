'use client';

import { useState } from 'react';
import { FUNDS } from '@/lib/constants';
import FundView from '@/components/FundView';

export default function Home() {
  const [activeId, setActiveId] = useState(FUNDS[0].id);
  const activeFund = FUNDS.find((f) => f.id === activeId)!;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky header + tabs */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-xl mx-auto px-4">
          <div className="pt-5 pb-2">
            <h1 className="text-xl font-bold text-gray-900">Fund Nowcast</h1>
            <p className="text-xs text-gray-400 mt-0.5">Real-time NAV estimates</p>
          </div>

          <div className="flex -mb-px">
            {FUNDS.map((fund) => (
              <button
                key={fund.id}
                onClick={() => setActiveId(fund.id)}
                className={`px-4 py-3 min-h-[44px] text-sm font-medium border-b-2 transition-colors touch-manipulation ${
                  activeId === fund.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {fund.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Fund name subheader */}
      <div className="max-w-xl mx-auto px-4 pt-5 pb-1">
        <p className="font-semibold text-gray-800 text-base">{activeFund.fullName}</p>
        <p className="text-xs text-gray-400 mt-0.5">{activeFund.subtitle}</p>
      </div>

      {/* Main content */}
      <div className="max-w-xl mx-auto px-4 py-4">
        {/* key prop remounts FundView when switching tabs so SWR fetches fresh data */}
        <FundView key={activeFund.id} fund={activeFund} />
      </div>
    </div>
  );
}
