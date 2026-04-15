'use client';

import type { HoldingWithData } from '@/lib/types';

interface Props {
  holdings: HoldingWithData[];
  fundChange: number;
  officialNav: number;
  estimatedNav: number;
  totalTop10Weight: number;
}

function ContributionBar({ holdings, totalTop10Weight }: { holdings: HoldingWithData[]; totalTop10Weight: number }) {
  const withData = holdings.filter((h) => h.changePct !== null);
  if (!withData.length) return null;

  const contributions = withData.map((h) => ({
    ticker: h.ticker,
    value: (h.changePct! * h.weight) / totalTop10Weight,
    weight: h.weight,
  }));

  const maxAbs = Math.max(...contributions.map((c) => Math.abs(c.value)), 0.01);

  return (
    <div className="space-y-1.5">
      {contributions.map((c) => {
        const pct = (Math.abs(c.value) / maxAbs) * 100;
        const isPos = c.value >= 0;
        return (
          <div key={c.ticker} className="flex items-center gap-2 text-xs">
            <span className="w-10 text-right font-semibold text-gray-600 shrink-0">{c.ticker}</span>
            <div className="flex-1 flex items-center h-4">
              {isPos ? (
                <>
                  <div className="w-1/2 flex justify-end">
                    <div style={{ width: `${pct / 2}%` }} className="min-w-0" />
                  </div>
                  <div className="w-px h-3 bg-gray-200 shrink-0" />
                  <div className="w-1/2 flex justify-start pl-px">
                    <div
                      style={{ width: `${pct}%` }}
                      className="h-2 rounded-sm bg-green-400 min-w-[2px]"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="w-1/2 flex justify-end pr-px">
                    <div
                      style={{ width: `${pct}%` }}
                      className="h-2 rounded-sm bg-red-400 min-w-[2px]"
                    />
                  </div>
                  <div className="w-px h-3 bg-gray-200 shrink-0" />
                  <div className="w-1/2" />
                </>
              )}
            </div>
            <span
              className={`w-12 text-left tabular-nums ${isPos ? 'text-green-700' : 'text-red-600'}`}
            >
              {isPos ? '+' : ''}{c.value.toFixed(3)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function InsightsPanel({
  holdings,
  fundChange,
  officialNav,
  estimatedNav,
  totalTop10Weight,
}: Props) {
  const withData = holdings.filter((h) => h.changePct !== null);
  const up = withData.filter((h) => h.changePct! > 0);
  const down = withData.filter((h) => h.changePct! < 0);
  const flat = withData.filter((h) => h.changePct! === 0);

  // Weighted contribution per holding
  const contributions = withData.map((h) => ({
    ...h,
    contribution: (h.changePct! * h.weight) / totalTop10Weight,
  }));
  const topGainer = contributions.reduce<(typeof contributions)[0] | null>(
    (best, c) => (!best || c.contribution > best.contribution ? c : best),
    null
  );
  const topDrag = contributions.reduce<(typeof contributions)[0] | null>(
    (worst, c) => (!worst || c.contribution < worst.contribution ? c : worst),
    null
  );

  const navDelta = estimatedNav - officialNav;
  const isNavPos = navDelta > 0;
  const isNavNeg = navDelta < 0;

  if (!withData.length) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Insights</h2>

      {/* NAV delta */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">NAV delta vs official</span>
        <span
          className={`text-sm font-bold tabular-nums ${
            isNavPos ? 'text-green-600' : isNavNeg ? 'text-red-600' : 'text-gray-400'
          }`}
        >
          {isNavPos ? '+' : ''}${navDelta.toFixed(2)}
        </span>
      </div>

      {/* Breadth */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500">Breadth</span>
          <span className="text-xs text-gray-400">
            {up.length} up · {flat.length} flat · {down.length} down
          </span>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden gap-px bg-gray-100">
          {up.length > 0 && (
            <div
              className="bg-green-400 transition-all"
              style={{ width: `${(up.length / withData.length) * 100}%` }}
            />
          )}
          {flat.length > 0 && (
            <div
              className="bg-gray-300 transition-all"
              style={{ width: `${(flat.length / withData.length) * 100}%` }}
            />
          )}
          {down.length > 0 && (
            <div
              className="bg-red-400 transition-all"
              style={{ width: `${(down.length / withData.length) * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Top mover chips */}
      {(topGainer || topDrag) && (
        <div className="flex gap-2">
          {topGainer && topGainer.contribution > 0 && (
            <div className="flex-1 bg-green-50 rounded-lg px-3 py-2">
              <p className="text-xs text-green-600 font-medium">Top contributor</p>
              <p className="text-sm font-bold text-green-700 mt-0.5">{topGainer.ticker}</p>
              <p className="text-xs text-green-600 tabular-nums">
                +{topGainer.contribution.toFixed(3)}% to NAV
              </p>
            </div>
          )}
          {topDrag && topDrag.contribution < 0 && (
            <div className="flex-1 bg-red-50 rounded-lg px-3 py-2">
              <p className="text-xs text-red-500 font-medium">Top drag</p>
              <p className="text-sm font-bold text-red-600 mt-0.5">{topDrag.ticker}</p>
              <p className="text-xs text-red-500 tabular-nums">
                {topDrag.contribution.toFixed(3)}% to NAV
              </p>
            </div>
          )}
        </div>
      )}

      {/* Contribution waterfall */}
      <div>
        <p className="text-xs text-gray-400 mb-2">Contribution to fund change</p>
        <ContributionBar holdings={holdings} totalTop10Weight={totalTop10Weight} />
      </div>
    </div>
  );
}
