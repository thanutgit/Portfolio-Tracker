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
