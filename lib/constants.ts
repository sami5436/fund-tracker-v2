import type { FundConfig } from './types';

// Curated seed list of Fidelity fund tickers for the Fund Finder.
// Metadata, holdings, ratings, expense ratio, etc. are fetched live from Yahoo
// Finance via /api/funds and cached server-side for 24h.
// Add new tickers here — no other code changes required.
export const FIDELITY_FUND_TICKERS: string[] = [
  // Fidelity Select sector funds
  'FSELX', // Semiconductors
  'FSPTX', // Technology
  'FSCSX', // Software & IT Services
  'FBSOX', // IT Services
  'FSPHX', // Health Care
  'FBIOX', // Biotechnology
  'FPHAX', // Pharmaceuticals
  'FSMEX', // Medical Tech & Devices
  'FSHCX', // Health Care Services
  'FSENX', // Energy
  'FSESX', // Energy Service
  'FSNGX', // Natural Gas
  'FNARX', // Natural Resources
  'FSAGX', // Gold
  'FSCHX', // Chemicals
  'FSDPX', // Materials
  'FSUTX', // Utilities
  'FIDSX', // Financial Services
  'FSRBX', // Banking
  'FSLBX', // Brokerage & Investment Management
  'FSPCX', // Insurance
  'FRESX', // Real Estate
  'FSDAX', // Defense & Aerospace
  'FCYIX', // Industrials
  'FSAIX', // Air Transportation
  'FSRFX', // Transportation
  'FSAVX', // Automotive
  'FSHOX', // Construction & Housing
  'FSDCX', // Communications Equipment
  'FBMPX', // Communications
  'FSTCX', // Telecommunications
  'FWRLX', // Wireless
  'FDFAX', // Consumer Staples
  'FSRPX', // Retailing
  'FSCPX', // Consumer Discretionary
  'FDLSX', // Leisure
  'FSLEX', // Environment & Alternative Energy

  // Broad active funds
  'FCNTX', // Contrafund
  'FBGRX', // Blue Chip Growth
  'FMAGX', // Magellan
  'FDGRX', // Growth Company
  'FLPSX', // Low-Priced Stock
  'FDCAX', // Capital Appreciation
  'FDEQX', // Disciplined Equity
  'FDGFX', // Dividend Growth
  'FFIDX', // Fidelity Fund
  'FDSSX', // Stock Selector All Cap
  'FEXPX', // Export and Multinational
  'FLCSX', // Large Cap Stock
  'FOCPX', // OTC Portfolio
  'FTRNX', // Trend Fund
  'FSCRX', // Small Cap Discovery
  'FCPGX', // Small Cap Growth
  'FSLCX', // Small Cap Stock

  // Index / passive
  'FXAIX', // 500 Index
  'FNILX', // ZERO Large Cap
  'FZROX', // ZERO Total Market
  'FZIPX', // ZERO Extended Market
  'FZILX', // ZERO International
  'FSKAX', // Total Market Index
  'FSPSX', // International Index
  'FSPGX', // Large Cap Growth Index
  'FSMDX', // Mid Cap Index
  'FSSNX', // Small Cap Index
  'FTIHX', // Total International Index
  'FNCMX', // Nasdaq Composite Index
  'FXNAX', // U.S. Bond Index
  'FSGGX', // Global ex U.S. Index
  'FSMAX', // Extended Market Index
  'FLCEX', // Large Cap Core Enhanced
];


