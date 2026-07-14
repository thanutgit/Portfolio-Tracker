// Whether this asset has CoinGecko-based auto price-refresh — determined
// by the DB-backed `coingecko_id` column (migrations/0013), not a
// hardcoded symbol list. Supersedes D20's original { BTC, ETH } map: any
// crypto asset created via TransactionModal's "Search asset" mode gets a
// real CoinGecko id at creation time, so this scales to any coin instead
// of only the two symbols that used to be hardcoded in this file.
export function hasAutoFetch(asset: { coingecko_id: string | null }): boolean {
  return asset.coingecko_id != null;
}
