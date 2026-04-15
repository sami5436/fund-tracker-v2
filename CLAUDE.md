# Fund Nowcast

Real-time NAV estimator for LGRRX and the NT Collective S&P500 Index Fund, built with Next.js 15 + Tailwind CSS.

## Commands

```bash
npm run dev      # Start dev server (http://localhost:3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint
```

## Architecture

### Data Flow
1. Client (`FundView.tsx`) fetches `/api/stocks?tickers=...` via SWR, auto-refreshing every 60 seconds
2. API route (`app/api/stocks/route.ts`) fetches live quotes from Yahoo Finance via `yahoo-finance2`
3. Client calculates estimated NAV from weighted holdings changes
4. NAV baseline is persisted in `localStorage` per fund

### NAV Estimation Logic
- Fetches `regularMarketPrice` + `regularMarketPreviousClose` for each top-10 holding
- Computes each holding's % change: `((price - prevClose) / prevClose) * 100`
- Weighted sum: `Σ(changePct_i × weight_i / 100)`
- Scales to whole fund assuming unobserved holdings move proportionally:
  `fundChange = weightedSum / totalTop10Weight * 100`
- `estimatedNAV = lastOfficialNAV × (1 + fundChange / 100)`

### Funds
| Fund | Top 10 Coverage | Default NAV |
|------|----------------|-------------|
| LGRRX (Loomis Sayles Large Cap Growth, Class D) | 64.57% | $73.81 |
| NT Collective S&P500 Index Fund - Lending | 38.55% | $65.93 |

## Structure

```
app/
  api/stocks/route.ts   Yahoo Finance proxy (yahoo-finance2)
  layout.tsx            Root layout + metadata
  page.tsx              Tab switching (LGRRX / S&P 500)
  globals.css           Tailwind directives
components/
  FundView.tsx          Per-fund dashboard (NAV input, metrics, table)
  HoldingsTable.tsx     Color-coded holdings data table
lib/
  constants.ts          Fund configs and holdings data
  types.ts              Shared TypeScript types
```

## Key Notes
- NAV inputs persist via `localStorage` (`fund_nav_lgrrx`, `fund_nav_sp500`)
- Stock data auto-refreshes every 60s; manual refresh button available
- Market hours: 8:30 AM – 3:00 PM CST (Mon–Fri). Off-hours shows last close.
- `yahoo-finance2` survey notices are suppressed at the module level
