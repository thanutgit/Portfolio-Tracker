# Decisions

Append-only log of "why it's this way." Before reversing any of these, read the
reason first — don't silently second-guess a settled choice.

## D1 — Holdings are computed, not stored
Current quantity/cost per asset is derived from `transactions` via the
`holdings` view, not kept in a table. Storing holdings directly can't produce
correct average cost, realized P&L on partial sells, or dividend-inclusive
return; a ledger can.

## D2 — `transactions` is the single source of truth
Every buy/sell/dividend/fee/deposit/withdraw is a row. All balances and returns
derive from it — enables cost basis, realized/unrealized P&L, and XIRR later
without schema changes.

## D3 — `quantity` stored positive; direction from `type`
`buy` adds, `sell` subtracts, decided by `type`. Avoids sign-handling bugs.

## D4 — Cash is an asset (`asset_type = 'cash'`)
Deposits/withdrawals are transactions. Lets allocation include cash with no
special-case logic.

## D5 — Weighted-average cost method
Selling doesn't change per-unit avg cost, so avg cost of remaining units =
(total buy cost) / (total buy qty). The `holdings` view computes this; app code
must not recompute it. Chosen because it handles DCA (many buys) cleanly.

## D6 — Existing DCA history = one opening-balance row
Prior DCA is entered as a single `buy` (total units + avg cost from the fund
app), not every past installment. Trade-off: loses per-installment dates, so
XIRR is slightly approximate until full history is imported. Cost basis and
P&L stay exact.

## D7 — Database: Supabase (free tier)
Bundles Postgres + auth + auto REST API + pgvector (useful for the future LLM
phase); free tier fits a solo project. Alternative kept in reserve: Neon (pure
Postgres, scale-to-zero).

## D8 — Frontend: Next.js + Vercel (for now)
Popular, well-supported, free deploy on Vercel, future-proof for server-side
price fetching and LLM features. Vercel needs no Docker.

## D9 — Build in phases; rebalancing is Phase 2
Phase 1 (portfolios, prices, holdings, P&L) ships first. Rebalancing (original
requirement #3) is deliberately deferred to Phase 2 — not dropped. Prevents a
bloated, hard-to-debug first build.

## D10 — New Supabase key format
Use publishable/secret keys (new projects don't get legacy anon/service_role).
Publishable = client, secret = server-only.

## D11 — Schema changes as ordered migration files
Not ad-hoc dashboard SQL. Needed to keep future dev/prod in sync.

## D12 — Deployment-agnostic app; future k3s on VPS
All config via env vars, no host-specific assumptions, so moving from Vercel to
Docker + k3s later needs no rewrite.

## D13 — Money math in decimal, never float
Avoids currency rounding errors.

## D14 — Targets are asset-level only, no group level in Phase 2
Simplest for Phase 2. If group-level targets are needed later, add a separate
`target_groups` table without touching this schema.

## D15 — Rebalancing computed client-side, not a SQL view
Just combines data from the `holdings` view + `targets` table for display —
not complex enough yet to justify a separate view. Revisit once the logic
gets more complex.

## D16 — Targets can only be set for assets already held (enforced in UI, not a DB constraint)
Avoids the edge case of setting a target on an asset with no price/never held.
If a fund with a target is later sold off entirely, the rebalancing page shows
it as "holding 0%, should be X%", using name/last price from the join with
`assets`.
