// Looks up the exchange rate from `fromCurrency` to `toCurrency` on
// `date` (YYYY-MM-DD), via the server-side /api/fx-rate route (never
// calls Frankfurter directly from the client — see that route). Same-
// currency lookups (the common case: most of this app's transactions
// are THB in a THB-base portfolio) return 1 immediately without a
// network call at all.
export async function getFxRate(
  fromCurrency: string,
  toCurrency: string,
  date: string
): Promise<number> {
  if (fromCurrency === toCurrency) {
    return 1;
  }

  const res = await fetch(
    `/api/fx-rate?from=${encodeURIComponent(fromCurrency)}&to=${encodeURIComponent(toCurrency)}&date=${encodeURIComponent(date)}`
  );
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? `FX rate lookup failed (${res.status})`);
  }
  return body.rate as number;
}

// Key used to look up a rate in the Map returned by getFxRatesForPairs —
// exported so callers use the exact same format when reading it back.
export function fxPairKey(fromCurrency: string, toCurrency: string): string {
  return `${fromCurrency}->${toCurrency}`;
}

// Batch version for converting a set of holdings (each with its own
// currency) into one portfolio total: dedupes to one getFxRate() call per
// distinct (from, to) pair — e.g. 5 USD holdings in a THB portfolio still
// only cost one Frankfurter round-trip, not 5 — and reports which pairs
// failed instead of throwing, so a caller can total up what it can and
// disclose the rest rather than breaking the whole page over one bad
// lookup. Callers are expected to cache the returned Map in state and
// reuse it across renders rather than calling this on every render.
export async function getFxRatesForPairs(
  pairs: { from: string; to: string }[],
  date: string
): Promise<{ rates: Map<string, number>; failed: { from: string; to: string }[] }> {
  const uniquePairs = Array.from(
    new Map(pairs.map((p) => [fxPairKey(p.from, p.to), p])).values()
  );

  const results = await Promise.allSettled(
    uniquePairs.map((p) => getFxRate(p.from, p.to, date))
  );

  const rates = new Map<string, number>();
  const failed: { from: string; to: string }[] = [];
  results.forEach((result, i) => {
    const pair = uniquePairs[i];
    if (result.status === "fulfilled") {
      rates.set(fxPairKey(pair.from, pair.to), result.value);
    } else {
      failed.push(pair);
    }
  });
  return { rates, failed };
}

// Sums each non-base-currency holding's RAW (unconverted) market_value by
// currency — for disclosing what a converted total is made of (e.g.
// "15.00 HKD + 30.00 USD" alongside a THB total), not for the conversion
// itself (that's getFxRatesForPairs above). Currencies equal to
// baseCurrency are excluded — restating a THB amount inside a THB total
// would be redundant. Sorted by currency code for a stable order that
// doesn't reshuffle between renders.
export function nonBaseCurrencyTotals(
  holdings: { currency: string; market_value: string | number | null }[],
  baseCurrency: string
): { currency: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const h of holdings) {
    if (h.currency === baseCurrency) continue;
    const value = Number(h.market_value ?? 0);
    totals.set(h.currency, (totals.get(h.currency) ?? 0) + value);
  }
  return Array.from(totals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount }));
}
