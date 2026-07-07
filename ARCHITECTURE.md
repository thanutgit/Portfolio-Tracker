# Architecture

## Overview
A Next.js web app over a Supabase Postgres database. Users track multiple
investment portfolios; the app shows current holdings and P&L computed from a
transaction ledger.

## Tech stack
- Next.js (App Router) + TypeScript
- Supabase (Postgres) — database + auth + auto-generated API
- Tailwind CSS
- `recharts` — the only charting library in the app, used for the
  Holdings trend chart (`TrendChart`). The sector/country allocation
  donuts are still hand-rolled SVG (`DonutChart`), not recharts — that
  choice predates this dependency and wasn't revisited. See DECISIONS.md.
- Deploy: Vercel now (no Docker needed). Future: Docker + k3s on a VPS with
  separate dev/prod. Keep the app deployment-agnostic — all config via env vars.

## Commands
- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run lint` — lint

_(Update after scaffolding if these differ.)_

## Data model
Core idea: `transactions` is the source of truth. Current holdings (quantity,
average cost, market value, P&L) are COMPUTED from it via a view — never stored
directly. Reasoning in DECISIONS.md (D1–D5).

Tables:
- `portfolios` — one user can have many.
- `assets` — shared master list (stock/etf/fund/bond/cash/crypto). Cash is an asset.
- `transactions` — source of truth. Types: buy/sell/dividend/fee/deposit/
  withdraw/split. `quantity` stored positive; direction comes from `type`.
- `prices` — latest price per asset (source: manual/csv/api).
- `targets` — desired allocation per asset (target_pct, drift_threshold),
  added in Phase 2. See ROADMAP.md and DECISIONS.md D14–D16.
- `portfolio_snapshots` — daily total-value history per portfolio,
  plotted by the Holdings page's trend chart (Phase 4). Columns: `id`,
  `portfolio_id`, `snapshot_date`, `total_value`,
  `total_cost`, `cash_value`, `created_at`. `unique (portfolio_id,
  snapshot_date)` — at most one row per portfolio per day; writes are
  always an upsert on that pair, never a plain insert (see GOTCHAS.md #1).
  `total_value` / `total_cost` are computed client-side by summing
  `holdings_with_returns.market_value` / `.cost_basis` for the *current*
  holdings at the moment the Holdings page loads (or the "Save today's
  value" button is clicked) — NOT reconstructed retroactively from
  historical `transactions` + `prices` for past dates. `cash_value` needs
  each holding's `asset_type`, which isn't in `holdings`/
  `holdings_with_returns`, so it's fetched via one small separate `assets`
  query at snapshot-time only, rather than extending either view. See
  migrations/0005_add_portfolio_snapshots.sql and DECISIONS.md D35–D37.

Views (computed, read-only):
- `latest_prices` — newest price per asset.
- `holdings` — per asset: quantity, avg_cost, last_price, cost_basis,
  market_value, unrealized_pnl, unrealized_pct. Weighted-average cost.
- `dividend_income` — net dividends received per asset (all-time), from
  `transactions` where `type = 'dividend'`. Convention: `quantity = 1`,
  `price` = gross dividend amount, `tax` = withholding tax. Added Phase 3.
- `holdings_with_returns` — `holdings` + `net_dividends` + `total_return`
  (= unrealized_pnl + net_dividends) + `total_return_pct`. Built on top of
  `holdings`, doesn't replace it. Added Phase 3, see DECISIONS.md.

Full SQL: see `migrations/` (all files in order = current schema; start with
`migrations/README.md`). Real portfolio data already inserted is in
`seed_data.sql` (reference only — don't re-run blindly, no unique constraint
guards against duplicate inserts).

## Supabase & security
- Keys from the project's Connect dialog or Settings → API Keys. New projects
  use publishable (`sb_publishable_...`, client) + secret (`sb_secret_...`,
  server-only) keys.
- Client uses the PUBLISHABLE key via `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- SECRET key bypasses RLS — server-only, never in a client bundle, never in git.
- Secrets live in `.env.local` (gitignored). No key values in committed docs.
- RLS is OFF now (single-user dev). Enable it when auth is added:
  policy `auth.uid() = portfolios.user_id`.

## Database migrations
Every schema change = an ordered file under `migrations/` (`0001_init.sql`,
`0002_...`). Re-runnable; don't edit old ones. This keeps dev/prod in sync.

## Domain notes (Thai market)
- Default currency is THB.
- `tax_bucket`: `RMF` / `SSF` / `ThaiESG` (holding-period rules = later phase).
- Thai stock dividends carry 10% withholding tax → record in `transactions.tax`.

## Crypto price refresh
`POST /api/refresh-crypto-prices` (Next.js Route Handler, server-side) fetches
BTC/THB (and ETH/THB) from CoinGecko's free public API (no key) and inserts
into `prices` with `source = 'api'`. Manually triggered from the Holdings page
button — no background job/cron yet. Only assets whose symbol has a known
CoinGecko id are refreshed (see `COINGECKO_IDS` in the route); other
`asset_type = 'crypto'` assets are reported as skipped, not silently ignored.
Thai funds have no public price API and stay manual. See DECISIONS.md.

