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
- `user_settings` — single row (app still reads/writes it that way; see
  below). Columns: `id`, `birth_date` (nullable), `created_at`, and now
  `user_id` (nullable uuid, unique, references `auth.users` — added by
  `migrations/0007_add_auth_user_id.sql`, prepared but not yet applied
  or used by the app; see ARCHITECTURE.md's Auth section and
  ROADMAP.md Phase 7). Only used to check RMF's age-55 holding-period
  condition (Phase 5). App reads it as `select ... limit 1
  maybeSingle()`; on save, updates that row by `id` if one exists, else
  inserts the first one — no DB-level uniqueness constraint enforcing
  "only one row" yet at the app-query level (the new `user_id` unique
  constraint only takes effect once the app actually starts writing a
  real `user_id`, which it doesn't yet). See
  migrations/0006_add_user_settings.sql.

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
- RLS is still OFF (Phase 7 step 1 only added login/signup — see below and
  ROADMAP.md). Enable it once existing data has real owners: policy
  `auth.uid() = portfolios.user_id`.

## Auth (Phase 7, step 1 — login/signup only, not enforced yet)
Supabase Auth built-in, email/password only (no OAuth yet). Client-side only
via the existing publishable-key `supabase` client (`src/lib/supabase.ts`) —
no server middleware or route protection in this step.
- `/login` (`src/app/login/page.tsx`) — `supabase.auth.signInWithPassword()`.
- `/signup` (`src/app/signup/page.tsx`) — `supabase.auth.signUp()`. If the
  Supabase project requires email confirmation (this project does), `signUp()`
  returns a user but no session — the page shows a "check your email" message
  instead of redirecting, since there's no session to redirect with yet.
- Both pages share `AuthCard` (`src/components/AuthCard.tsx`) — same card
  chrome as the app's existing modals (`rounded-xl border shadow-lg`), not
  Supabase Auth UI's prebuilt component, so they match the rest of the app.
- `NavBar` tracks auth state via `supabase.auth.getSession()` +
  `onAuthStateChange()`, showing "Log out" (calls `signOut()`, redirects to
  `/`) when signed in or a "Log in" link when signed out. Portfolio tabs are
  hidden on `/login`/`/signup`, same reasoning as Overview (no
  portfolio/user context there yet).
- **No route protection or redirect yet** — every page still works fully
  logged-out, identical to before this change. That, plus enabling RLS and
  migrating existing data to real `user_id` owners, is deliberately deferred
  to a later, separate step (see ROADMAP.md Phase 7) since it's riskier and
  shouldn't ship in the same round as the login UI itself.
- Schema prep for this step lives in `migrations/0007_add_auth_user_id.sql`
  (not yet applied — see the file and DECISIONS.md): adds the
  `portfolios.user_id → auth.users` foreign key (the column itself already
  existed, unreferenced, since `0001_init.sql`), and adds a nullable, unique
  `user_settings.user_id` so settings can eventually move off its current
  single-row convention. Both stay nullable until the data-migration step.

## Database migrations
Every schema change = an ordered file under `migrations/` (`0001_init.sql`,
`0002_...`). Re-runnable; don't edit old ones. This keeps dev/prod in sync.

## Domain notes (Thai market)
- Default currency is THB.
- `tax_bucket`: `RMF` / `SSF` / `ThaiESG` (holding-period rules — see
  "RMF/SSF/ThaiESG holding-period tracking" below).
- Thai stock dividends carry 10% withholding tax → record in `transactions.tax`.

## RMF/SSF/ThaiESG holding-period tracking
`computeTaxHoldingStatus()` (`src/lib/taxHolding.ts`) is a pure function
checking Thai tax-advantaged fund rules **per buy lot, not per asset** —
each buy transaction has its own holding-period clock, so a single asset
can have some lots already eligible and others still waiting. Rules
implemented (checked against published guidance as of July 2026 — these
can change; the file itself carries this same caveat as a comment so it
surfaces to whoever edits it next):
- **RMF**: 5 years from each buy's `trade_date`, **and** the holder must
  be 55+ (checked against `user_settings.birth_date`).
- **SSF**: 10 years from each buy's `trade_date`. No age condition.
- **ThaiESG**: 5 years from each buy's `trade_date`. No age condition.
- **normal**: no condition at all — the function returns immediately with
  `status: "no_condition"` and the UI shows nothing.

The function returns `null`/"unknown" fields rather than guessing when
`birth_date` isn't on file (RMF only) — `ageConditionMet: null` — and the
UI (`TaxHoldingBadge`) detects that case specifically to show just the
holding-period side plus a link to `/settings`, rather than a misleading
met/not-met badge for a condition that can't actually be evaluated yet.

Displayed in `HistoryModal`'s Transactions tab as a small icon (not a
full-width pill) next to the edit/delete icons on each `buy` row, only
when the asset's `tax_bucket` isn't `normal` — hover for a tooltip with
the eligible date, time remaining, and status. Colors are deliberately
not green/red (DESIGN.md reserves that pair for P&L) — blue for "met,"
amber for "not yet" (same family as the drift-threshold badge), gray for
"can't tell yet." See DECISIONS.md for the exact resolution of that color
choice.

**Sell-time warning**: `TransactionModal` also calls
`computeTaxHoldingStatus()` when selling a non-`normal`-bucket asset —
for every buy lot of that asset, not just one. This app doesn't track
which specific lot a sale draws from (no per-lot FIFO allocation exists
anywhere in the codebase), so rather than building that out, the check is
conservative: if *any* lot isn't fully eligible yet, the preview dialog
(same one that already shows the oversell warning) gets an appended
warning naming the most restrictive ("latest") not-yet-eligible date
across all flagged lots. Warns, doesn't block — same philosophy as the
oversell check (D44): selling is still legitimately possible in real
life, just potentially at the cost of a claimed tax benefit.

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

## Drift-threshold alerts
`src/lib/drift.ts` extracts the drift formula the Rebalancing page has
always used (`computeDrift()`: current % vs. target %, out-of-threshold
when `|drift| > drift_threshold`, defaulting to 5% for a held asset with
no target row at all) into a shared pure function, so Overview, Holdings,
and Rebalancing all agree by construction rather than by convention.
`countDriftedAssets()` wraps it for the alert UI: returns `null` when a
portfolio has zero `targets` rows (nothing configured — not shown as an
error or a false "all good"), otherwise the count of assets currently
outside threshold (0 included).

Both the Overview page's per-portfolio badge and the Holdings page's
banner render nothing when the count is `0` or `null` — this is
deliberately a quiet, always-visible-when-relevant indicator (no dismiss
action, no toast that disappears on its own), per the explicit ask: never
show a green/neutral "all within threshold" state by default, only speak
up when something actually needs attention. Uses the amber/orange warning
palette, never red — red is reserved for P&L losses (DESIGN.md).

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