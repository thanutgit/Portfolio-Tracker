export interface TxnPoint {
  id: string;
  type: string;
  trade_date: string;
  quantity: number;
}

export interface TxnReplacement {
  type: string;
  trade_date: string;
  quantity: number;
}

// Replays every buy/sell transaction for an asset in chronological order,
// with one transaction edited (`replacement`) or removed (`replacement =
// null`), and reports whether the running held quantity would ever dip
// below zero. Used to warn (not block) before an edit/delete that could
// leave an earlier point in the timeline holding a negative quantity — see
// GOTCHAS.md #1 for the incident this guards against.
export function wouldCauseNegativeHolding(
  transactions: TxnPoint[],
  editedId: string | null,
  replacement: TxnReplacement | null
): boolean {
  const effective = transactions
    .filter((t) => !(t.id === editedId && replacement === null))
    .map((t) => (t.id === editedId && replacement ? { ...t, ...replacement } : t));

  const sorted = [...effective].sort(
    (a, b) => a.trade_date.localeCompare(b.trade_date) || a.id.localeCompare(b.id)
  );

  let running = 0;
  for (const t of sorted) {
    running += t.type === "buy" ? t.quantity : -t.quantity;
    if (running < -1e-9) return true;
  }
  return false;
}
