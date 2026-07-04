# Changelog

## 2026-07-03 — Project scaffold + holdings view (Phase 1)
- Scaffolded Next.js (App Router) + TypeScript + Tailwind CSS.
- Added Supabase client (`src/lib/supabase.ts`) reading
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from env.
- Home page (`/`): portfolio picker, holdings table (symbol, name, quantity,
  avg cost, last price, market value, unrealized P&L/%), portfolio totals,
  empty states. Reads only from the `holdings` view — no client-side
  recomputation of cost basis.
- No add/edit forms yet (deliberately out of scope this round).

## 2026-07-03 — Targets + rebalancing (Phase 2)
- `migrations/0002_add_targets.sql`: new `targets` table (portfolio_id,
  asset_id, target_pct, drift_threshold — default 5%). Not yet applied to
  Supabase; see instructions below.
- New pages:
  - `/targets` — form to set target % (and per-row drift threshold) for each
    asset currently held in the selected portfolio. Warns if targets don't
    sum to 100%. Upserts to `targets` on save.
  - `/rebalancing` — current allocation % (from `holdings`) vs. target %,
    per-asset drift, and suggested buy/sell amount in currency + units
    (using `holdings.last_price`). Rows exceeding their `drift_threshold`
    are highlighted; others show "within threshold".
- Extracted shared `usePortfolios` hook and `PortfolioPicker` /
  `EmptyState` / `SummaryCard` components (now used by 3 pages) out of the
  home page.
- Added a small top nav (Holdings / Targets / Rebalancing).
- Still no forms to add new transactions/assets — those stay in the SQL
  Editor until a later round.

## 2026-07-04 — Add crypto support (Bitcoin)
- `migrations/0003_add_crypto_asset_type.sql`: widens the `assets.asset_type`
  check constraint to allow `'crypto'` (previously stock/etf/fund/bond/cash
  only). No other schema change.
- Added Bitcoin as a real holding in the Retirement portfolio (asset, opening
  balance transaction, latest price) — reflected in `seed_data.sql`.
