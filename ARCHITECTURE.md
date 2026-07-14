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
  market_value, unrealized_pnl, unrealized_pct. **Proper running
  weighted-average cost** (migration `0012_fix_holdings_avg_cost_running_
  total.sql` — NOT yet applied, see DECISIONS.md and GOTCHAS.md): replays
  every buy/sell in chronological order via a `WITH RECURSIVE` CTE,
  keeping a running `(quantity, total_cost)` state — a buy adds
  quantity+cost, a sell removes quantity *and* removes cost proportionally
  at the running average cost *at that point in time* (never the sale
  price). This is NOT expressible as a plain aggregate `SUM()`, since a
  sell's cost removal depends on the running average computed from every
  prior row for that asset — the original `0001_init.sql` formula
  (`SUM(buy qty×price+fee)/SUM(buy qty)`, ignoring sells) only happens to
  match this whenever every sell comes after every buy; it silently
  diverges the moment a buy occurs after a prior sell (confirmed against
  real data — see GOTCHAS.md). `quantity`/`market_value` were never wrong
  (a simple net buy-minus-sell sum, order-independent) — only
  `avg_cost`/`cost_basis`/`unrealized_pnl`/`unrealized_pct` (and, via
  `holdings_with_returns`, `total_return`/`total_return_pct`) were
  affected. XIRR is unaffected — it builds cash flows straight from raw
  transaction prices, and its only `holdings`-derived input is
  `market_value`, which never depended on `avg_cost`.
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
- `FINNHUB_API_KEY` (plain env var, deliberately **not** `NEXT_PUBLIC_`) —
  used only inside the three server-side Finnhub routes (see "Foreign
  stock search + price refresh" below), never read client-side. Must be
  set in `.env.local` for local dev and in Vercel's project settings
  (Settings → Environment Variables) for production — these are two
  separate places, both need it.
- **Supabase Auth (email/password) is live** — every page except
  `/login`/`/signup` is protected by the `<RequireAuth>` component (see
  "Route protection" below); logged-out visitors are redirected to
  `/login`.
- **RLS is ON** (Phase 7 step 2, applied): `portfolios` and
  `user_settings` check `auth.uid() = user_id` directly;
  `transactions`, `targets`, and `portfolio_snapshots` check indirectly
  via a subquery to `portfolios.user_id` (none of the three has its own
  `user_id` column). `assets` and `prices` intentionally have RLS OFF —
  shared across all users. Full policy SQL: `migrations/0007`–`0010`.

## Auth (Phase 7)
Supabase Auth built-in, email/password only (no OAuth yet). Client-side only
via the existing publishable-key `supabase` client (`src/lib/supabase.ts`) —
no server middleware; see "Route protection" below for why.
- `/login` (`src/app/login/page.tsx`) — `supabase.auth.signInWithPassword()`.
- `/signup` (`src/app/signup/page.tsx`) — `supabase.auth.signUp()`. If the
  Supabase project requires email confirmation (this project does), `signUp()`
  returns a user but no session — the page shows a "check your email" message
  instead of redirecting, since there's no session to redirect with yet.
  Has a "Confirm password" field plus a live checklist (`src/lib/
  passwordRules.ts`) checked on every keystroke — 12+ characters, one
  uppercase, one number, one special character (any non-alphanumeric, not a
  fixed allowlist), and matching confirm-password. Each rule renders as its
  own line (checkmark = met, dot = not yet), same blue-for-met/gray-for-not-
  yet treatment as `TaxHoldingBadge` (D62) — not green/red. "Sign up" stays
  disabled until every rule passes; this is separate from, and doesn't
  suppress, the `error` state that shows Supabase's own signup errors (e.g.
  duplicate email, rate limit) — the two coexist in the same card.
