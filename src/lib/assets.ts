import { supabase } from "@/lib/supabase";
import type { Asset } from "@/lib/types";

export const ASSET_TYPES = ["stock", "etf", "fund", "bond", "cash", "crypto"];
export const CURRENCIES = ["THB", "USD", "EUR", "GBP", "JPY"];
export const TAX_BUCKETS = ["normal", "RMF", "SSF", "ThaiESG"];

export interface NewAssetInput {
  symbol: string;
  name: string;
  asset_type: string;
  currency: string;
  sector: string;
  country: string;
  tax_bucket: string;
  // Exchange/market code, e.g. "NASDAQ" — only ever set via the Finnhub
  // search flow in TransactionModal; the manual-entry path never collects
  // this (no UI field for it), so it stays null there, same as before.
  market?: string | null;
}

// The schema's unique constraint is on (symbol, market) — forms in this app
// never collect `market` (always NULL here), and NULL != NULL for
// uniqueness purposes in Postgres, so that constraint alone wouldn't
// reliably catch a duplicate symbol. Check explicitly first; the DB-error
// translation in createAsset()/EditAssetModal is just a fallback in case
// the constraint does fire from some other path.
export async function isSymbolTaken(
  symbol: string,
  excludeId?: string
): Promise<{ taken: boolean; error: string | null }> {
  let query = supabase.from("assets").select("id").ilike("symbol", symbol).limit(1);
  if (excludeId) {
    query = query.neq("id", excludeId);
  }
  const { data, error } = await query;
  if (error) {
    return { taken: false, error: error.message };
  }
  return { taken: (data?.length ?? 0) > 0, error: null };
}

// Used by TransactionModal's inline "+ add new asset" form.
export async function createAsset(
  input: NewAssetInput
): Promise<{ data: Asset | null; error: string | null }> {
  const trimmedSymbol = input.symbol.trim();
  const trimmedName = input.name.trim();
  if (!trimmedSymbol || !trimmedName) {
    return { data: null, error: "Symbol and name are required." };
  }

  const { taken, error: lookupError } = await isSymbolTaken(trimmedSymbol);
  if (lookupError) {
    return { data: null, error: lookupError };
  }
  if (taken) {
    return { data: null, error: `An asset with symbol "${trimmedSymbol}" already exists.` };
  }

  const { data, error } = await supabase
    .from("assets")
    .insert({
      symbol: trimmedSymbol,
      name: trimmedName,
      asset_type: input.asset_type,
      currency: input.currency,
      sector: input.sector.trim() || null,
      country: input.country.trim() || null,
      tax_bucket: input.tax_bucket,
      market: input.market?.trim() || null,
    })
    .select("id, symbol, name, asset_type, currency, sector, country, tax_bucket, market")
    .single();
  if (error) {
    if (error.code === "23505" || /duplicate key/i.test(error.message)) {
      return { data: null, error: `An asset with symbol "${trimmedSymbol}" already exists.` };
    }
    return { data: null, error: error.message };
  }

  return { data, error: null };
}
