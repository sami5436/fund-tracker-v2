export interface Holding {
  ticker: string;
  name: string;
  weight: number;
}

export interface StockQuote {
  ticker: string;
  price: number | null;
  prevClose: number | null;
  changePct: number | null;
  updatedAt: string | null;
}

export interface HoldingWithData extends Holding {
  price: number | null;
  changePct: number | null;
  updatedAt: string | null;
}

export interface TickerSeries {
  ticker: string;
  prevClose: number | null;
  timestamps: number[]; // unix seconds
  closes: (number | null)[];
}

export interface FundConfig {
  id: string;
  name: string;
  fullName: string;
  subtitle: string;
  holdings: Holding[];
  totalTop10Weight: number;
  defaultNav: number;
  navStorageKey: string;
  // ETF ticker used to model the unobserved residual (1 - totalTop10Weight) for the v2 estimator.
  residualProxy?: string;
  // Optional basket to remove from the proxy before using it for the fund's residual.
  proxyExclusionHoldings?: Holding[];
}

export interface NavRecord {
  date: string;       // YYYY-MM-DD
  actualNav: number;
  estimatedNav: number;
  estimatedNavV2?: number | null;
  fundId: string;
}

export interface FundHolding {
  ticker: string;
  name: string;
  weight: number; // percent (0-100)
}

export interface FidelityFund {
  ticker: string;
  name: string;
  category: string | null;       // e.g. "Large Growth"
  family: string | null;         // e.g. "Fidelity Investments"
  riskRating: number | null;     // Morningstar risk 1-5
  morningstarRating: number | null; // Morningstar overall 1-5
  expenseRatio: number | null;   // percent (e.g. 0.46)
  totalAssets: number | null;    // AUM in USD
  yield: number | null;          // percent
  beta: number | null;
  ytdReturn: number | null;      // percent
  return1Y: number | null;       // percent (total return, 1 year)
  return3Y: number | null;       // percent
  return5Y: number | null;       // percent
  return10Y: number | null;      // percent
  low52: number | null;          // 52-week low NAV
  high52: number | null;         // 52-week high NAV
  turnover: number | null;       // holdings turnover percent
  inceptionDate: string | null;  // e.g. "Feb 17, 1988"
  holdings: FundHolding[];       // top 10
  fetchedAt: string;             // ISO timestamp
}

// Shape returned directly from Supabase (snake_case)
export interface NavRow {
  id: number;
  fund_id: string;
  date: string;
  actual_nav: number;
  estimated_nav: number | null;
  estimated_nav_v2: number | null;
  diff: number | null;
  diff_pct: number | null;
  diff_v2: number | null;
  diff_pct_v2: number | null;
  created_at: string;
  updated_at: string;
}