- First real incident hit during this: a multi-statement SQL batch partially
  succeeded before erroring, then a retry with quantity/price swapped in the
  `values (...)` list left 3 rows in `transactions` for BTC (one correct, one
  with quantity/price swapped, one duplicate) — showed up as an absurd BTC
  market value in the UI. Diagnosed and fixed by hand in the SQL Editor.
  Documented in the new `GOTCHAS.md` (#1) so the same mistake isn't repeated,
  along with a prevention checklist (query for duplicates before re-running a
  failed batch; double-check `values` column order matches the target list).

## 2026-07-04 — Dividends + total return (Phase 3 slice)
- `migrations/0004_add_dividend_returns.sql`: no schema changes — adds
  `dividend_income` and `holdings_with_returns` views on top of the existing
  `holdings` view (not modified). Not yet applied to Supabase; see
  instructions below.
- Home page (`/`):
  - New "+ Dividend" button per holding opens a modal to record a dividend
    (date, gross amount, withholding tax) as a `transactions` row with
    `type = 'dividend'`. Shows that asset's prior dividend history in the
    same modal, and warns (soft confirm, doesn't block) if a dividend already
    exists for the same asset + date.
  - New "Total Return" column next to "Unrealized P&L": total_return =
    unrealized_pnl + net dividends received (after withholding tax).
    unrealized_pnl itself is untouched — still price-only.
  - New portfolio-level "Total return (incl. dividends)" summary card,
    alongside the existing market value / unrealized P&L cards.
  - Now reads from `holdings_with_returns` instead of `holdings` (Targets and
    Rebalancing pages are unaffected, still read `holdings`/`targets`
    directly).
- Design decisions logged in DECISIONS.md (D17–D19).
- Migration applied and verified against real data (Retirement portfolio):
  total_return numbers confirmed to equal unrealized_pnl + net_dividends.

## 2026-07-04 — Clearer holdings table columns
- Added a dedicated "Dividends" column (net_dividends from
  `holdings_with_returns`, shown as-is — no extra computation) between
  Unrealized P&L and Total Return, so dividend contribution is visible on
  its own instead of only folded into Total Return.
- Column order: Market Value → Unrealized P&L → Dividends → Total Return.
- Added small captions under each of those three headers ("price only" /
  "net of tax" / "P&L + dividends") so the three money columns aren't
  mistaken for repeats of each other. Dividends is shown in plain text
  (not green/red) since it isn't a gain/loss comparison, just a received
  amount — keeps green/red reserved for actual P&L per DESIGN.md.

## 2026-07-04 — Auto-refresh crypto prices (CoinGecko)
- No schema change — `prices.source = 'api'` was already supported.
- New `POST /api/refresh-crypto-prices` Route Handler (server-side): fetches
  BTC/THB (and ETH/THB) from CoinGecko's free public API and inserts into
  `prices` with `source = 'api'`. Uses the existing publishable-key Supabase
  client — no secret key involved. Assets with no known CoinGecko mapping are
  reported back as "skipped", not silently dropped.
- Holdings page: new "Refresh crypto prices" button, a "Last updated: …"
  timestamp (from `prices.as_of`), and a status banner (green on success,
  amber for partial/skipped, red on failure — e.g. CoinGecko down, rate
  limited, or network error). Holdings reload automatically after a
  successful refresh.
- Thai funds are unaffected — still manual, no public price API for them.
- Verified live: hit the endpoint directly (got back BTC's real THB price)
  and via the UI button (Last Price / Market Value / P&L updated for BTC,
  no console errors).
- Design decisions logged in DECISIONS.md (D20–D22).

## 2026-07-04 — Client-side auto-refresh for crypto prices
- Holdings page now polls `POST /api/refresh-crypto-prices` (the same route
  from the manual button, unchanged) every 60s via `setInterval` inside a
  `useEffect`, cleaned up on unmount — no server cron/background job (Vercel
  free tier's cron is once/day, not enough for this).
- Auto-refresh is silent: no "Refreshing…" button state, no loading
  placeholder over the table, no success/warning/error banner — holdings
  numbers just update quietly on success, and a failed poll is dropped
  silently (next 60s tick tries again). The manual button is unchanged: still
  shows its loading state and banner as before.
- Polling stops automatically when navigating to `/targets` or `/rebalancing`
  (component unmounts, effect cleanup clears the interval) and restarts if
  the user switches portfolios while on the Holdings page.
- Verified live with a real browser session: the auto POST fired once at
  ~60s with no loading-state text visible at any point and no console
  errors; after navigating to `/targets`, zero further calls in the next 30s.
- Design decisions logged in DECISIONS.md (D23–D24).

## 2026-07-05 — Remove manual crypto refresh button, fire auto-refresh on mount
- The manual "Refresh crypto prices" button, its `refreshingCrypto` loading
  state, and its `cryptoNotice` success/warning/error banner are all removed
  — no longer needed now that auto-refresh runs on its own. `RefreshCryptoResponse`
  trimmed to only the `updated` field, which is all that's still read.
- Auto-refresh now fires once immediately on mount, then every 60s as before
  — so an F5/page load gets a live crypto price right away instead of
  waiting up to 60s for the first tick. Still silent (no loading state, no
  banner) and still stops automatically when navigating away.
- The "Crypto prices last updated: …" timestamp is kept (it's independent
  status info, not tied to the removed button) and now sits on its own line
  under the portfolio picker.
- `/api/refresh-crypto-prices` endpoint itself is untouched.
- Verified live: button confirmed gone from the DOM; on page load the
  refresh endpoint is hit immediately (no 60s wait) and BTC's price is
  already fresh in the first render after load; no console errors.
  (Note: in `next dev`, React Strict Mode double-invokes the mount effect,
  so you'll see two fetches back-to-back in dev only — this doesn't happen
  in production builds and the interval cleanup prevents any leak either way.)