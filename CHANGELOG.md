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

## 2026-07-05 — Dark-first re-skin (per DESIGN.md's new direction)
- **Dark mode is now class-based and the hard default**, not OS-preference-
  based: `globals.css` adds `@custom-variant dark (&:where(.dark, .dark *))`
  and `layout.tsx` hardcodes `dark` on `<html>` — every existing `dark:`
  utility across the app now applies unconditionally, regardless of the
  visitor's OS setting (confirmed live with `colorScheme: "light"` emulated
  in the browser — body background still rendered as the dark near-black).
  No component classNames needed to change for this, since the existing
  `dark:`-prefixed values already matched the new target palette closely.
- **Accent color**: already blue (`blue-600`/`blue-400`) throughout — this
  wasn't a new introduction, just confirmed/kept against the new dark
  backdrop. Added active-state highlighting to the top nav (`NavBar` is now
  a client component using `usePathname`), which previously had no active-
  link indicator at all.
- **Hero number**: `SummaryCard` gained a `size?: "default" | "hero"` prop;
  only the Holdings page's "Total market value" card uses `size="hero"`
  (`text-4xl font-bold` vs. the normal `text-2xl font-semibold`) — Unrealized
  P&L, Total Return, and every table number are untouched, per DESIGN.md's
  rule that boldness stays reserved for one headline stat per page.
- **P&L colors untouched**: `pnlColor()` in `format.ts` was not modified.
  Verified live via `getComputedStyle` on rendered gain/loss cells — colors
  are exactly the pre-existing green-400/red-400 dark values.
- **No glow applied anywhere.** DESIGN.md scopes glow to an accent trend
  chart or a percentage-change badge — neither exists in this app yet (the
  closest candidates, the `(+12.34%)` suffixes on summary cards, are P&L-
  colored and explicitly excluded from glow by the same DESIGN.md section).
  Holdings table and edit/delete icons confirmed glow-free.
- **cursor-pointer audit re-run**: unaffected by this pass (no interactive
  classNames were touched), reconfirmed live on Holdings/Targets/Prices.
- Added a "Dark mode" note to ARCHITECTURE.md documenting the class-based
  mechanism for future edits.
- Design decision (hardcoded dark default, no toggle UI yet) proposed but
  not yet logged in DECISIONS.md — pending; note it's since been superseded
  in numbering by D32 below, so this one will land as D33 whenever logged.

## 2026-07-05 — Nav active-pill + custom confirm dialogs (DESIGN.md Components)
- **Nav active state**: the active link is now a translucent blue pill
  (`bg-blue-500/10`/`dark:bg-blue-400/10`, `rounded-full`) instead of just
  blue text. Inactive links get the same padding so nothing shifts between
  states. Verified live: active link's computed background is a translucent
  blue (`oklab(... / 0.1)`), inactive is fully transparent.
