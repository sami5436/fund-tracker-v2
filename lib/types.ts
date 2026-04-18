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
}

export interface NavRecord {
  date: string;       // YYYY-MM-DD
  actualNav: number;
  estimatedNav: number;
  fundId: string;
}

// Shape returned directly from Supabase (snake_case)
export interface NavRow {
  id: number;
  fund_id: string;
  date: string;
  actual_nav: number;
  estimated_nav: number | null;
  diff: number | null;
  diff_pct: number | null;
  created_at: string;
  updated_at: string;
}
