// A "foreign stock" is eligible for Finnhub auto-fetch if it's a stock with
// a real market/exchange set — reuses the existing `assets.market` column
// (present since 0001_init.sql, but never actually populated by any form in
// this app until this feature) rather than adding a new column. Assets
// created through the old manual-entry path (Thai funds, or a hand-typed
// foreign stock) leave `market` null, so they're correctly excluded — only
// assets created via the Finnhub search flow (or otherwise given a real
// market value) become auto-fetch-eligible. See DECISIONS.md.
export function isForeignStock(asset: { asset_type: string; market: string | null }): boolean {
  return asset.asset_type === "stock" && !!asset.market;
}