- **New `ConfirmDialog` component** (`src/components/ConfirmDialog.tsx`) +
  a `useConfirm()` hook (`src/lib/hooks/useConfirm.ts`) that turns
  `window.confirm()`'s blocking return value into `await confirm(message,
  options)`, resolving once the user responds to the rendered dialog. This
  let every call site swap in with almost no change to the surrounding
  logic (no restructuring of before/after-confirm checks).
- Replaced all four `window.confirm()` call sites (found via grep — one
  more than the task's illustrative list, the dividend duplicate-date
  warning, since "every point" was the actual ask):
  - Dividend delete (danger variant — red confirm button)
  - Dividend edit >30% amount change warning
  - Dividend duplicate-date-for-this-asset warning
  - `/prices` >30% price change warning
  All original message content (dates, amounts, old/new prices, % diffs)
  preserved exactly — only the presentation changed, including the
  multi-line prices-page message (`whitespace-pre-line` keeps the `\n`
  formatting).
- Fixed a bubbling bug during implementation: `ConfirmDialog`'s backdrop
  click needed `stopPropagation()` before calling its own cancel handler,
  since it's nested inside the dividend modal's own backdrop-click-to-close
  handler — without it, cancelling the confirm dialog would have also
  closed the dividend modal underneath it.
- Added a "Components" section to DESIGN.md (Navigation, Modals & dialogs,
  Badges/chips — chips explicitly deferred, no real use case yet) — it
  wasn't actually in the file despite being referenced as already-added;
  written up now to match what's implemented.
- D19 annotated as superseded by new D32 (see DECISIONS.md) rather than
  silently reworded — the underlying warn-don't-block philosophy is
  unchanged, only the UI mechanism.
- Verified live end-to-end: triggered and screenshotted all four dialogs
  (duplicate-date, large-edit-change, delete, prices unusual-change),
  confirmed both Cancel and Confirm paths work correctly for each (checked
  actual data state after each, not just UI), confirmed zero native
  `window.confirm`/`alert` dialogs fired throughout (tracked via
  Playwright's `dialog` event), and cleaned up all test data afterward.

## 2026-07-05 — Dividend row icon button + save/update/delete toasts
- Holdings table's "+ Dividend" text link replaced with a small icon button
  (plus-in-circle SVG), matching the same circular icon-button treatment as
  the dividend modal's edit/delete icons (transparent at rest, rounded
  hover background + lift/shadow, blue accent on hover).
- New reusable `Toast` component (`src/components/Toast.tsx`) — fixed
  top-right, dark card, green checkmark, auto-dismisses after ~3s. Wired
  into the dividend modal: "Dividend saved." / "Dividend updated." /
  "Dividend deleted." now show after each successful mutation (previously
  none of these had any success confirmation at all — the modal just
  silently updated).
- Added a "Toasts / success notifications" entry to DESIGN.md's Components
  section (green here is a success convention, not a P&L color — a distinct
  floating position keeps it from being confused with an inline gain/loss
  figure).
- Verified live: confirmed the old "+ Dividend" text is gone (0 matches)
  and the icon button is present on every row (8/8, one per holding);
  triggered save, update, and delete on a temporary test entry and
  confirmed each toast's exact text appeared; confirmed the toast
  auto-dismissed on its own after ~3.2s without user action; confirmed no
  residual test data left behind after cleanup. No console errors.
- Decisions to consider logging in DECISIONS.md (not yet saved — your call
  on exact wording): (1) converting "+ Dividend" to an icon button for
  visual consistency with the edit/delete icons already in the modal, and
  (2) toast design choices — top-right position, ~3s auto-dismiss, success
  only (errors deliberately stay inline, not toasted, so they don't vanish
  before being read).
  — Both logged: D33, D34.

## 2026-07-06 — Asset avatar icons on holdings table
- Each row in the Holdings table now shows a small colored circle before
  the symbol — 2-4 letter initials (punctuation stripped, uppercased) on a
  color hashed deterministically per symbol from a ~12-color palette that
  deliberately excludes green/red (reserved for P&L). Added a "Asset
  avatars" entry to DESIGN.md's Components section documenting this,
  including the known tradeoff that a few symbols can land on the same
  color with only ~12 buckets (initials still differ, so not worth a
  perfect-hash scheme for a decorative element).
- No reference image was actually attached to the request (checked — none
  present), so this was built from the text description (circle, 2-4 letter
  initials, colored) using common fintech-app avatar conventions; flagged
  this to the user rather than guessing at unseen visual details.
- Verified live: screenshot confirms distinct, readable avatars per asset,
  no console errors, palette widened once from 8 to 12 colors after
  noticing 3 SCB-prefixed funds initially collided on the same hue.

## 2026-07-06 — Portfolio trend chart: blocked on missing data, not built
- User asked for a small trend-line chart next to Total Market Value, with
  explicit instructions to flag (not fake) if there isn't enough historical
  data yet. There isn't: a real growth-over-time series needs either (a) a
  `portfolio_snapshots` table (ROADMAP.md Phase 4 — not started) or (b)
  reconstructing historical value from `transactions` + per-asset `prices`
  history, which is sparse/irregular (prices only get new rows on manual
  paste, crypto auto-refresh, or seed data — not a clean daily series for
  every asset). Did not build anything for this — no schema change, no
  chart, no mocked data. See the conversation for the question posed back
  to the user on how to proceed (start Phase 4's `portfolio_snapshots` now,
  or wait).

## 2026-07-06 — Reverted asset avatar icons
- Removed on request. Holdings table's symbol cell is back to plain text
  (no icon). Removed the corresponding "Asset avatars" entry from
  DESIGN.md's Components section. `Toast`, `ConfirmDialog`, nav pill, and
  everything else from recent rounds are unaffected.

## 2026-07-06 — Replaced the plain "+" with a coin icon for the dividend button
- The Holdings row dividend-entry button used a generic plus-sign icon,
  which didn't read as "dividend" the way the pencil/trash icons clearly
  read as edit/delete. Swapped it for a coin icon (circle + a `$`-like
  squiggle), same simple stroke style as the other icons, same circular
  hover-background treatment.
- Verified live via a 4x-scaled screenshot of the hovered button — reads
  clearly as a coin, consistent with the edit/delete icon language.

## 2026-07-06 — Phase 4 (snapshots slice only): portfolio_snapshots
- No prior draft of this schema actually existed in ARCHITECTURE.md despite
  being referenced as already-sketched — checked (grepped the whole repo
  for "snapshot"), found nothing; designed the table fresh from the exact
  column list given (id, portfolio_id, snapshot_date, total_value,
  total_cost, cash_value).
- New `migrations/0005_add_portfolio_snapshots.sql` (**not run** — needs to
  be applied by hand in Supabase SQL Editor, see below): `portfolio_snapshots`
  table with a `unique (portfolio_id, snapshot_date)` constraint so a given
  day can only ever have one row per portfolio (directly addresses
  GOTCHAS.md #1 — duplicate-row risk from re-running writes).
- Holdings page now computes and stores a snapshot of the portfolio's
  current total value:
  - **Auto**, on every non-silent holdings load (initial mount / portfolio
    switch — deliberately NOT on the 60s silent crypto-refresh reload, to
    avoid checking/writing every minute): checks whether today already has
    a row for this portfolio; only inserts if missing. Fully quiet — no
    loading state, errors swallowed — same philosophy as crypto
    auto-refresh.
  - **Manual** "Save today's value" button (top-right of the portfolio
    picker row): always upserts today's row with the latest numbers
    (overwrites), and surfaces success via a toast or failure via the
    existing inline error banner — this is an explicit user action, so
    unlike the auto path it doesn't stay silent on error.
  - `cash_value` needs each holding's `asset_type`, which isn't in
    `holdings`/`holdings_with_returns` (didn't touch either view) — done via
    one extra small `assets` lookup at snapshot-compute time only.
- **No trend chart built.** Just the data plumbing, as asked — the chart
  itself needs data to accumulate first.
- Updated ARCHITECTURE.md (new table) and migrations/README.md.
- Verified live against your real (unmigrated) Supabase project: page loads
  and renders holdings normally with no crash despite the missing table;
  auto-snapshot fails completely silently (no visible error, confirmed via
  screenshot); clicking "Save today's value" surfaces the expected
  `Could not find the table 'public.portfolio_snapshots'` error inline,
  proving the write path is wired correctly and error handling works as
  designed. No console errors beyond the expected 404s from the missing
  table.
- Design decisions to consider logging in DECISIONS.md (not yet saved —
  see the response to the user for exact wording): (1) `cash_value` via an
  extra `assets` query rather than extending a view, (2) auto-snapshot
  skipped on silent crypto-refresh reloads to limit write/check frequency,
  (3) auto = check-then-insert-if-missing vs. manual = always-overwrite.
  — All three logged: D35, D36, D37.
- Added the full `portfolio_snapshots` column list, unique constraint
  rationale, and the "computed client-side at load time, not reconstructed
  retroactively" note to ARCHITECTURE.md's Data model section.

## 2026-07-06 — New Overview page ("/"); Holdings moved to "/holdings"
- The user described a "/" portfolio-overview page (cards + a pie chart)
  that didn't actually exist anywhere in the repo — checked the file tree
  to confirm before touching anything, then built it fresh per their
  explicit go-ahead, rather than guessing at a page from an unseen
  reference.
- **Route change**: the single-portfolio Holdings table (with the
  dropdown, summary cards, dividend modal, crypto auto-refresh, snapshot
  button — all unchanged) moved from `src/app/page.tsx` to
  `src/app/holdings/page.tsx` (`/holdings`). Targets/Rebalancing/Prices
  were not touched — their own portfolio dropdowns work exactly as before
  (verified live).
- **New `/` Overview page**: one row per portfolio, sitting directly on
  the page background (no wrapping container) — translucent-blue wallet
  icon + name + holdings count on the left, total value (bold,
  tabular-nums) + a green/red return % badge + a chevron on the right.
  Static border/shadow at rest; hover adds a lift + faint blue border tint
  + `cursor: pointer`. No pie chart — the previous placeholder used
  fake categories (Sales/Finance/Marketing/HR) unrelated to real portfolio
  data; a real allocation chart is future Phase 3 work, not reused here.
- **Card click → Holdings, portfolio pre-selected**: each card links to
  `/holdings?portfolio=<id>`. The Holdings page reads that query param
  once on mount (wrapped in a `<Suspense>` boundary, required by Next.js
  for `useSearchParams()`) and calls the existing `usePortfolios()`
  hook's `setSelectedId` — the dropdown itself is completely unchanged
  and still works normally for switching afterward.
- **New `pnlBadgeClass()`** in `format.ts` — same green/red/gray semantics
  as `pnlColor()`, adds a translucent pill background. First real use of
  DESIGN.md's "Badges/chips," which was previously just a placeholder
  saying not to build one speculatively.
- **Nav updated**: added an "Overview" link (→ `/`), "Holdings" now points
  to `/holdings`. Documented the new Overview-card and Badges/chips
  patterns in DESIGN.md's Components section.
- Verified live: Overview renders the portfolio card with correct wallet
  icon, name, holdings count, value, and green badge; hover shows the
  blue border tint and pointer cursor; clicking navigates to
  `/holdings?portfolio=<id>` and the Holdings page loads with that
  portfolio already selected in the dropdown; Targets/Rebalancing/Prices
  confirmed unaffected (dropdowns still present and functional, Prices
  correctly has none — it was never portfolio-scoped). No console errors.

## 2026-07-06 — Nav: no tabs on Overview, clickable brand link everywhere
- Overview (`/`) now shows only the "Portfolio Tracker" brand text in the
  nav bar — the Holdings/Targets/Rebalancing/Prices tabs are hidden there,
  since none of them mean anything before a portfolio is picked. They still
  show normally on every other page.
- The brand link now has `cursor: pointer` and a blue hover tint
  (`hover:text-blue-600`/`dark:hover:text-blue-400`, ~150ms transition) on
  every page, so it reads as clickable (it's the way back to Overview) even
  where it's the only thing in the nav bar.
- Checked Overview's layout without the tabs — reads fine, not empty or
  oddly spaced; no layout changes needed beyond the nav bar itself.
- Documented both in DESIGN.md's Navigation entry.
- Verified live: nav on `/` contains only "Portfolio Tracker" (checked via
  the rendered nav text, not just visually); other pages still show all
  five tabs with the right one active. Brand link hover confirmed via
  computed-style color check with the mouse deliberately parked elsewhere
  first (an earlier check falsely reported "no change" because the mouse
  was still positioned over the link from the previous page in that test —
  re-verified properly: rest = near-white, hover = blue, reverts on
  mouse-away). No console errors.

## 2026-07-06 — Removed redundant "Overview" tab; bigger brand wordmark with a neon "Tracker"
- Removed "Overview" from the nav tabs — it pointed to `/`, same as the
  brand link, so it was a duplicate entry. Only Holdings/Targets/
  Rebalancing/Prices remain as tabs; the brand link is still the way back
  to Overview from anywhere.
- Brand wordmark bumped to `text-lg` (up from the inherited `text-sm`).
  "Tracker" now renders in accent blue with a permanent neon glow (layered
  `text-shadow`, not a hover effect); "Portfolio" stays the normal heading
  color.
- This widens DESIGN.md's glow scope, which previously only covered the
  trend chart and accent badges — updated Depth & elevation, Navigation,
  and "What to avoid" to name the wordmark as a third explicit exception,
  rather than leaving the doc inconsistent with what's actually built.
- Verified live: nav text on `/holdings` confirmed as exactly "Portfolio
  Tracker, Holdings, Targets, Rebalancing, Prices" (no "Overview"), and a
  screenshot confirms the glow renders and the wordmark is visibly larger
  than the tabs. No console errors.