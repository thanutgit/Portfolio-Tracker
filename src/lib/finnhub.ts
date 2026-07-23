// A "foreign stock" is eligible for Finnhub auto-fetch based on
// `assets.price_source` (migrations/0015) — a dedicated column, set
// directly at asset-creation time, not derived from whether `market`
// happens to be non-null. `market` used to double as this eligibility
// flag (D95), but Finnhub's /stock/profile2 returns an empty profile for
// a lot of ETFs (SCHD, SPY, ...), which left `market` null for a real,
// Finnhub-confirmed symbol and silently excluded it from both auto-fetch
// and the Prices page's manual-entry list at once — see GOTCHAS.md #11
// and DECISIONS.md D154. `market` still gets set when Finnhub returns a
// real exchange (purely informational now), but is never read here.
export function isForeignStock(asset: { price_source: string | null }): boolean {
  return asset.price_source === "finnhub";
}
