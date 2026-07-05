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

## D17 — Dividends reuse existing `transactions` columns, no schema change
`quantity = 1`, `price` = gross dividend amount, `tax` = withholding tax,
`fee = 0`. `type = 'dividend'` was already provisioned since Phase 1, so no
table changes were needed.

## D18 — New `holdings_with_returns` view instead of editing `holdings`
Built via a join on top of the existing view rather than modifying it, so
Targets/Rebalancing (which depend on `holdings`/`targets` directly) are
completely unaffected.

## D19 — Duplicate dividends are guarded by a UI confirm dialog, not a DB constraint
Only warns, doesn't block — supplementary dividend payments on the same date
are a real, valid case, and a uniqueness constraint would block them.

## D20 — CoinGecko with no API key, symbol→id mapping hardcoded in code
Simplest option since only BTC is held right now. A crypto asset with no
mapping shows up as "skipped" with a clear reason instead of being silently
ignored.

## D21 — Manual refresh only, no cron/background job, no caching
Matches what was asked for this round: the user triggers refresh explicitly,
no added infrastructure until it's actually needed.

## D22 — Both the CoinGecko fetch and the `prices` insert happen server-side (API route)
Calling CoinGecko directly from the browser would risk CORS/rate limits tied
to the user's IP. Keeping both steps in one place also makes it easy to add
caching or an API key later.

## D23 — Plain `setInterval`, no tab-visibility guard
Only one CoinGecko call every 60s from a single tab, nowhere near the
free-tier rate limit. Adding logic to pause when the tab isn't active would
be unnecessary complexity for now.

## D24 — Interval resets on every portfolio switch (keyed on `selectedId`)
Avoids a stale-closure bug where the interval would keep referencing an old
portfolio id.

## D25 — Removed the manual "Refresh crypto prices" button, kept only auto-refresh
Auto-refresh (immediately on mount + every 60s after) already covers normal
usage, so the button was redundant. Firing immediately on mount means an F5
still gets a live price right away.

## D26 — Symbol matching is case-insensitive and works for any asset, including crypto
Simplest option — no special-casing to exclude crypto, since there's no clear
benefit to blocking it.

## D27 — Delimiter auto-detected once per paste (tab if present, else comma), not per line
Matches actual behavior (copying from a spreadsheet = tabs, typing CSV by
hand = commas) without needing a settings toggle.

## D28 — Symbol lookup doesn't disambiguate by market
All symbols in the current data are already unique. If a symbol collision
across markets ever comes up, it'll be fixed then — not worth solving now.

## D29 — Hard delete for dividends, no soft-delete flag
Deletes the `transactions` row directly, rather than flagging it inactive.
Simplest option, and matches how `/prices` already treats history
(append-only, no edit trail). For a single-user app, recreating a deleted
entry is trivial — the date/amount are already shown in the confirm dialog
before deletion — so a soft-delete column that every query touching
`transactions` would need to filter isn't worth it.

## D30 — Delete icon's red is a destructive-action convention, not a P&L color
Widely understood convention that never sits next to or represents a P&L
number, so it doesn't conflict with DESIGN.md's green/red-is-P&L-only rule.

## D31 — Portfolio picker (native `<select>`) has no lift/press animation
Just `cursor-pointer` — the dropdown popup itself is rendered by the
browser, so adding a lift effect would look inconsistent with native OS
select behavior.