export const FUNDS: FundConfig[] = [
  {
    id: 'sp500',
    name: 'S&P 500',
    fullName: 'NT Collective S&P500 Index Fund – Lending',
    subtitle: 'U.S. Equity · Large Blend · 506 holdings',
    defaultNav: 65.93,
    navStorageKey: 'fund_nav_sp500',
    totalTop10Weight: 36.32,
    residualProxy: 'SPY',
    proxyExclusionHoldings: [
      { ticker: 'NVDA',  name: 'NVIDIA Corp',        weight: 8.29 },
      { ticker: 'AAPL',  name: 'Apple Inc',          weight: 7.09 },
      { ticker: 'MSFT',  name: 'Microsoft Corp',     weight: 5.02 },
      { ticker: 'AMZN',  name: 'Amazon.com',         weight: 3.84 },
      { ticker: 'GOOGL', name: 'Alphabet A',         weight: 3.23 },
      { ticker: 'AVGO',  name: 'Broadcom Inc',       weight: 3.50 },
      { ticker: 'GOOG',  name: 'Alphabet C',         weight: 2.57 },
      { ticker: 'META',  name: 'Meta Platforms',     weight: 2.00 },
      { ticker: 'TSLA',  name: 'Tesla Inc',          weight: 1.82 },
      { ticker: 'BRK-B', name: 'Berkshire B',        weight: 1.38 },
    ],
    holdings: [
      { ticker: 'NVDA',  name: 'NVIDIA Corp',        weight: 7.54 },
      { ticker: 'AAPL',  name: 'Apple Inc',          weight: 6.63 },
      { ticker: 'MSFT',  name: 'Microsoft Corp',     weight: 4.89 },
      { ticker: 'AMZN',  name: 'Amazon.com',         weight: 3.62 },
      { ticker: 'GOOGL', name: 'Alphabet A',         weight: 2.98 },
      { ticker: 'AVGO',  name: 'Broadcom Inc',       weight: 2.61 },
      { ticker: 'GOOG',  name: 'Alphabet C',         weight: 2.39 },
      { ticker: 'META',  name: 'Meta Platforms',     weight: 2.23 },
      { ticker: 'TSLA',  name: 'Tesla Inc',          weight: 1.86 },
      { ticker: 'BRK-B', name: 'Berkshire B',        weight: 1.56 },
    ],
  },
  {
    id: 'lgrrx',
    name: 'LGRRX',
    fullName: 'Loomis Sayles Large Cap Growth',
    subtitle: 'Class D',
    defaultNav: 73.81,
    navStorageKey: 'fund_nav_lgrrx',
    totalTop10Weight: 64.85,
    residualProxy: 'IWF',
    holdings: [
      { ticker: 'NVDA',  name: 'NVIDIA',    weight: 11.75 },
      { ticker: 'META',  name: 'Meta',       weight: 7.92  },
      { ticker: 'NFLX',  name: 'Netflix',    weight: 4.80  },
      { ticker: 'TSLA',  name: 'Tesla',      weight: 8.35  },
      { ticker: 'AMZN',  name: 'Amazon',     weight: 6.18  },
      { ticker: 'ORCL',  name: 'Oracle',     weight: 4.05  },
      { ticker: 'GOOGL', name: 'Alphabet',   weight: 8.53  },
      { ticker: 'V',     name: 'Visa',       weight: 4.43  },
      { ticker: 'BA',    name: 'Boeing',     weight: 5.02  },
      { ticker: 'MSFT',  name: 'Microsoft',  weight: 3.82  },
    ],
  },
  {
    id: 'fsrpx',
    name: 'FSRPX',
    fullName: 'Fidelity Select Retailing Portfolio',
    subtitle: 'Sector Equity · Consumer Cyclical · 46 holdings',
    defaultNav: 17.21,
    navStorageKey: 'fund_nav_fsrpx',
    publicNavTicker: 'FSRPX',
    totalTop10Weight: 69.93,
    residualProxy: 'XRT',
    holdings: [
      { ticker: 'AMZN', name: 'Amazon.com Inc',          weight: 30.01 },
      { ticker: 'WMT',  name: 'Walmart Inc',             weight: 11.10 },
      { ticker: 'COST', name: 'Costco Wholesale Corp',   weight: 6.77  },
      { ticker: 'LOW',  name: "Lowe's Cos Inc",          weight: 6.11  },
      { ticker: 'ORLY', name: "O'Reilly Automotive Inc", weight: 3.12  },
      { ticker: 'ROST', name: 'Ross Stores Inc',         weight: 2.98  },
      { ticker: 'TJX',  name: 'TJX Companies Inc',       weight: 2.82  },
      { ticker: 'TGT',  name: 'Target Corp',             weight: 2.65  },
      { ticker: 'MELI', name: 'MercadoLibre Inc',        weight: 2.33  },
      { ticker: 'DLTR', name: 'Dollar Tree Inc',         weight: 2.04  },
    ],
  },
];
