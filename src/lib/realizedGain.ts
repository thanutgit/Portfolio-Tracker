export interface RealizedGainTransaction {
  type: string;
  /** "YYYY-MM-DD" */
  trade_date: string;
  quantity: number;
  price: number;
  fee: number;
}

// A single unconsumed (or partially consumed) buy lot sitting in the FIFO
// queue, waiting to be matched against a future sell.
interface Lot {
  quantity: number;
  /** Per-unit cost, buy fee folded in: (quantity*price + fee) / quantity. */
  unitCost: number;
}

const EPSILON = 1e-9;

// FIFO-matched realized gain for one asset, summed across every sell in its
// history — not a per-lot breakdown (deliberately; see DECISIONS.md). Real
// Thai/international brokers (Dime, Streaming, Webull, Phillip) all report
// realized gain this way even though the *displayed* avg cost is a single
// weighted-average figure (same as this app's `holdings` view) — the two
// numbers answering different questions (tax/true P&L on what's already
// sold vs. today's blended cost on what's still held) is expected, not a
// bug, hence the "FIFO-based — may differ from average-cost figures shown
// elsewhere" caption wherever this is displayed.
//
// A `WITH RECURSIVE` SQL view (the pattern `holdings`' avg_cost fix uses,
// migration 0012) was considered and rejected: FIFO needs a live queue of
// *multiple simultaneously open lots* being drained from the front and
// re-pushed to across an arbitrary number of sells, which is a genuinely
// stateful queue simulation, not an aggregate or single running total a
// recursive CTE naturally expresses. A plain JS reduce over already-fetched
// rows is both simpler and easier to unit-test than forcing that shape into
// SQL — same reasoning `xirr()` and `computeTaxHoldingStatus()` already
// used to justify staying pure TypeScript instead of a view.
//
// Only `buy`/`sell` rows participate — `dividend`/`fee`/`deposit`/
// `withdraw`/`split` are ignored, same scope `loadXirr()` already uses for
// the same reason (no realized-gain meaning for those types here).
export function computeRealizedGain(transactions: RealizedGainTransaction[]): number {
  const sorted = [...transactions]
    .filter((t) => t.type === "buy" || t.type === "sell")
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date));

  const queue: Lot[] = [];
  let realizedGain = 0;

  for (const t of sorted) {
    if (t.type === "buy") {
      if (t.quantity <= 0) continue;
      queue.push({
        quantity: t.quantity,
        unitCost: (t.quantity * t.price + t.fee) / t.quantity,
      });
      continue;
    }

    // sell
    if (t.quantity <= 0) continue;
    let remaining = t.quantity;
    let costOfSoldLots = 0;
    while (remaining > EPSILON && queue.length > 0) {
      const lot = queue[0];
      const take = Math.min(lot.quantity, remaining);
      costOfSoldLots += take * lot.unitCost;
      lot.quantity -= take;
      remaining -= take;
      if (lot.quantity <= EPSILON) queue.shift();
    }
    // `remaining > 0` here means this sell is larger than every buy lot on
    // record combined — selling something this asset's own transaction
    // history never shows being bought. That can only happen from
    // incomplete/edited data (the app warns, but doesn't block, an
    // oversell — see wouldCauseNegativeHolding() and GOTCHAS.md #1), so
    // there's no real cost basis for the unmatched portion. Rather than
    // fabricate one (treating it as pure profit at 0 cost, or as a loss),
    // its proceeds are simply excluded from realized gain — the same
    // "disclose/exclude degraded data rather than invent a number for it"
    // choice as D130 (an unconvertible FX holding contributes 0, not a
    // guess). Only the matched portion's proceeds are counted.
    const matchedQuantity = t.quantity - remaining;
    const matchedProceeds = matchedQuantity * t.price - (matchedQuantity / t.quantity) * t.fee;
    realizedGain += matchedProceeds - costOfSoldLots;
  }

  return realizedGain;
}