- **Forgot/reset password** — Supabase Auth built-in, no custom email
  sending:
  - `/forgot-password` (`src/app/forgot-password/page.tsx`) — a single
    email field, calls `supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password` })`.
    `window.location.origin` is read at request time in the browser, so
    this resolves correctly wherever the app is actually running
    (`http://localhost:3000` in dev, the real Vercel domain in
    production) with no hardcoded host and no per-environment code
    change needed. Always shows the same "If an account exists for this
    email, a reset link has been sent." message on success, regardless
    of whether the email actually has an account — this holds
    automatically, since Supabase's own API already doesn't distinguish
    the two cases on success; the app only shows a different (real
    error) message when Supabase itself returns an error (e.g. rate
    limit), which applies independent of which email was submitted and
    so leaks nothing about a specific account.
  - **Supabase Dashboard requirement, separate from the code above**:
    Supabase Auth only honors a `redirectTo` value that matches an entry
    in **Authentication → URL Configuration → Redirect URLs** — an
    unlisted URL is rejected/ignored server-side no matter how correct
    the app's own code is. Both of the following must be added there by
    hand (this is dashboard configuration, not something committed to
    this repo or checkable from the code):
    `http://localhost:3000/reset-password` (dev) and the production
    equivalent (e.g. `https://<your-vercel-domain>/reset-password`).
  - `/reset-password` (`src/app/reset-password/page.tsx`) — reached only
    via the emailed link, which Supabase's client auto-detects on load
    (`detectSessionInUrl`, default on) and turns into a short-lived
    "recovery" session. The page checks `getSession()` (plus an
    `onAuthStateChange` listener for the `PASSWORD_RECOVERY` event) to
    tell a real reset link apart from someone just navigating to the URL
    directly — the latter shows a plain "This password reset link is
    invalid or has expired" message with a link back to
    `/forgot-password`, never a raw Supabase error. On submit, calls
    `supabase.auth.updateUser({ password })`, then deliberately
    `signOut()`s before redirecting to `/login?reset=success` — without
    that sign-out, `/login`'s own `useRedirectIfAuthed()` would
    immediately bounce the still-logged-in-from-recovery user away to
    `/` before they ever saw the success message. `/login` reads that
    `?reset=success` param once via `window.location.search` inside a
    plain `useEffect` (not `useSearchParams()`, which would need a
    `<Suspense>` boundary for what's only ever a one-time read right
    after a fresh navigation, not reactive in-page query tracking),
    shows it via the existing `Toast` component, then
    `router.replace("/login")` to strip the param from the URL.
  - Reuses the same password rules and checklist UI as `/signup`: pure
    rules in `src/lib/passwordRules.ts`, and the checkmark/dot list
    itself extracted to `src/components/PasswordChecklist.tsx` (used by
    both pages — `/signup` was refactored to use it instead of its own
    inline copy).
  - Deliberately does **not** use `useRedirectIfAuthed()` — unlike every
    other auth page, arriving at `/reset-password` via a real link
    legitimately creates a session, so that hook would break the page.