## Portfolio trend chart
`TrendChart` (`src/components/TrendChart.tsx`) plots `portfolio_snapshots`
for the currently-selected portfolio only (`.eq("portfolio_id", ...)`),
refetched whenever the Holdings page's `selectedId` changes (same effect
that reloads holdings) and again right after any write to
`portfolio_snapshots` (auto-snapshot or the "Save today's value" button),
so the chart never needs a manual page refresh to catch up.

Renders nothing chart-like with fewer than 2 snapshot rows — shows a
plain message instead ("not enough data yet"). A single point (or zero)
has no trend to show, and forcing a flat/one-dot line would misleadingly
suggest a real (flat) history rather than "we just started measuring."
No interpolation or synthetic backfill is done to work around sparse
early data — the chart only ever plots real recorded rows, gaps between
unevenly-spaced snapshot dates included.

Colors are hardcoded hex values (not Tailwind `dark:` classes) for the
line, axis ticks, and grid, since `recharts` renders its own SVG
internals that don't reliably inherit a `currentColor` set via a
wrapping element's class — see the component for the exact values, chosen
to match the app's actual (currently dark-only, see Dark mode below)
rendering rather than both themes. The line gets the same soft blue glow
as the "Tracker" wordmark, via a CSS rule in `globals.css` targeting
recharts' own stable `.recharts-line-curve` class name, rather than an
SVG filter — DESIGN.md's Depth & elevation explicitly allows a permanent
glow on "the accent trend-line chart."

## XIRR (money-weighted annualized return)
`xirr()` (`src/lib/xirr.ts`) is a pure, dependency-free function: given a
list of `{ date, amount }` cash flows (negative = money out, positive =
money in), it solves for the constant annual rate that makes their net
present value zero, via damped Newton-Raphson (plain Newton-Raphson can
overshoot past the `rate > -1` domain boundary on a steep NPV curve —
e.g. near a large loss — so a step gets halved up to 50 times rather than
immediately failing; see the file for the exact known-answer cases this
was validated against). Returns `null` — never `NaN`/`Infinity` — when no
meaningful rate exists, including when the whole cash-flow history spans
fewer than `minSpanDays` (default 30) — see DECISIONS.md for why.

The Holdings page (`loadXirr()`) builds the cash-flow list per portfolio
from `transactions`: `buy` → `-(quantity*price + fee)`, `sell` →
`+(quantity*price - fee)`, `dividend` → `+(quantity*price - tax - fee)`,
each dated by `trade_date`, plus one final flow dated today for the
portfolio's current total market value (as if fully liquidated today).
Only `buy`/`sell`/`dividend` transaction types feed into it — `fee`
(standalone)/`deposit`/`withdraw`/`split` rows, if any exist, currently
do not. Recomputed on the same non-silent-load schedule as auto-snapshot
and asset-info (portfolio switch / page load; not on every 60s silent
crypto-price refresh).

## Transaction edit/delete safety check
`wouldCauseNegativeHolding()` (`src/lib/transactions.ts`) is a pure function
called from `HistoryModal` before an edit or delete of a buy/sell
transaction is confirmed. It replays that asset's **entire** buy/sell
history in chronological order (buys add, sells subtract), with the one
transaction being edited swapped in with its new values, or removed
entirely for a delete, and reports whether the running quantity would dip
below zero at any point in that replayed timeline — not just at the
edited/deleted row itself, since a later sell may depend on an earlier buy
being large enough.

Always fetched fresh in full at the moment of the edit/delete, never taken
from whatever page the Transactions tab currently has loaded — the tab is
paginated (see the Holdings page / GOTCHAS.md-adjacent history UI), so
relying on the on-screen rows could miss an earlier transaction sitting on
a page that hasn't been loaded, and silently fail to catch a real
negative-holding risk. The check is deliberately a **warning, not a
block**: same philosophy as the buy/sell form's oversell warning — the
on-file ledger can legitimately be edited in an order that's momentarily
inconsistent (e.g. fixing an old entry before its dependents), and the
user should decide, not be locked out. See DECISIONS.md D55–D56 and
GOTCHAS.md #1 for the incident this guards against.

## Conventions
- Money math in decimal/`numeric`, never floating point.
- Keep data fetching and secrets server-side where sensible.
- Ask before adding a dependency; don't reorganize structure without asking.

## Dark mode
Class-based, not OS-preference-based: `globals.css` defines
`@custom-variant dark (&:where(.dark, .dark *))`, and `<html>` in
`layout.tsx` hardcodes the `dark` class, so every `dark:` Tailwind utility
across the app applies unconditionally — dark is the default regardless of
the visitor's OS `prefers-color-scheme`. There is currently no UI control
that removes the class, so light mode (the `dark:`-unprefixed classes,
still present throughout every component) isn't reachable by users yet — a
future toggle would just add/remove `dark` on `<html>` (e.g. persisted to
`localStorage`); no component classNames need to change for that. See
DECISIONS.md.