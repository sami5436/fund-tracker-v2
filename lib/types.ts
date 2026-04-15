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
