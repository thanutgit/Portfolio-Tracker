// Symbol -> CoinGecko coin id. Only symbols listed here are auto-refreshed
// via /api/refresh-crypto-prices — every other asset needs a manual price
// (see the Prices page, which filters its asset picker down to these).
export const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
};

export function hasAutoFetch(symbol: string): boolean {
  return symbol.toUpperCase() in COINGECKO_IDS;
}

// Display names for TransactionModal's crypto search — deliberately scoped
// to the same symbols as COINGECKO_IDS (not the full CoinGecko universe),
// so anything creatable via search also gets auto price-refresh for free.
// A symbol missing here just falls back to showing its own ticker.
const COINGECKO_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
};

export const CRYPTO_SEARCH_ENTRIES: { symbol: string; name: string; coingeckoId: string }[] =
  Object.entries(COINGECKO_IDS).map(([symbol, coingeckoId]) => ({
    symbol,
    name: COINGECKO_NAMES[symbol] ?? symbol,
    coingeckoId,
  }));
