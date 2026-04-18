'use client';

import { useMemo, useRef, useState } from 'react';
import type { Holding, TickerSeries } from '@/lib/types';

interface Props {
  holdings: Holding[];
  series: TickerSeries[];
  officialNav: number;
  totalTop10Weight: number;
}

interface Point {
  t: number; // unix seconds
  nav: number;
  changePct: number;
}

function buildNavSeries(
  holdings: Holding[],
  series: TickerSeries[],
  officialNav: number,
  totalTop10Weight: number
): Point[] {
  // Use the longest timestamp series as the x-axis reference
  const ref = series.reduce(
    (longest, s) => (s.timestamps.length > longest.timestamps.length ? s : longest),
    series[0] ?? { timestamps: [], closes: [], prevClose: null, ticker: '' }
  );
  if (!ref.timestamps.length) return [];

  // Index each ticker's closes by timestamp for fast lookup
  const seriesByTicker = new Map<string, TickerSeries>();
  series.forEach((s) => seriesByTicker.set(s.ticker, s));

  // Forward-fill last known close per ticker so early gaps don't drag the chart
  const lastClose = new Map<string, number>();

  const points: Point[] = [];

  for (let i = 0; i < ref.timestamps.length; i++) {
    const t = ref.timestamps[i];
    let weightedSum = 0;

    for (const h of holdings) {
      const s = seriesByTicker.get(h.ticker);
      if (!s || s.prevClose == null || s.prevClose === 0) continue;

      // Find close at this timestamp in this ticker's series
      const idx = s.timestamps.indexOf(t);
      let close: number | null = null;
      if (idx !== -1 && s.closes[idx] != null) close = s.closes[idx] as number;

      if (close != null) lastClose.set(h.ticker, close);
      else {
        const carry = lastClose.get(h.ticker);
        if (carry != null) close = carry;
      }

      if (close == null) continue;
      const changePct = ((close - s.prevClose) / s.prevClose) * 100;
      weightedSum += (changePct * h.weight) / 100;
    }

    const fundChange = (weightedSum / totalTop10Weight) * 100;
    const nav = officialNav * (1 + fundChange / 100);
    points.push({ t, nav, changePct: fundChange });
  }

  return points;
}

function formatTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function NavChart({ holdings, series, officialNav, totalTop10Weight }: Props) {
  const points = useMemo(
    () => buildNavSeries(holdings, series, officialNav, totalTop10Weight),
    [holdings, series, officialNav, totalTop10Weight]
  );

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  if (points.length < 2) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400 text-sm">
        Waiting for intraday data…
      </div>
    );
  }

  const navs = points.map((p) => p.nav);
  const minNav = Math.min(...navs, officialNav);
  const maxNav = Math.max(...navs, officialNav);
  // Pad the y-range slightly so the line doesn't touch the edges
  const pad = Math.max((maxNav - minNav) * 0.15, officialNav * 0.0005);
  const yMin = minNav - pad;
  const yMax = maxNav + pad;

  const W = 640;
  const H = 180;
  const PAD_L = 8;
  const PAD_R = 8;
  const PAD_T = 12;
  const PAD_B = 22;

  const xFor = (i: number) =>
    PAD_L + ((W - PAD_L - PAD_R) * i) / Math.max(points.length - 1, 1);
  const yFor = (nav: number) =>
    PAD_T + (H - PAD_T - PAD_B) * (1 - (nav - yMin) / Math.max(yMax - yMin, 1e-9));

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(2)} ${yFor(p.nav).toFixed(2)}`)
    .join(' ');

  const areaPath = `${linePath} L ${xFor(points.length - 1).toFixed(2)} ${H - PAD_B} L ${xFor(0).toFixed(2)} ${H - PAD_B} Z`;

  const last = points[points.length - 1];
  const first = points[0];
  const dayChange = last.nav - first.nav;
  const isUp = last.nav >= officialNav;
  const color = isUp ? '#22c55e' : '#ef4444';
  const fillColor = isUp ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)';

  const displayed = hoverIdx != null ? points[hoverIdx] : last;

  const handleMove = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xInSvg = ((clientX - rect.left) / rect.width) * W;
    const rel = (xInSvg - PAD_L) / (W - PAD_L - PAD_R);
    const idx = Math.round(rel * (points.length - 1));
    setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
  };

  // Tick marks — ~4 evenly spaced labels across the day
  const tickCount = 4;
  const tickIdxs = Array.from({ length: tickCount }, (_, i) =>
    Math.round((i * (points.length - 1)) / (tickCount - 1))
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            {hoverIdx != null ? formatTime(displayed.t) : 'Intraday Estimate'}
          </p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums mt-0.5">
            ${displayed.nav.toFixed(2)}
          </p>
        </div>
        <div className="text-right">
          <p
            className={`text-sm font-semibold tabular-nums ${
              displayed.changePct > 0
                ? 'text-green-600'
                : displayed.changePct < 0
                  ? 'text-red-600'
                  : 'text-gray-400'
            }`}
          >
            {displayed.changePct > 0 ? '+' : ''}
            {displayed.changePct.toFixed(3)}%
          </p>
          <p className="text-xs text-gray-400 tabular-nums">
            {dayChange >= 0 ? '+' : ''}${dayChange.toFixed(2)} today
          </p>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none touch-none"
        onMouseMove={(e) => handleMove(e.clientX)}
        onMouseLeave={() => setHoverIdx(null)}
        onTouchStart={(e) => e.touches[0] && handleMove(e.touches[0].clientX)}
        onTouchMove={(e) => e.touches[0] && handleMove(e.touches[0].clientX)}
        onTouchEnd={() => setHoverIdx(null)}
      >
        {/* Official NAV reference line */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={yFor(officialNav)}
          y2={yFor(officialNav)}
          stroke="#d1d5db"
          strokeWidth={1}
          strokeDasharray="3 3"
        />

        {/* Filled area under curve */}
        <path d={areaPath} fill={fillColor} />

        {/* Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />

        {/* Hover indicator */}
        {hoverIdx != null && (
          <>
            <line
              x1={xFor(hoverIdx)}
              x2={xFor(hoverIdx)}
              y1={PAD_T}
              y2={H - PAD_B}
              stroke="#9ca3af"
              strokeWidth={1}
            />
            <circle
              cx={xFor(hoverIdx)}
              cy={yFor(points[hoverIdx].nav)}
              r={4}
              fill={color}
              stroke="white"
              strokeWidth={2}
            />
          </>
        )}

        {/* Time tick labels */}
        {tickIdxs.map((idx, i) => (
          <text
            key={i}
            x={xFor(idx)}
            y={H - 6}
            textAnchor={i === 0 ? 'start' : i === tickIdxs.length - 1 ? 'end' : 'middle'}
            fontSize={10}
            fill="#9ca3af"
          >
            {formatTime(points[idx].t)}
          </text>
        ))}
      </svg>

      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>Low ${Math.min(...navs).toFixed(2)}</span>
        <span className="text-gray-300">· Official ${officialNav.toFixed(2)} ·</span>
        <span>High ${Math.max(...navs).toFixed(2)}</span>
      </div>
    </div>
  );
}
