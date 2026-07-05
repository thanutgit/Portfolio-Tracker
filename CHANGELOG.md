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

## 2026-07-05 — Comment-only touches to src/app/page.tsx
- Added a one-line comment above the `holdings_with_returns` query noting
  it's the `holdings` view + net_dividends/total_return (migrations/0004).
- Added a `// last touched 2026-07-05 for hook test` comment at the top of
  the file (requested to exercise the changelog-reminder hook). No logic
  changed in either edit.

## 2026-07-05 — Paste-to-import prices (Phase 3 slice)
- No schema change — `prices.source = 'csv'` was already an allowed value.
- New `/prices` page: paste comma- or tab-separated `symbol,price` lines
  (one per asset), click **Preview** to see old price / new price / % diff
  per row before anything is written — nothing is inserted until a separate
  **Confirm & save**. Auto-detects and strips a header row if pasted (e.g.
  `symbol,price`).
- Symbols with no matching asset are listed separately as "not found" (never
  silently inserted); unparseable prices are listed separately too. Only
  rows that matched a real asset and parsed to a valid number are eligible
  to save.
- Rows whose new price differs from the last known price by more than 30%
  are highlighted (⚠) in the preview, and — directly addressing GOTCHAS.md
  #1 (typo'd/swapped values during manual SQL price entry) — saving them
  requires an extra confirm dialog listing exactly which symbols look
  suspicious.
- Each save is an **insert**, never an update — consistent with `prices`
  being an append-only history table (`latest_prices` picks the newest row).
- Not scoped to crypto — BTC/ETH already auto-refresh separately, but if
  pasted here they'd still work like any other symbol (see decisions below).
- Added "Prices" to the top nav.
- Verified live end-to-end: previewed a mix of valid/not-found/invalid-price/
  suspicious rows (screenshot confirmed correct grouping and highlighting);
  confirmed a save that included a >30% jump, got the expected warning
  dialog text, accepted it, and confirmed both prices landed and now show
  correctly on the Holdings page. No console errors throughout.
- **Note:** that live test left two real rows in the `prices` table on your
  Retirement portfolio — SCBS&P500E ฿44.10 (realistic, safe to keep) and
  SCBGOLDE ฿55.00 (deliberately unrealistic, used only to trigger the
  warning dialog). SCBGOLDE's Holdings row will show an inflated gain until
  you paste in its real current price.
- Design decisions logged in DECISIONS.md (D26–D28).

## 2026-07-05 — Edit/delete dividend entries
- No schema change — edit/delete operate directly on the `transactions` row
  with `type = 'dividend'` (D17). Buy/sell edit/delete is explicitly out of
  scope for this round — a separate feature for later.
- Extracted the >30% diff-warning threshold into `src/lib/constants.ts`
  (`DIFF_WARNING_PCT`), now shared between `/prices` and the dividend modal
  instead of being duplicated.
- Dividend history rows in the existing modal now have pencil (edit) and
  trash (delete) icon buttons (plain inline SVG, no new icon dependency, no
  emoji — per DESIGN.md).
  - **Edit**: pre-fills the same date/amount/tax form from the selected row;
    saving does an `update` on that transaction id (not an insert). If the
    new amount differs from the original by more than the shared 30%
    threshold, a confirm dialog (stating old → new and the % change) must be
    accepted before the update goes through — same non-blocking warning
    pattern used elsewhere (D19, D26–28), aimed at catching edit typos.
  - **Delete**: always shows a confirm dialog stating the exact date and
    amount being removed before doing the `delete` — deletion is
    irreversible, so this is a hard requirement, not a soft warning.
  - Both paths reload the modal's history and call the existing `onSaved()`
    callback, so the Holdings page's Dividends/Total Return columns
    recompute from the current `transactions` state immediately (no stale
    cached numbers).
- Verified live end-to-end on a real asset (B-BHARATA, temporary test data,
  cleaned up after): create → small edit (no warning) → large edit (warning
  dialog with correct old/new/% text, accepted, applied) → delete (confirm
  dialog with correct date/amount, accepted, row gone, history back to
  empty). No console errors at any step.
- Design decision logged in DECISIONS.md (D29).

## 2026-07-05 — Subtle depth on interactive elements + cursor-pointer audit
- Added a "Depth & elevation" section to DESIGN.md documenting the new rule
  (rest = flat/`shadow-sm`, hover = `shadow-md` + ~1px lift, active = back
  to `shadow-sm`/`translate-y-0` — reads as a physical press). It wasn't
  actually in the file yet despite being referenced as already-updated; it's
  written up now so the doc matches what's implemented.
- Every button site-wide (Save targets, Preview + Confirm & save on
  `/prices`, and the dividend modal's Cancel/Save/Update buttons) now uses
  this same hover-lift/active-press pattern, replacing flat hover-only
  color changes.
- Dividend modal's edit (pencil) and delete (trash) icons, plus the modal's
  close (✕) button, now sit in a transparent circular hit target that gains
  a soft rounded background + the same lift/shadow on hover — edit shifts
  blue, delete shifts red (a destructive-action color, not a data value, so
  it doesn't conflict with the green/red-is-P&L-only rule), close stays
  neutral gray.
- Added `cursor-pointer` to every clickable element that didn't already
  reliably get one from the browser default: the "+ Dividend" button,
  the portfolio `<select>`, and all of the above buttons/icons (native
  `<button>` elements don't get a pointer cursor by default in most
  browsers — only `<a>` tags do, which is why this was missing everywhere).
- No color/tone changes — still the same neutral/blue/green/red palette,
  just with the added depth on interaction.
- Verified live: checked `getComputedStyle(...).cursor` for every button/
  select across Holdings, Targets, and Prices — all report `pointer` (a
  disabled Preview button correctly reported `not-allowed`); hover
  screenshots of the edit/delete icons show the expected rounded background
  + tint. No console errors.
- Design decisions logged in DECISIONS.md (D30–D31).