- All four auth pages share `AuthCard` (`src/components/AuthCard.tsx`) —
  same card chrome as the app's existing modals (`rounded-xl border
  shadow-lg`), not Supabase Auth UI's prebuilt component, so they match
  the rest of the app.
- `NavBar` tracks auth state via `supabase.auth.getSession()` +
  `onAuthStateChange()`, showing "Log out" (calls `signOut()`, redirects to
  `/`) when signed in or a "Log in" link when signed out. Portfolio tabs are
  hidden on `/login`/`/signup`/`/forgot-password`/`/reset-password`, same
  reasoning as Overview (no portfolio/user context there yet).
- Schema prep from step 1 lives in `migrations/0007_add_auth_user_id.sql`:
  adds the `portfolios.user_id → auth.users` foreign key (the column itself
  already existed, unreferenced, since `0001_init.sql`), and a nullable,
  unique `user_settings.user_id`.

## Route protection (Phase 7 step 2)
Client-side only, via a shared `<RequireAuth>` wrapper
(`src/components/RequireAuth.tsx`) — no Next.js middleware, which would need
a cookie-based session (`@supabase/ssr`) instead of this app's existing
localStorage-based client session, a bigger architecture change than asked
for here (see DECISIONS.md). Every page except `/login`/`/signup` wraps its
return value in `<RequireAuth>` (Overview, Holdings, Targets, Rebalancing,
Prices, Assets, Settings) — it tracks the session the same way `NavBar`
already does (`getSession()` + `onAuthStateChange()`), renders nothing while
checking or once a logged-out visitor has been bounced, and `router.replace()`s
to `/login` if there's no session. The inverse — `useRedirectIfAuthed()`
(`src/lib/hooks/useRedirectIfAuthed.ts`) — sends an already-logged-in visitor
away from `/login`/`/signup` to `/`.

Because this is client-side, there's a brief blank render before the redirect
fires — acceptable since RLS (below) blocks the underlying data at the same
time regardless, so nothing real is ever exposed during that gap; the guard
is just about not showing a broken/empty-looking page instead of bouncing.

Log in via `/login` with a real account to use the app at all — every page
now requires a session.

## Backfilling existing data to a real owner + enabling RLS (Phase 7 step 2, applied)
Three migrations, deliberately kept separate (see each file and
DECISIONS.md), all now applied against the live database and confirmed
(logging in with the real account showed every portfolio's full data intact
— holdings, transactions, targets, snapshots — nothing missing):
- `migrations/0008_backfill_owner_user_id.sql` — data-only: assigned every
  existing `portfolios`/`user_settings` row (previously `user_id is null`)
  to the one real `auth.users` account. Included a safety check that would
  have failed loudly if `auth.users` didn't have exactly one row, rather
  than silently mis-assigning data to the wrong owner, plus a commented-out
  manual alternative (hardcode the UUID from Supabase Dashboard →
  Authentication → Users) for when that assumption doesn't hold.
- `migrations/0009_portfolios_user_id_not_null.sql` — made
  `portfolios.user_id not null`. Kept in its own file (not combined with
  0008) so a failed/incomplete backfill would have failed loudly here
  instead of compounding with the data migration. `user_settings.user_id`
  deliberately stays nullable — only `portfolios.user_id` was asked to
  become `not null` this round.
- `migrations/0010_enable_rls.sql` — enables RLS on
  `portfolios`/`user_settings` (direct `auth.uid() = user_id` check) and
  `transactions`/`targets`/`portfolio_snapshots` (indirect check via a
  scalar subquery to `portfolios.user_id`, since none of those three tables
  has its own `user_id` column). `assets`/`prices` intentionally excluded —
  shared across all users, unchanged from the Phase 7 step 1 plan.
- Two existing insert call sites needed a matching code fix so they keep
  working once `portfolios.user_id` is `not null` and RLS is on — otherwise
  either would either violate the not-null constraint or insert an
  invisible-under-RLS row: `NewPortfolioModal` now sets `user_id` from the
  current session on insert, and the Settings page's insert-a-fresh-row
  fallback (the "no existing `user_settings` row yet" case) does the same.
  Existing `select`/`update` calls needed no changes — RLS filters
  transparently at the database layer; the app never needed to add its own
  `.eq("user_id", ...)` filters.
- **0008/0009/0010 have all been applied to the live database and
  verified** — logging in with the real account confirmed every
  portfolio's full data is still visible after RLS.

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

## Multi-row transaction entry
`TransactionModal` ("+ Add transaction") holds an array of independent
rows (`TxnRow[]`, each with its own type/asset/date/quantity/price/fee),
not a single set of fields — "+ Add another row" appends a blank one;
"+ Add new asset" is a single shared sub-form (not duplicated per row),
targeted at whichever row triggered it via `newAssetForRowId`, so N rows
don't each show their own copy of the full Finnhub search flow.

**Per-row validation, on Save**: a row left completely blank (no asset,
no quantity, no price) is silently skipped, not an error — it's just an
unused spare row. A partially-filled row is a validation error shown
under that specific row and blocks Save; already-correct rows are never
blocked by another row's error.

**Running-total oversell + tax-holding checks**: the same warnings that
existed for a single transaction (oversell, RMF/SSF/ThaiESG holding-period
— both described above) now need to account for earlier rows in the same
batch, not just the database's current state — e.g. buying an asset in
row 1 and selling some of it in row 2 must check row 2 against row 1's
effect. Implemented by replaying valid rows in order, starting from a
batch-fetched `holdings`/buy-lot snapshot (one query each, not one per
row) and mutating an in-memory running-quantity map and a
same-batch-buy-lots map as each row is processed — a sell row's tax check
looks at both the real DB-fetched lots *and* any buy lots earlier in this
same batch. All warnings across all rows are collected into one combined
preview/confirm message (numbered per row), not N separate dialogs.

**Atomicity**: all valid rows are inserted in a single
`.insert([...])` call with an array — PostgREST translates this into one
multi-row `INSERT` statement, which Postgres commits or rejects as a
whole. This directly satisfies "don't partially commit if one row fails"
without needing an explicit transaction wrapper or RPC — see GOTCHAS.md
#1 for the incident this guards against.

On success: resets to a single blank row and reports the saved count to
the caller (`onSaved(count)`) — Holdings' toast reads "1 transaction
saved."/"N transactions saved." accordingly.

## Crypto price refresh
`POST /api/refresh-crypto-prices` (Next.js Route Handler, server-side) fetches
BTC/THB (and ETH/THB) from CoinGecko's free public API (no key) and inserts
into `prices` with `source = 'api'`. Manually triggered from the Holdings page
button — no background job/cron yet. Only assets whose symbol has a known
CoinGecko id are refreshed (see `COINGECKO_IDS`, now shared from
`src/lib/coingecko.ts` rather than declared locally — also used by the Prices
page to exclude these assets from its manual-entry picker); other
`asset_type = 'crypto'` assets are reported as skipped, not silently ignored.
Thai funds have no public price API and stay manual. See DECISIONS.md.

## Foreign stock search + price refresh (Finnhub)
Server-side only — `FINNHUB_API_KEY` (plain env var, **not**
`NEXT_PUBLIC_`) never reaches the client. Three routes:
- `GET /api/finnhub-search?q=` — proxies Finnhub's `/search`, filtered to
  `type === "Common Stock"` (Finnhub's search also returns ETPs/mutual
  funds/etc., out of scope here) and capped to 10 results. Called from
  `TransactionModal`'s inline "+ Add new asset" form, in a new "Search
  stock (Finnhub)" mode alongside the original "Manual entry" mode
  (unchanged, still used for Thai funds) — debounced ~400ms after the user
  stops typing.
- `GET /api/finnhub-profile?symbol=` — proxies `/stock/profile2`, called
  once, right after a search result is picked (not per keystroke), to
  auto-fill sector (`finnhubIndustry`), country, currency, and market
  (`exchange`) in the new-asset form. Every auto-filled field stays a
  normal, editable input afterward. Finnhub returns `{}` (200 OK, not an
  error) for a symbol with no profile data — the form just leaves those
  fields blank for manual entry rather than erroring.
- `POST /api/refresh-stock-prices` — mirrors `/api/refresh-crypto-prices`'s
  shape, but fetches `/quote` (no batch endpoint, unlike CoinGecko) for
  every eligible held stock in parallel and inserts into `prices` with
  `source = 'finnhub'`. Called **once per Holdings page visit** (on mount
  and on portfolio switch), not on a repeating interval like crypto's 60s
  poll — Finnhub's free tier is 300 calls/day (vs. CoinGecko's much
  higher limit), and unlike crypto, stocks aren't traded 24/7, so a
  repeating poll would burn the daily quota for no benefit. Silent
  otherwise (no loading state, no banner), same as crypto.

**Which assets are eligible** (`isForeignStock()` in `src/lib/finnhub.ts`):
`asset_type === 'stock' && market` is truthy. This reuses the existing
`assets.market` column — present since `0001_init.sql` ("SET, mai, NYSE,
NASDAQ, null") but never actually populated by any form until this
feature — rather than adding a new column or a hardcoded symbol lookup
(crypto's approach, `COINGECKO_IDS`, which doesn't scale to the thousands
of possible stock tickers). Assets created via the old manual-entry path
(Thai funds, or a hand-typed foreign stock) leave `market` null and are
correctly excluded; only assets created via the Finnhub search flow (which
sets `market` from the profile's `exchange` field) become eligible. See
DECISIONS.md for why this was chosen over a new column.

`prices.source = 'finnhub'` is a new, distinct value from crypto's
`'api'` (migration `migrations/0011_add_finnhub_price_source.sql`, **not
yet applied** — see the file and DECISIONS.md) — kept separate so each
row's actual provider stays identifiable, rather than conflating two
unrelated external APIs under one generic label.

The Prices page's manual-entry picker excludes Finnhub-eligible assets
the same way it already excluded crypto (D79) — `selectableAssets` now
filters out both `hasAutoFetch()` (crypto) and `isForeignStock()`
(Finnhub) results, for the same reason: avoid a manual price and an
auto-fetched one conflicting over the same asset.

**Important caveat — multi-currency totals are not handled anywhere in
this app yet** (see ROADMAP.md Phase 3, DECISIONS.md): every portfolio
total (Overview's per-portfolio value, Holdings' "Total current value",
etc.) is a plain numeric sum of `market_value` across holdings, with no
FX conversion. Until now this was harmless because every real asset was
THB. Foreign stocks fetched via Finnhub are priced in their own currency
(commonly USD) — holding one alongside THB assets in the same portfolio
will make that portfolio's aggregate totals numerically wrong (adding
USD and THB figures as if they were the same unit), not just imprecise.
This isn't fixed as part of this feature (a real FX layer is a separate,
larger piece of work) — flagged here so it's not mistaken for a bug
report later.

## Manual price entry (Prices page)
`src/app/prices/page.tsx` has two entry modes, switched via a tab (no route
change — same page, local `mode` state):
- **Select from list** (default): one row per asset, each with the same
  search-then-pick combobox pattern as `TransactionModal`'s asset picker
  (minus "add new asset" — Prices only prices assets that already exist).
  The picker excludes any asset with `hasAutoFetch(symbol)` true (from
  `src/lib/coingecko.ts` — currently BTC/ETH), so there's no dropdown path to
  manually re-enter a price that auto-refresh already covers, and excludes
  whatever's already picked in another row of the same batch. "+ Add another
  asset" appends more rows for entering several prices in one batch.
- **Paste CSV**: unchanged from before — one `symbol,price` (or tab-
  separated) pair per line, matched by symbol text. Kept as a secondary tab
  for bulk entry from a prepared spreadsheet, rather than removed.
- Both modes feed the same `runPreview()` → preview table → confirm/save
  pipeline (old price → new price → % diff, warns above `DIFF_WARNING_PCT`)
  — only how the `{symbol, price}` entries get built differs. When an entry
  carries a known `assetId` (always true for "Select from list", picked
  directly from the dropdown), matching uses that id directly rather than a
  symbol-text lookup, so it can't accidentally match the wrong asset if two
  assets ever share a symbol on different markets — CSV-paste entries still
  match by symbol text only, since that mode never has an id to begin with.
  Saved rows are tagged `source: 'manual'` for the list-picker path (vs.
  `'csv'` for pasted rows), distinguishing the two in the `prices` table.
  Switching tabs clears any in-progress preview from the other mode.

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

## DatePicker (replaces every native `<input type="date">`)
`src/components/DatePicker.tsx` — hand-rolled, no date-picker library (see
DECISIONS.md; consistent with `DonutChart` predating this same
no-new-dependency approach). Motivation: the native date input formats and
parses per the browser's locale (often `MM/DD/YYYY`), and typing is rigid
per-segment — typing `29/04/2024` straight through fails because `29` gets
read as a month first. This component always types/displays `DD/MM/YYYY`
(the order used in Thailand) regardless of browser locale, auto-inserting
`/` as digits fill in (`29042024` → `29/04/2024` progressively, not typed
by the user).

**API is a drop-in swap, not a schema/backend change**: `value`/`onChange`
are still a plain ISO `"YYYY-MM-DD"` string, exactly what the native input
produced — every call site only changed how the input/output is wired
(`onChange={(v) => setX(v)}` instead of `onChange={(e) =>
setX(e.target.value)}`), never what's stored or sent to Supabase. Replaced
at all 4 existing date inputs: `TransactionModal` (per-row trade date),
`HistoryModal` (edit-transaction trade date, dividend date), and the
Settings page's birth date.

**Validation**: only a real calendar date is accepted (rejects e.g.
`32/13/2024`) — computed via `new Date(yyyy, mm, 0).getDate()` to get the
correct last-day-of-month including leap years, not a hardcoded
days-per-month table. An incomplete date (still being typed) shows no
error; a complete-but-invalid one does, and doesn't call `onChange` until
it resolves to a real date — the parent's stored value is simply
unchanged while typing is incomplete or invalid.

**Calendar dropdown**: click-to-navigate month `<select>` + a plain
number input for the year (rather than a single scrollable year
`<select>`, which would need 100+ options to usefully reach a birth
year decades back) plus prev/next month arrows. Positioned with
`position: fixed`, anchored to the input's own `getBoundingClientRect()`
at open time — the same fix already used for `TaxHoldingBadge`'s
tooltip, since `TransactionModal`/`HistoryModal` both scroll under
`overflow-y-auto`, which silently clips a `position: absolute` child
extending past it. Closes on an outside click, Escape, or window scroll
(no reposition-on-scroll — closing is a simpler, acceptable trade-off for
a short-lived popover). No arrow-key day-to-day navigation within the
grid — the text input is the fast keyboard-only path; the calendar itself
is mouse/touch-oriented.

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