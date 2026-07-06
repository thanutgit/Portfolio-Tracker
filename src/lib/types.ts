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

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  asset_type: string;
  currency: string;
  sector: string | null;
  country: string | null;
  tax_bucket: string;
}
