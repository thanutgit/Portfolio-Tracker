export interface Portfolio {
  id: string;
  name: string;
  base_currency: string;
}

// Numeric columns come back from PostgREST as strings to preserve precision.
export interface Holding {
  portfolio_id: string;
  asset_id: string;
  symbol: string;
  name: string;
  currency: string;
  quantity: string;
  avg_cost: string;
  last_price: string | null;
  cost_basis: string;
  market_value: string | null;
  unrealized_pnl: string | null;
  unrealized_pct: string | null;
}

export interface Target {
  id: string;
  portfolio_id: string;
  asset_id: string;
  target_pct: string;
  drift_threshold: string;
  created_at: string;
}

// `holdings` + net dividends + total return (Phase 3, dividends slice).
export interface HoldingWithReturns extends Holding {
  net_dividends: string;
  total_return: string;
  total_return_pct: string | null;
}

// A single dividend transaction (transactions where type = 'dividend').
export interface DividendTransaction {
  id: string;
  trade_date: string;
  price: string; // gross dividend amount
  tax: string; // withholding tax amount
  fee: string;
}

// A single buy/sell transaction (transactions where type in ('buy','sell')).
export interface AssetTransaction {
  id: string;
  type: "buy" | "sell";
  trade_date: string;
  quantity: string;
  price: string;
  fee: string;
}

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  asset_type: string;
  currency: string;
  sector: string | null;
  country: string | null;
  tax_bucket: string;
  // Exchange/market code (e.g. "NASDAQ", "NYSE") — populated automatically
  // when an asset is created via the Finnhub search flow (see
  // src/lib/finnhub.ts's isForeignStock()); null for everything else,
  // including Thai funds and any asset created via manual entry.
  market: string | null;
  // CoinGecko coin id (e.g. "bitcoin") — populated automatically when a
  // crypto asset is created via "Search asset" in TransactionModal; null
  // for non-crypto assets and for crypto assets created before this
  // column existed (migrations/0013) or via manual entry. Used by
  // /api/refresh-crypto-prices to know which coins to auto-refresh.
  coingecko_id: string | null;
}
