// Whether this asset has CoinGecko-based auto price-refresh — determined
// by `assets.price_source` (migrations/0015), a dedicated column set
// directly at asset-creation time. `coingecko_id` used to double as this
// eligibility flag (supersedes D20's original hardcoded { BTC, ETH } map,
// then D95-era reuse) — kept as the actual CoinGecko coin id
// /api/refresh-crypto-prices needs, but no longer read here as an
// eligibility check. See DECISIONS.md D154.
export function hasAutoFetch(asset: { price_source: string | null }): boolean {
  return asset.price_source === "coingecko";
}
