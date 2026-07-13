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

## 2026-07-06 — Web forms for new portfolios and new assets (no more raw SQL for these two)
- No "mockup" with a dashed "+ New portfolio" placement actually existed
  anywhere in the repo (checked, same as prior instances) — used the
  existing `EmptyState` dashed-border style as the natural precedent
  instead of guessing at an unseen reference.
- **New portfolio**: dashed "+ New portfolio" row at the end of the
  Overview page's card list (also shown alone when there are zero
  portfolios, replacing the old static-text empty state). Opens
  `NewPortfolioModal` — just a name field, `base_currency` hardcoded to
  `'THB'` (not exposed in the form, per the ask). On success: closes,
  shows a "Portfolio created." toast, and reloads the card list in place
  (no navigation needed — already on the page that shows it).
- **New asset**: new `/assets` page (added to the nav) listing every
  existing asset (symbol, name, type, currency, sector, country, tax
  bucket) plus a "+ New asset" button opening `NewAssetModal` with all
  the requested fields (symbol, name, asset_type dropdown, currency
  dropdown, sector/country optional text, tax_bucket dropdown).
- **Duplicate-symbol handling — important nuance found**: the schema's
  unique constraint is on `(symbol, market)`, but this form never
  collects `market` (always `NULL`), and Postgres treats `NULL != NULL`
  for uniqueness — so the existing constraint would **not** reliably
  catch a duplicate symbol here. Added an explicit case-insensitive
  pre-check query before inserting, plus a fallback translation of a raw
  `23505`/"duplicate key" error just in case the constraint does fire
  from some other path — both show the same friendly "An asset with
  symbol "X" already exists." message instead of a raw SQL error.
- Both new modals reuse the same dark-card/backdrop-blur/button-depth
  style as `ConfirmDialog` — no `window.confirm`/`alert` anywhere.
- Verified live end-to-end: existing assets list loads and shows real
  data; tried creating a duplicate "BTC" asset and got the friendly error
  (not raw SQL); created a genuine new test asset — toast shown, row
  appeared in the table; created a test portfolio from Overview — toast
  shown, new card appeared immediately (0 holdings, ฿0.00, no %
  badge, matching D41). No native dialogs fired, no console errors.
- **Left test data in the live database**: one asset (`TESTASSET1`) and
  one portfolio ("Playwright Test Portfolio") from this verification.
  Could not clean these up — reading `.env.local` to script a delete is
  blocked by a safety hook (by design, since it holds credentials), and
  there's no delete UI built yet for either. Flagged to the user to
  remove manually via the Supabase dashboard.
- Design decisions to consider logging in DECISIONS.md (not yet saved):
  (1) explicit pre-check query for duplicate symbols rather than relying
  on the DB constraint, since the constraint doesn't reliably fire here;
  (2) currency is a dropdown of the same 5 currencies already in
  `format.ts`'s `CURRENCY_SYMBOLS`, not free text, so `formatMoney` never
  falls back to an unrecognized-currency prefix; (3) `/assets` also lists
  existing assets (not just the form) so the duplicate-symbol check has
  a visual complement — see them before you try to add one.

## 2026-07-06 — Web form for buy/sell transactions (highest-risk feature so far)
- Extracted asset-creation logic (duplicate-symbol pre-check + insert) out
  of `NewAssetModal` into a shared `src/lib/assets.ts` (`createAsset()`,
  plus the `ASSET_TYPES`/`CURRENCIES`/`TAX_BUCKETS` constant lists), since
  the same logic is now needed in two places — `NewAssetModal` and the new
  transaction modal's inline "add new asset." `NewAssetModal` refactored to
  use it; behavior unchanged, verified via lint/build.
- New "+ Add transaction" button on the Holdings page (next to "Save
  today's value"), opening `TransactionModal` for the currently selected
  portfolio:
  - **Type**: Buy/Sell as two big toggle buttons, not a dropdown — harder
    to misclick. Deliberately NOT colored green/red (tempting, but that's
    reserved for P&L per DESIGN.md) — both use the same neutral
    active-blue-pill treatment as the nav tabs.
  - **Asset**: a combobox searching existing assets by symbol/name, with
    a "+ Add new asset" option that **expands an inline mini-form in
    place** (not a separate modal-on-modal) — symbol/name/asset_type/
    currency/sector/country/tax_bucket, same fields as the standalone
    `/assets` form. Creating it auto-selects the new asset and collapses
    back to the normal combobox view.
  - **Quantity** labeled "Quantity (units/shares)" and **Price** labeled
    "Price per unit (CURRENCY)" (currency shown dynamically once an asset
    is picked) — separate, clearly-labeled fields specifically to guard
    against the quantity/price mixup from GOTCHAS.md #1.
  - **Preview-before-save**: submitting doesn't insert immediately — it
    builds a plain-language summary ("You're about to buy/sell N units of
    SYMBOL at PRICE per unit — total AMOUNT (incl. fee).") and requires
    confirming via the existing `ConfirmDialog`/`useConfirm()` (no
    `window.confirm`).
  - **Oversell warning**: for a "sell," queries the `holdings` view for
    the current quantity of that asset in that portfolio; if the entered
    quantity exceeds it, an extra warning line is appended to the same
    preview message and the confirm button switches to the red "danger"
    variant (same convention as the delete-icon red) — doesn't block, per
    the ask, since the on-file holding can legitimately be out of sync
    with the actual broker for other reasons.
  - **On success**: closes the modal, shows a "Transaction saved." toast,
    and calls the existing `loadHoldings()` — the table reflects the new
    quantity/avg_cost immediately, no page reload.
- Verified live and carefully, given the risk level:
  - Created a new asset (`TESTXN1`) via the inline mini-form mid-transaction
    and confirmed it auto-selected correctly.
  - Confirmed the preview dialog's exact text before committing: "You're
    about to buy 1 unit of TESTXN1 at ฿100.00 per unit — total ฿100.00
    (incl. fee)." — matches the entered quantity/price/fee exactly.
  - Confirmed the buy for real (the one deliberate live write) and verified
    the Holdings table updated immediately with no reload: `TESTXN1` row
    appeared with Qty 1, Avg Cost ฿100.00, Last Price/Market Value
    correctly "—" (no price exists yet), Unrealized P&L ฿0.00 in neutral
    gray (not colored, since it's exactly zero).
  - Separately tested selling 5 units of `TESTXN1` (only 1 held) —
    confirmed the exact warning text ("⚠ You currently hold 1 unit of
    TESTXN1 — this sells more than you have.") and the red "Confirm sell"
    button, then **cancelled** rather than completing it, to avoid
    creating a nonsensical negative-holding test transaction.
  - Confirmed zero native `window.confirm`/`alert` dialogs fired
    throughout, and no console errors.
- **Left test data in the live database**: one asset (`TESTXN1`) and one
  buy transaction (1 unit @ ฿100.00) against the Retirement portfolio.
  Same limitation as before — no delete UI for assets/transactions yet,
  and reading `.env.local` to script a cleanup is blocked by the safety
  hook. Flagged for manual removal via the Supabase dashboard.
- Deposit/withdraw/split forms deliberately not built this round, per the
  ask — buy/sell only.
- Design decisions to consider logging in DECISIONS.md (not yet saved):
  (1) Buy/Sell toggle uses neutral blue, not green/red, to keep those
  colors reserved for P&L; (2) the sell-quantity check warns via the
  preview dialog rather than blocking, since holdings can legitimately
  differ from the real broker for other reasons; (3) the "add new asset"
  sub-flow expands inline in the same modal rather than opening
  `NewAssetModal` as a nested modal, both per the literal ask and to avoid
  modal-on-modal z-index/backdrop complexity; (4) extracted asset-creation
  logic into `src/lib/assets.ts` now that it's used in two places.

## 2026-07-06 — Assets page: edit form replaces "+ New asset", asset creation consolidated into the transaction form
- `/assets`: removed the "+ New asset" header button and its modal wiring.
  Asset creation now happens exclusively via the transaction form's
  "+ Add new asset" combobox flow (built last round) — no duplicate entry
  point needed here.
- Added a pencil edit-icon button at the end of each table row, styled
  identically to the edit icon in `DividendModal` (transparent at rest,
  circular gray hover background, blue on hover, matching dark-mode
  variants).
- New `src/components/EditAssetModal.tsx`: custom modal (no
  `window.prompt`) pre-filled from the clicked asset. Editable: name,
  asset_type, currency, sector, country, tax_bucket. **Symbol is shown as a
  disabled, read-only input** — it's the identifier transactions reference,
  so it can't be changed here.
- On save: `update`s the `assets` row directly (no new helper — this is a
  single call site, unlike `createAsset()` which serves two callers), shows
  an "Asset updated." toast, closes the modal, and reloads the assets list
  — table reflects the change immediately, no page refresh.
- Deleting assets deliberately NOT built this round — an asset with
  transactions already tied to it needs more careful handling (reassign?
  block? cascade?), left for a separate task.
- **Deleted `src/components/NewAssetModal.tsx`**: its only remaining
  consumer was the button just removed from `/assets`; confirmed via grep
  it had zero other references. Updated a stale comment in
  `src/lib/assets.ts` that named it as a consumer of `createAsset()`.
- Verified live: confirmed the "+ New asset" button is gone, all 10 existing
  assets show a working pencil icon, the edit modal opens pre-filled with
  the symbol field genuinely disabled, changing the Sector field and saving
  shows the "Asset updated." toast and updates the table row instantly, and
  zero native dialogs/console errors fired. The one live edit made during
  testing (a temporary "TestSectorXYZ" sector value) was reverted back to
  the asset's original value before finishing — no lasting test-data change
  this round.
- Design decisions to consider logging in DECISIONS.md (not yet saved):
  (1) the symbol field is shown but disabled, not simply hidden, so the
  user can still see which asset they're editing; (2) the update call is
  inline in `EditAssetModal` rather than a shared `updateAsset()` helper in
  `src/lib/assets.ts`, since (unlike creation) there's only one call site
  today; (3) `NewAssetModal.tsx` was deleted outright rather than left
  unused, per the project convention of not keeping dead code around.

## 2026-07-06 — Asset symbol becomes editable; asset delete button added
- **Symbol is now editable** in `EditAssetModal` (previously disabled —
  see D47/the entry above). Rationale: symbol typos at creation time are
  real, and until now the only fix was the SQL Editor.
  - Before saving a changed symbol, checks it's not already used by another
    asset (`isSymbolTaken()`, new shared helper in `src/lib/assets.ts`,
    also now used internally by `createAsset()` to remove duplicated
    lookup logic) — shows the same friendly "already exists" message as
    asset creation, with a `23505`/duplicate-key DB error as a fallback
    translation.
  - If the symbol actually changed, a `ConfirmDialog` warns first: "won't
    affect this asset's existing transaction history — transactions
    reference it by internal ID, not by symbol." Only fires when the
    symbol field is actually edited — saving other fields unchanged skips
    it.
- **Added a delete (trash) icon** next to the edit icon on every Assets
  row, same hover-red destructive-action styling as the delete icon in
  `DividendModal`.
  - Before deleting, counts `transactions` rows referencing the asset
    (`asset_id` has `on delete restrict` in the schema, so the DB would
    reject this anyway — checking first gives a clear message instead of a
    raw constraint error).
  - **0 transactions**: normal `ConfirmDialog` ("Delete "X" — Name? This
    can't be undone.", red confirm button) → deletes on confirm → "Asset
    deleted." toast → table updates immediately.
  - **>0 transactions**: a blocking, info-only dialog ("has N
    transaction(s) linked to it. Delete those first...") with only an "OK"
    button — no path to delete from here. Required adding a new
    `hideCancel` option to `ConfirmOptions`/`ConfirmDialog` (hides the
    Cancel button for single-action info dialogs); this is a small,
    reusable addition to the shared confirm system, not one-off code.
- Verified live against real data: attempted to delete `TESTXN1` (has 1
  transaction) — got the blocking dialog with the correct count, no delete
  happened; renamed `TESTXN1`'s symbol to `TESTXN1RENAMED` in the edit
  form, saw the correct warning dialog naming both the old and new symbol,
  then cancelled (no change committed); deleted `TESTASSET1` (0
  transactions) for real — got the normal confirm dialog, confirmed, saw
  the "Asset deleted." toast, and the row disappeared from the table
  immediately. This also incidentally cleaned up one piece of leftover
  test data from an earlier round. Confirmed zero native dialogs and zero
  console errors throughout.
- Design decisions to consider logging in DECISIONS.md (not yet saved):
  (1) reversing the earlier "symbol is disabled" decision now that a safe
  rename path (dedup check + explicit warning) exists; (2) the duplicate
  vs. no-duplicate transaction-count branch uses an info-only dialog
  (new `hideCancel` option) rather than just disabling/hiding the delete
  button when transactions exist, so the user gets an explicit reason
  instead of a button that mysteriously does nothing; (3) extracted
  `isSymbolTaken()` as a shared helper now used by both `createAsset()`
  and the edit form's rename check.

## 2026-07-06 — Unified "History" modal: view/edit/delete transactions, dividends moved into a tab
- The Holdings table's per-row action button changed from a coin icon
  (opened `DividendModal` directly) to a pencil icon (same style as
  `/assets`, `aria-label="View history"`), opening a new **`HistoryModal`**
  with two tabs: **Transactions** and **Dividends**.
- **Dividends tab**: the previous `DividendModal` content (record form +
  history list with edit/delete) moved here largely as-is — same behavior,
  same duplicate-date and large-change warnings. `DividendModal.tsx` was
  deleted outright once absorbed (confirmed zero other references via
  grep).
- **Transactions tab** (new): lists every buy/sell for the asset, newest
  first, each row with a pencil (edit) + trash (delete) icon in the same
  style as the dividend list.
  - **Editing** a transaction opens the same fields as creation (type,
    date, quantity, price, fee), pre-filled. Unlike dividends, **every**
    edit always shows a preview/confirm dialog before saving — no
    percentage threshold to skip it, since this is changing an existing
    ledger entry that avg cost/holdings already depend on.
  - **Deleting** a transaction always shows a confirm dialog stating the
    row's own type/date/quantity/price before deleting.
  - **New safety check for both**: before confirming an edit or delete,
    replays the asset's full buy/sell timeline (fetched fresh, ignoring
    whatever page is currently visible) with the change applied, and warns
    — doesn't block — if held quantity would go negative at any point
    afterward (e.g. shrinking an old buy below what a later sell already
    assumed). New pure helper `wouldCauseNegativeHolding()` in
    `src/lib/transactions.ts` does the replay; this is the same
    warn-don't-block philosophy as the existing oversell warning, and
    guards the exact class of mistake described in GOTCHAS.md #1.
- **Pagination**: both tabs load only 10 rows initially (`.range()` +
  `{ count: "exact" }`, not fetch-all-then-slice) with a "Load more (N
  more)" button that fetches 10 more at a time — keeps a long history from
  ever loading in full up front.
- Verified live and thoroughly, given the risk level:
  - Confirmed the pencil icon (not coin) opens History with Transactions
    as the default tab, and Dividends still works (empty state correct
    for an asset with none).
  - Built a throwaway asset (`HISTTEST1`): buy 5 @ 2026-01-01, sell 3 @
    2026-01-02 (net qty 2, stays visible in holdings). Tried editing the
    buy's quantity down to 2 — confirmed the exact negative-holding
    warning text appeared, cancelled without committing. Tried deleting
    that same buy outright — confirmed the same warning plus the correct
    row details (quantity/date), cancelled. Confirmed deleting the *sell*
    instead triggers no such warning (removing a sell can only raise the
    running total, never lower it).
  - Added 9 more small buys to reach 11 total transactions, confirmed only
    10 showed initially with "Load more (1 more)", clicked it, confirmed
    all 11 then appeared and the button disappeared.
  - Edited `TESTXN1`'s real buy transaction from qty 1 → 2 — confirmed the
    preview text, confirmed the Holdings table quantity updated
    immediately with no page reload, then edited it back to 1 to fully
    restore its original state.
  - **Cleaned up all throwaway data using the app's own new delete
    features**: deleted all 11 `HISTTEST1` transactions (newest-first,
    which never trips the negative-holding warning along the way), then
    deleted the `HISTTEST1` asset itself via `/assets` (0 transactions
    left) — zero residual test data left in the database this round.
  - Confirmed zero native `window.confirm`/`alert` dialogs and zero
    console errors throughout.
- Design decisions to consider logging in DECISIONS.md (not yet saved):
  (1) Transactions is the default tab (not Dividends), since viewing/
  fixing transaction history is this modal's main new purpose; (2) both
  tabs re-query with an increasing `.range()` limit on "Load more" rather
  than incrementally appending pages, trading a little redundant refetch
  for much simpler state — fine at this data scale; (3) the negative-
  holding check always re-fetches the asset's full untrimmed transaction
  list at the moment of edit/delete, rather than relying on whatever page
  is currently loaded in the UI, so pagination can never hide a real risk;
  (4) `wouldCauseNegativeHolding()` extracted to `src/lib/transactions.ts`
  as a pure, testable function rather than inlined in the modal.

## 2026-07-06 — Multi-dimension allocation (sector/country), closes out Phase 3
- New `/allocation` page (added to nav, between Rebalancing and Prices):
  two donut charts — "By sector" and "By country" — each showing the
  selected portfolio's holdings grouped by that dimension, sized by share
  of total market value, with a legend (colored dot + label + %) beside
  the chart on desktop, stacked below it on mobile.
- Deliberately scoped to sector/country only, per the ask — **not**
  building currency-based allocation this round, since every asset is
  currently THB (nothing to break out yet). `ROADMAP.md` updated: Phase 3
  marked mostly done, with the currency-allocation gap explicitly called
  out as "not yet needed" rather than silently dropped.
- **No new chart library** — `src/components/DonutChart.tsx` is a plain
  SVG stroke-arc donut (each segment a `<circle>` sized by
  `stroke-dasharray`/`stroke-dashoffset`, rotated to start at 12 o'clock).
  Avoids both an unapproved new dependency (per ARCHITECTURE.md's "ask
  before adding a dependency") and a chart library's default rainbow
  palette, which the ask explicitly wanted to avoid.
- New `src/lib/chartColors.ts`: a curated blue-led palette (`CHART_COLORS`,
  8 mid-lightness cool hues — blue/sky/indigo/teal/violet/cyan) that stays
  in the app's accent family per DESIGN.md, plus a separate neutral
  `UNCATEGORIZED_COLOR` (gray) kept deliberately outside that palette so a
  gap in the data reads as "missing," not as just another category.
- **"Uncategorized" fallback**: any holding whose `sector`/`country` is
  null or blank groups under "Uncategorized" instead of erroring or being
  silently dropped from the chart.
- Data: fetches the `holdings` view for the selected portfolio, then a
  separate `assets` query for `sector`/`country` on just those asset ids
  (same precedent as D35's `cash_value` lookup — those columns aren't on
  `holdings`/`holdings_with_returns`, and extending either view just for
  this one page isn't worth it).
- No interactive filtering this round (clicking a slice doesn't filter the
  Holdings table) — summary charts only, per the ask.
- Verified live against the real Retirement portfolio (read-only —
  no data was created or modified): both donuts render with correct,
  distinct colors and legend percentages matching real sector/country
  splits (e.g. 31.1% Broad Market (China Equity), 38.5% Global by
  country), summing to 100% in each chart. Checked at a 375px mobile
  width: the allocation cards and legends reflow correctly with no
  overflow of their own. Noted a **pre-existing, unrelated** nav bar
  overflow at 375px width (confirmed present on `/holdings` too, which
  wasn't touched this round) — flagged to the user, not silently fixed,
  since it's a separate nav-responsiveness gap outside this task's scope.
- Design decisions to consider logging in DECISIONS.md (not yet saved):
  (1) new standalone `/allocation` page rather than adding the charts to
  the already-dense Holdings page, consistent with the app's existing
  one-focused-page-per-concern pattern (Targets/Rebalancing/Prices/
  Assets); (2) hand-rolled SVG donut chart instead of a charting library,
  both to avoid an unapproved dependency and to get a fully custom color
  palette; (3) a dedicated neutral color for "Uncategorized" kept outside
  the regular category palette.

## 2026-07-06 — Moved the allocation donuts from a standalone page into Holdings (reversing the earlier placement)
- Removed the `/allocation` route entirely and its nav link — the two
  donut charts ("By sector", "By country") now live directly on the
  Holdings page, in a `grid-cols-1 lg:grid-cols-2` row between the summary
  cards (Total market value / Unrealized P&L / Total return) and the
  holdings table, matching the page's existing `gap-4` spacing rhythm.
  Same reasoning both ways, just a different call this round: keeping
  allocation next to the table it summarizes means seeing it needs no
  extra navigation, and the two donut cards read as one more "summary
  row" rather than a cramped addition, given they're compact and sit
  below the existing 3-card summary grid rather than beside it.
  `AllocationDonut`, `DonutChart`, and `chartColors.ts` were kept as-is —
  only the page-level wiring moved; `groupByDimension()` (grouping +
  "Uncategorized" fallback + palette assignment) now lives in
  `holdings/page.tsx` instead of the deleted allocation page, since it
  only has the one call site again.
- Holdings' existing `loadHoldings()` now also calls a new
  `loadAssetInfo()` to fetch `sector`/`country` for the current holdings'
  asset ids (same separate-query pattern as D35's `cash_value` lookup) —
  skipped on the 60s silent crypto-refresh reloads, since sector/country
  only change via an asset edit, not a price tick, mirroring how
  auto-snapshot is already silent-load-skipped for the same reason.
  Donut row is only rendered once holdings have loaded and there's at
  least one holding, so it never flashes an empty chart shell.
- Verified live: confirmed `/allocation` now 404s and "Allocation" is gone
  from the nav; confirmed the two donuts render correctly in their new
  spot on `/holdings` with the same real Retirement-portfolio data as
  before (sector/country percentages unchanged, still summing to 100%
  each); checked the page at a 375px mobile width — the two donut cards
  stack cleanly below the summary cards with no overflow of their own,
  and the page isn't excessively long relative to before. Zero native
  dialogs, zero console errors. No data was created or modified — this
  was a pure UI relocation, read-only against the database.
- Design decision to consider logging in DECISIONS.md (not yet saved):
  reversing the earlier "own `/allocation` page" call in favor of
  embedding directly in Holdings, since seeing allocation right next to
  the table it summarizes was judged more useful than a dedicated page
  for two compact charts.

## 2026-07-06 — Holdings table no longer forces horizontal scroll on desktop; nav bar is now sticky
- **Table width**: removed the table's old hardcoded `min-w-[1040px]`,
  which forced a horizontal scrollbar on every screen size, including
  wide desktop monitors, since it was wider than the page's own
  `max-w-5xl` container. Root cause, found empirically (measuring each
  column's actual rendered width): a few columns had genuinely wide
  content — one symbol with a 16-character name (`PRINCIPAL VNEQ-A`) and
  BTC's price in the millions (`฿2,996,421.21`) — that auto table layout
  was sizing every row's column to accommodate.
  - Dense numeric (`tabular-nums`) cells dropped from `text-sm` to
    `text-xs` — still fully legible, and consistent with DESIGN.md's
    existing rule that bold/large treatment is for hero numbers, not
    every value in a dense table.
  - Cell padding tightened from `px-4` to `px-3` (`px-2` on the icon-only
    column).
  - The `Unrealized P&L` / `Total Return` cells now render their `%` on
    its own line below the money value, instead of inline
    (`"+฿3,931.12 (+23.19%)"` on one unbreakable line) — this was the
    single biggest lever, since it roughly halves the longest unbreakable
    string in those two columns.
  - `Symbol` no longer forces `whitespace-nowrap` — the one symbol with a
    space in it can now wrap to two lines like `Name` already does,
    rather than that single row dictating the whole column's width.
  - `Name` was already unconstrained/wrapping; left as-is.
  - Table's `min-width` reduced to `720px` — now just a floor for very
    narrow contexts, not the thing forcing overflow.
  - Verified empirically (measuring `scrollWidth` vs. `clientWidth` of
    the table's wrapper via Playwright) at 1920/1440/1280/1024px: **zero
    overflow** — no scrollbar. At 768px and 375px, the table still
    exceeds the available width and scrolls, as expected/acceptable on
    tablet/mobile per DESIGN.md.
  - Confirmed the donut charts row and the table card share the exact
    same left/right edges at a desktop width (both `240px`–`1200px` in a
    1440px-wide test), so the page reads as aligned top to bottom.
- **Sticky nav**: `NavBar` is now `sticky top-0 z-40` with its existing
  opaque background kept as-is (no transparency was ever added, so no
  change needed there) — stays pinned while the page scrolls underneath
  it. `z-40` is deliberately below every overlay in the app (modal
  backdrops `z-50`, `ConfirmDialog` `z-[60]`, `Toast` `z-[70]`), so an
  open modal always correctly covers the nav instead of sitting behind
  it. `sticky` (not `fixed`) was chosen specifically because it doesn't
  remove the nav from document flow, so no page needed a compensating
  top-padding change to avoid content jumping under it.
  - Verified live: scrolled a tall Holdings page down ~770px, confirmed
    the nav's `getBoundingClientRect().top` stayed at `0` throughout,
    confirmed its computed background color is fully opaque, and
    confirmed (via `elementFromPoint`) nothing renders through it —
    table rows visibly scroll up and disappear cleanly under the bar in
    the screenshot.
- DESIGN.md updated: added a "dense table on desktop" note under
  Responsive (the text-xs / tighter padding / stacked-%-line / allow-wrap
  levers, so a future dense table gets built with these already in mind
  instead of rediscovering them), and documented the sticky nav's
  positioning/z-index/opacity rationale under the Navigation component
  entry.
- No data was created or modified this round — pure CSS/layout changes,
  verified read-only against the real Retirement portfolio.

## 2026-07-06 — Site-wide responsive container: content now fills wide desktop screens instead of sitting in a narrow fixed column
- New shared constant `CONTAINER_CLASS` in `src/lib/layout.ts`:
  `mx-auto max-w-[1600px] px-4 sm:px-6 md:px-8 xl:px-12 2xl:px-16`. Applied
  to every page's `<main>` (Overview, Holdings, Targets, Rebalancing,
  Prices, Assets) and `NavBar`, replacing each page's own hardcoded
  `max-w-*` string.
  - **Found and fixed an existing inconsistency while doing this**: the
    Overview page (`/`) was using `max-w-3xl` (768px) while every other
    page used `max-w-5xl` (1024px) — Overview was already narrower than
    the rest before this task, unrelated to today's ask but exactly the
    kind of drift a shared constant now prevents.
  - Mobile (<768px): unchanged — full width, small (`px-4`) padding.
  - Tablet (768–1280px): full width, medium (`md:px-8`) padding.
  - Desktop (1280–~1650px): content grows fluidly with the viewport (no
    narrow cap forcing large empty side margins) — this was the actual
    complaint, since the old `max-w-5xl`/`max-w-3xl` caps left big unused
    margins on any screen wider than ~1024/768px.
  - Very large screens: capped at `max-w-[1600px]`, centered, so line
    lengths don't stretch to the point of being hard to read on an
    ultrawide or 4K display.
- Verified live via Playwright across 6 pages × 7 viewport widths (375,
  768, 1024, 1280, 1440, 1920, 2560): confirmed every page's `<main>` and
  the nav bar render at the **exact same width and left/right edges** at
  every single width tested (`navAligned` true in all 42 combinations);
  confirmed content grows continuously from 375px up through 1440px with
  no premature cap; confirmed the container locks to exactly 1600px,
  centered, at 1920px and 2560px (160px and 480px side margins
  respectively). Screenshotted Holdings at 1440/1920/2560 to confirm it
  reads as balanced, not stretched — as a side benefit, fund names in the
  Name column that used to wrap across 3-4 lines at the old 1024px cap
  now mostly fit on one line at typical laptop widths (1440px+), since the
  table has more room to work with.
  - The Holdings table's own `min-w-[720px]` floor (from the previous
    round) still applies independently — mobile/tablet below ~768px still
    scrolls horizontally as expected; that behavior is unchanged by this
    container change.
  - The handful of "429 Too Many Requests" console errors seen during
    testing came from Supabase/CoinGecko rate limits triggered by rapidly
    reloading 42 page combinations back-to-back in the test script itself
    — unrelated to this change, not a real app issue.
- DESIGN.md updated: documented `CONTAINER_CLASS` under "Layout &
  spacing" as the one required container for every page and the nav, so a
  future new page imports it instead of guessing a `max-w-*` value.
- No data was created or modified — pure layout/CSS change, verified
  read-only against the real Retirement portfolio.

## 2026-07-06 — "By sector" donut labels each slice "Symbol (sector)"
- `holdings/page.tsx`: added `groupBySymbolWithSector()`, used only for
  the "By sector" chart — one slice per holding (not merged by sector
  text), labeled `"${symbol} (${sector})"` (or `"${symbol}
  (Uncategorized)"` if the asset has no sector). Fixes the legend reading
  as a bare sector description (e.g. "Broad Market (China Equity)") with
  no indication of which holding it was. "By country" is unchanged —
  still grouped/labeled by country name only, since that ask was scoped
  to sector only.
- Verified live: legend now reads e.g. "SCBCHAE (Broad Market (China
  Equity))", "BTC (Cryptocurrency)" — confirmed against the real
  Retirement portfolio, read-only.

## 2026-07-07 — Portfolio value trend chart (Phase 4 growth chart), from `portfolio_snapshots`
- **New dependency: `recharts`** (v3, React 19-compatible peer range) —
  the first charting library in the app. Explicitly asked-for/pre-approved
  this round (unlike the earlier sector/country donuts, which stayed
  hand-rolled SVG specifically to avoid a new dependency at the time — see
  ARCHITECTURE.md, that choice wasn't revisited here).
- New `src/components/TrendChart.tsx`, rendered on the Holdings page
  between the summary cards and the sector/country donut row. Plots
  `total_value` from `portfolio_snapshots` for the currently-selected
  portfolio, ordered by date.
  - **Fewer than 2 snapshot rows**: shows a plain, calm message ("Not
    enough data yet for a trend chart...") instead of a chart — no flat
    line or single floating dot, which would misleadingly look like real
    (flat) history rather than "measurement just started."
  - **2+ rows**: a real line chart. X axis: month + day (`Jul 5`, not the
    raw ISO date) via a hand-parsed formatter (splits the `YYYY-MM-DD`
    string directly rather than `new Date(...)`, sidestepping any
    timezone-shift risk from parsing a date-only string). Y axis: currency
    symbol + comma-separated thousands (e.g. `฿160,754`), via a newly
    exported `symbolFor()` from `src/lib/format.ts` (previously a private
    helper). Custom dark-card tooltip on hover (not the library's default
    white tooltip) shows the exact date and full formatted money value.
  - Line color and axis/grid colors are hardcoded hex values, not Tailwind
    `dark:` classes — recharts renders its own internal SVG and doesn't
    reliably pick up a wrapping element's `currentColor`, and the app's
    dark mode is unconditional right now anyway (no reachable light-mode
    toggle), so hardcoding for dark specifically is accurate to what's
    actually shown.
  - The line has a permanent soft blue glow — same layered technique as
    the "Tracker" wordmark (two stacked `drop-shadow`s of increasing
    radius/decreasing opacity), applied via a small CSS rule in
    `globals.css` targeting recharts' own stable `.recharts-line-curve`
    class name. DESIGN.md's Depth & elevation explicitly reserves this
    kind of permanent glow for "the accent trend-line chart" — this is
    that chart.
- Wired into `holdings/page.tsx`: new `loadSnapshots(portfolioId)`,
  filtered by `portfolio_id`, called (a) whenever the page loads or the
  selected portfolio changes (same effect that already reloads holdings),
  and (b) again immediately after any write to `portfolio_snapshots` —
  both the silent auto-snapshot-on-load and the manual "Save today's
  value" button — so a brand-new data point appears in the chart right
  away, no page refresh needed.
- Verified live against the real Retirement portfolio, carefully, since
  it only had 1 real snapshot row today:
  - Confirmed the insufficient-data message renders correctly with the
    real single-row state (no chart, no error).
  - Captured the app's own public Supabase URL/publishable key from
    legitimate outgoing network requests (the same key the browser
    already sends on every request — not the secret key, nothing read
    from `.env.local`) to temporarily insert 7 historical rows and verify
    the real chart path: confirmed the line renders with a visible glow,
    X axis reads "Jun 29" through "Jul 6", Y axis reads "฿180,000" down to
    "฿0", and hovering shows a tooltip with the exact date and value
    (e.g. "Jul 2" / "฿155,200.00").
  - **Deleted all 7 temporary rows immediately after**, confirmed only
    the original real row remains and the insufficient-data message
    correctly returns — zero lasting test data.
  - Confirmed the chart's own width fits cleanly within a 375px mobile
    viewport (309px wide, well inside the frame); the Holdings table's
    separate, pre-existing horizontal scroll at that width is unrelated.
  - Did **not** create a second real portfolio to test the "switching
    portfolios updates the chart" requirement live, since portfolios
    can't be deleted in this app and that would leave permanent test
    data — verified instead by code review: `loadSnapshots` uses the
    identical `selectedId`-keyed effect and `.eq("portfolio_id", ...)`
    filter pattern already proven correct for holdings/asset-info
    refresh on portfolio switch elsewhere in the same file.
- ARCHITECTURE.md, DESIGN.md, and ROADMAP.md updated: `recharts` listed
  under Tech stack, a new "Portfolio trend chart" section explaining the
  data-refresh/no-chart-below-2-rows/hardcoded-color decisions, a
  "Trend chart" entry under DESIGN.md Components, and Phase 4 marked
  in progress with the growth chart done (benchmark/XIRR/drift-alerts
  still open).
- Design decisions to consider logging in DECISIONS.md (not yet saved):
  (1) `recharts` added as the app's first charting library, scoped to
  this one chart — the allocation donuts intentionally stay hand-rolled
  SVG, not migrated; (2) below 2 snapshot rows, show a message instead of
  any chart shape, rather than a flat/single-dot line; (3) chart colors
  hardcoded for dark mode specifically, rather than theme-aware, since
  recharts doesn't reliably inherit `currentColor` and dark is the only
  reachable mode today; (4) the line's glow uses a CSS rule targeting
  recharts' stable class name instead of an SVG `<filter>`, mirroring the
  wordmark's own `drop-shadow`/`text-shadow` technique for consistency.

## 2026-07-07 — XIRR (money-weighted annualized return), Phase 4
- New `src/lib/xirr.ts`: pure, dependency-free function solving for the
  annualized rate that zeroes the NPV of a list of `{ date, amount }`
  cash flows, via Newton-Raphson.
  - **Fixed a real convergence bug found during validation**: plain
    Newton-Raphson can overshoot past the mathematically valid `rate >
    -1` boundary on a steep NPV curve — e.g. a straightforward "invest
    100, worth 50 a year later" (-50%) case jumped to a first step of
    -122% and immediately failed. Fixed with step-halving/damping (retry
    with half the step, up to 50 times, before giving up) — a standard
    safeguarded-Newton technique. Re-verified against 8 hand-computed
    cases after the fix, including that exact -50% loss case.
  - Validated against known-answer cases (in a scratchpad script, not a
    committed test file — see the "no test framework yet" note below):
    100 today → 110 in exactly 1 year = exactly 10%; a 2-year compounding
    case (correctly off by a hair from a naive 10% due to 2024's leap
    day actually being inside that span — matches real day-count XIRR
    behavior, e.g. Excel's); a DCA case with two buys; a 0% case; a -50%
    loss case; a near-total-loss case (-99.99%, still converges cleanly);
    a deliberately weird oscillating-sign cash-flow case (converges to a
    finite answer, no crash). Confirmed `null` (never `NaN`/`Infinity`)
    for: a single cash flow, all flows on the same day, all flows the
    same sign, and (see below) a too-short time span.
  - **Found and fixed a second, real issue using the live Retirement
    portfolio's actual data**: every one of its 8 buy transactions is
    dated the same day (`2026-07-03`, the D6 "opening-balance" DCA
    convention), and with today's terminal "current value" flow only 4
    days later, the ~12% real gain annualized to **+3,145,865.30%** — a
    technically-correct-but-useless number. Added a `minSpanDays` option
    (default 30) to `xirr()`: below that span between the earliest and
    latest cash flow, returns `null` (same "not enough data" path) rather
    than an absurd annualized figure. This is a judgment call — the
    default of 30 days is somewhat arbitrary, flagged for DECISIONS.md.
- `holdings/page.tsx`: new `loadXirr(portfolioId, totalMarketValue)`
  builds the cash-flow list from `transactions` (`buy`/`sell`/`dividend`
  only — standalone `fee`/`deposit`/`withdraw`/`split` rows aren't
  included, per the ask's literal scope) plus one final "as if sold
  today" inflow of the current total market value, then calls `xirr()`.
  Recomputed on the same non-silent-load schedule as auto-snapshot/
  asset-info (portfolio load/switch — not every 60s silent crypto tick).
- New 4th summary card, "Annualized Return (XIRR)", added to the existing
  3-card row (now `sm:grid-cols-2 lg:grid-cols-4` instead of
  `sm:grid-cols-3`). Shows the formatted percentage with the usual
  green/red `pnlColor()` treatment when computable, or "Not enough data
  yet" in neutral color (no green/red) when `xirr()` returns `null` —
  covers both the "genuinely insufficient" and "too-short-span" null
  cases identically, per the ask.
- Verified live against the real Retirement portfolio (read-only —
  no data written): confirmed the card renders "Not enough data yet" in
  neutral color, correctly reflecting that portfolio's real 4-day-old
  transaction history post-fix (was showing the absurd +3,145,865.30%
  before the `minSpanDays` fix — caught by testing against real data,
  not just synthetic cases). Did not additionally insert temporary
  backdated transactions to also exercise the "real percentage renders
  in green/red" path live, per the new CLAUDE.md rule requiring
  permission before any test data touches the real database — that path
  reuses `formatPercent()`/`pnlColor()`, both already proven correct
  elsewhere on this exact page (visible working for Unrealized P&L/Total
  Return), and `xirr()` itself is thoroughly unit-validated, so this was
  judged sufficient without asking for another live-data round; happy to
  do that extra check if wanted.
- No test framework (vitest/jest) exists in this project yet, and
  ARCHITECTURE.md says to ask before adding a dependency — validated via
  an ad-hoc scratchpad script instead (consistent with how every other
  piece of logic has been verified this session), not a committed test
  suite. Flagged in case a real test framework is wanted going forward.
- ARCHITECTURE.md updated: new "XIRR (money-weighted annualized return)"
  section covering the cash-flow construction, the damping fix, and the
  `minSpanDays` guard. ROADMAP.md: Phase 4's XIRR line marked done.
- Design decisions to consider logging in DECISIONS.md (not yet saved):
  (1) Newton-Raphson step-halving/damping so a steep NPV curve can't
  overshoot the `rate > -1` domain and fail immediately — found via a
  real failing case (-50% loss), not hypothetical; (2) a `minSpanDays`
  floor (default 30 days) below which `xirr()` returns `null` instead of
  a technically-valid-but-absurd annualized number — found via the real
  Retirement portfolio's own data, not synthetic; (3) only
  `buy`/`sell`/`dividend` transaction types feed the cash-flow list, per
  the ask's literal scope — standalone `fee`/`deposit`/`withdraw`/`split`
  rows are excluded; (4) no test framework added — validated with an
  ad-hoc script instead, matching this session's established practice.

## 2026-07-08 — Drift-threshold alerts (Phase 4)
- New `src/lib/drift.ts`: extracted the Rebalancing page's existing drift
  formula (current % vs. target %, out-of-threshold when
  `|drift| > drift_threshold`, defaulting to 5% for a held asset with no
  target row) into shared pure functions — `computeDrift()` (per-asset
  detail) and `countDriftedAssets()` (returns `null` when a portfolio has
  zero `targets` rows at all, otherwise the count currently out of
  threshold, which may be `0`). No new formula was written — the ask was
  explicit about reusing Rebalancing's exact logic, so `rebalancing/
  page.tsx` was refactored to call `computeDrift()` too, rather than
  keeping two copies of the same math that could quietly drift apart.
- **Overview page**: each portfolio card now shows a small amber
  `DriftBadge` ("N asset(s) off target") right after the existing green/
  red return % badge, only when `countDriftedAssets()` is a positive
  number. Silent (nothing rendered) when a portfolio has no targets
  configured, or when every asset is within threshold — never a green/
  neutral "all good" state shown by default.
- **Holdings page**: a full-width amber banner (warning icon + "N
  asset(s) drifted from their target allocation." + a "View Rebalancing
  →" link to `/rebalancing`) appears above the summary cards, right below
  the portfolio picker, under the same two conditions as the Overview
  badge. Recomputed on portfolio switch/page load via a new `loadDrift()`
  (same non-silent-load schedule as auto-snapshot/XIRR/asset-info).
- New `src/components/DriftBadge.tsx`: exports both the compact
  `DriftBadge` pill (Overview) and a shared `WarningIcon` (reused directly
  in the Holdings banner, so both surfaces use the exact same icon).
  Amber/orange throughout, never red — DESIGN.md is explicit that red
  stays reserved for P&L losses, not general warning states. No dismiss
  control, no auto-expiry: this is an ambient status indicator, not a
  one-time event like `Toast`.
- Verified live against the real Retirement portfolio (read-only — no
  data written or modified): Rebalancing, Overview, and Holdings all
  independently agreed on "1 asset(s) need rebalancing" / "1 asset off
  target" / "1 asset drifted", confirming the shared formula behaves
  identically everywhere it's used. Clicked the Holdings banner's link
  and confirmed it navigates to `/rebalancing`. Switched to a second,
  empty portfolio (0 holdings, 0 targets) and confirmed both the Overview
  badge and Holdings banner render nothing at all for it — genuinely
  silent, not just visually hidden.
- ARCHITECTURE.md, DESIGN.md, ROADMAP.md updated: a new "Drift-threshold
  alerts" architecture section, a Components entry describing the badge/
  banner visual spec and the "renders nothing, not a collapsed state"
  behavior, and Phase 4 marked done for this slice (only benchmark
  comparison remains open in Phase 4).
- No design decisions flagged this round — the ask's conditions (no
  targets → silent, all within threshold → silent, amber not red, reuse
  Rebalancing's formula) were explicit enough to leave no open judgment
  calls.

## 2026-07-08 — Fix: Overview card chevron floated to the middle once the drift badge added a 3rd stacked line
- The money/%/drift-badge column and its chevron sat in a
  `flex items-center` row — fine when that column was 1-2 lines tall, but
  once the drift badge added a 3rd line, center-alignment made the
  chevron visually drift down next to the % badge instead of staying
  next to the money value at top.
- Fixed by changing that row to `items-start` and nudging the chevron
  down `mt-1` to match the money line's baseline — verified both the
  3-line case (money + % + drift badge) and the plain 1-line case (an
  empty portfolio, no badges at all) still look correct.

## 2026-07-08 — Overview card: % and drift badges now sit side by side, not stacked
- Changed the 3-line layout (money / % badge / drift badge, each on its
  own row) to 2 lines: money on top, then the % badge and drift badge
  together in one `flex flex-wrap` row underneath. `DriftBadge`'s own
  `mt-1` was removed (spacing between the two badges is now handled by
  the row's `gap`, not a per-badge margin meant for vertical stacking).
- Responsive: `flex-wrap` lets the drift badge drop to its own line on
  narrow viewports where both badges together would feel cramped next to
  a truncating portfolio name — verified at 375px (wraps to 2 badge
  rows), 768px, and 1440px (both badges stay on one row at both wider
  sizes).
- Re-checked the chevron position after this layout change (the exact
  thing the previous round's fix addressed) — still correctly aligned
  next to the money value at every width tested, including the
  narrow-viewport wrapped case.

## 2026-07-08 — Overview card: money/badges settled into a deliberate 2-line hierarchy (supersedes the single-row attempt)
- Reworked the right side of the portfolio card into two clearly distinct
  lines instead of one shared row: total value large and prominent on
  top (`text-xl font-medium`, ~20px/500 weight — the card's main focus),
  then the % and drift badges together, smaller (`text-xs`, ~12px) on
  their own line underneath.
- Badge polish: horizontal padding increased (`px-2 py-0.5` →
  `px-2.5 py-1`, in both the inline % badge and `DriftBadge`) so they read
  as breathing pills rather than tight text-in-a-box; `gap-2` (8px)
  between the two badges when both are present; `gap-1.5` (6px) between
  the value line and the badge line. Both lines stay right-aligned
  (`items-end` on the column).
- The badge line is only rendered at all when there's at least one badge
  to show (`showPercentBadge || driftedCount`) — an empty portfolio with
  neither a return % nor a drift alert collapses back to a clean single
  line, no reserved empty gap underneath the value.
- Chevron switched back to `items-center` on the outer row (removing the
  `mt-1`/`items-start` hack from the previous round, which was
  specifically compensating for an uneven ad-hoc 3-line stack) — with
  this deliberately-designed, consistent 2-line block, centering across
  both lines combined is the correct, symmetric result the ask wanted.
  Verified with exact pixel math (not just eyeballing): measured the
  midpoint of the chevron against the midpoint of the full value+badges
  content block at 1440px, 768px, 375px, and 320px — **0.0px difference
  at every width**, including the 375px/320px case where the two badges
  wrap onto separate lines (3 lines total: value, %, drift).
- No design decisions to flag — this round's spec (exact sizes, gaps,
  padding, centering rule, and the "collapse when no badges" case) was
  fully explicit.

## 2026-07-08 — RMF/SSF/ThaiESG holding-period tracking (Phase 5 slice — live price APIs not done yet)
- **New migration `migrations/0006_add_user_settings.sql`** (given to the
  user, not run): `user_settings` table (`id`, `birth_date` nullable,
  `created_at`) — single row, no `user_id` yet (no auth — see ROADMAP.md
  Phase 7). Client reads it as `select ... limit 1 maybeSingle()`; saves
  either update the existing row or insert the first one.
- New `src/lib/taxHolding.ts`: pure `computeTaxHoldingStatus()` function,
  evaluating rules **per buy lot** (each buy transaction has its own
  holding-period clock, not one clock per asset) — RMF: 5 years + age 55;
  SSF: 10 years, no age condition; ThaiESG: 5 years, no age condition;
  normal: no condition. Rules are commented with "checked as of July
  2026, re-verify before relying on this for a filing," per the ask.
  - Validated against 9 hand-computed known-answer cases in a scratchpad
    script (matching the XIRR precedent — no test framework in this
    project yet): exact boundary cases (bought exactly 5 years before
    today = met; 1 day short = not met), RMF with age already satisfied,
    RMF with holding met but age not met, RMF with holding not yet met
    regardless of age, SSF/ThaiESG without any age condition, and the
    `normal` no-condition case.
  - `ageConditionMet` is `null` (not guessed) when RMF's `birth_date`
    isn't on file — the UI detects this specifically rather than showing
    a misleading met/not-met badge for a condition that can't actually be
    checked yet.
- **New `/settings` page** (added to nav): a single "Birth date" field,
  reading/writing the one `user_settings` row. Shows an inline amber note
  when the field is empty ("Enter your birth date to see RMF's age
  condition"). Correctly surfaces a real inline error before the
  migration is applied ("Could not find the table 'public.user_settings'
  in the schema cache") rather than crashing — verified live.
- **New `src/components/TaxHoldingBadge.tsx`**: renders under each `buy`
  row in `HistoryModal`'s Transactions tab, only when the asset's
  `tax_bucket` isn't `normal`. Colors deliberately avoid green/red
  (reserved for P&L) — blue for "met" (same neutral treatment as the
  Buy/Sell toggle, D43), amber for "not yet, N days left" (same family as
  the drift-threshold badge), gray for "can't tell yet" (RMF, no birth
  date), paired with a link to `/settings` in that last case. The
  original ask's own example text used green for "met," but its very next
  sentence explicitly said not to reuse P&L green/red and pointed at the
  drift badge's treatment instead — resolved in favor of the explicit
  correction over the illustrative example; flagged for DECISIONS.md.
- **Fixed a real CSS bug found during live testing**: the transaction
  table's type cell used `className="... capitalize"` at the `<td>`
  level (meant only to capitalize "buy"/"sell") — since the new badge and
  its "Enter birth date..." link render inside that same cell, the
  `capitalize` transform was cascading into them too, rendering "1822d
  Until Holding Period Met" and "Enter Birth Date To Check The Age
  Condition" instead of natural sentence case. Fixed by moving
  `capitalize` onto a `<span>` wrapping just the type text.
- Verified live, carefully, since real assets all currently have
  `tax_bucket = 'normal'`: confirmed no badge appears on any real
  transaction row (correct — nothing to show). With the user's explicit
  permission (asked first, per the new CLAUDE.md rule), temporarily set
  one real asset's (`B-BHARATA`) `tax_bucket` to `RMF` via the existing
  `/assets` edit form, confirmed the badge renders correctly (gray "1822d
  until holding period met" + the birth-date link, since holding isn't
  met and age is unknown), screenshotted it, then reverted the asset back
  to `normal` immediately after and confirmed the revert took — zero
  lasting change to real data. SSF/ThaiESG paths (simpler — no age
  branch) were verified via the already-passing unit tests and code
  review only, not an additional live change.
- ARCHITECTURE.md, DESIGN.md, ROADMAP.md, migrations/README.md updated:
  new "RMF/SSF/ThaiESG holding-period tracking" architecture section, a
  DESIGN.md Components entry for the badge's color scheme, Phase 5 marked
  in progress with the holding-period slice done (live price APIs still
  open), and the new migration listed.
- Design decisions to consider logging in DECISIONS.md (not yet saved):
  (1) resolved the ask's internal contradiction (example said green for
  "met," the very next clause said don't reuse P&L green/red) by
  following the explicit correction — blue for "met," not green;
  (2) holding-period rules evaluated per individual buy lot, not per
  asset as a whole, since each purchase has its own 5/10-year clock under
  the real tax rules; (3) `ageConditionMet: null` (unknown) rather than
  guessing when birth_date is missing, with the UI branching on that
  explicitly rather than folding it into a 3rd status enum value;
  (4) no test framework added — validated via an ad-hoc script, same as
  XIRR.

## 2026-07-08 — Fix: unpriced holdings showed "฿0.00" for P&L instead of "—" (misleading, not just cosmetic)
- **Bug**: `holdings`/`holdings_with_returns` correctly return `null` for
  `unrealized_pnl`/`total_return` (and their `%`) when `last_price` is
  null — the SQL views can't compute market value or P&L without a
  price, so they say so. But `holdings/page.tsx` was coercing those with
  `Number(h.unrealized_pnl ?? 0)`, turning a real "unknown" into a false
  "exactly zero" — indistinguishable from an asset that's genuinely
  flat. `Last Price`/`Market Value` already correctly showed "—" for the
  same rows; P&L just hadn't gotten the same treatment.
- **Fix**: `pnl`/`totalRet` now preserve `null` instead of defaulting to
  0, and the table renders "—" (no color, no `%`) for both cells when
  null — matching the existing `Last Price`/`Market Value` pattern
  exactly. `Dividends` is untouched — `net_dividends` doesn't depend on
  price at all, so a real "no dividends" is still correctly `฿0.00`, not
  affected by this bug.
- **Summary cards** (Total market value / Unrealized P&L / Total
  Return): these are running sums across all holdings, and an unpriced
  holding still contributes `0` to each (there's no better number to add
  for "unknown"). Rather than silently understating the totals with no
  indication, added a new disclosure note above the summary cards —
  shown only when at least one holding lacks a price — stating the count
  and that the totals below may not include its/their value, with a link
  to `/prices`. Considered excluding the unpriced holding from the sums
  entirely instead, but that would make `Total market value` and `Total
  cost basis` inconsistent with each other for that same holding (cost
  basis is always known; market value wouldn't be) in a way that's
  harder to explain than a plain disclosure — flagged for DECISIONS.md.
- Verified live, with the user's explicit permission (asked first): all
  8 real holdings currently have prices, so created one throwaway asset
  (`TESTNOPRICE1`) with a single buy and no `prices` row (buying doesn't
  create one — only `/prices` or the crypto refresh does), confirmed
  `Last Price`/`Market Value`/`Unrealized P&L`/`Total Return` all show
  "—" while `Dividends` correctly still shows `฿0.00`, and the new
  disclosure banner appeared with the right count and link. Caught and
  fixed a real copy bug along the way: the banner initially rendered as
  "1 assetdon't have a price yet" (a missing space from JSX splitting the
  sentence across multiple adjacent `{expr} text` children) — rebuilt as
  a single template-literal string instead of relying on JSX's per-child
  whitespace handling, and fixed "1 asset don't" → "1 asset doesn't"
  (singular/plural verb agreement) while at it. Re-verified after the
  fix, then deleted the test transaction and test asset via the app's
  own delete features — confirmed zero residual test data and the
  banner disappearing again once the unpriced holding was gone.
- Design decision to consider logging in DECISIONS.md (not yet saved):
  kept unpriced holdings contributing `0` to the portfolio-total sums
  (rather than excluding them) paired with a visible disclosure banner,
  since exclusion would make the market-value and cost-basis totals
  inconsistent for that holding in a more confusing way than a plain
  "N assets don't have a price yet" note.

## 2026-07-08 — Tax-holding badge becomes a compact icon+tooltip; new sell-time tax warning
- **`TaxHoldingBadge` rebuilt as a small icon, not a full-width pill**:
  now sits next to the edit/delete icons on each RMF/SSF/ThaiESG buy row
  in `HistoryModal`'s Transactions tab, instead of taking its own line
  under the row. Hovering shows a tooltip with the eligible date, time
  remaining (exact calendar years/months/days, not a rough days/365
  estimate), and status — same colors as before (blue = met, amber = not
  yet, gray = can't tell / no birth date on file).
  - **Found and fixed a real clipping bug**: the tooltip was initially
    built with `position: absolute`, anchored inside the icon. It never
    appeared — the Transactions list scrolls under `max-h-64
    overflow-y-auto`, which silently clips any absolutely-positioned
    child that extends outside its box, and the tooltip (opening upward)
    always did. Rebuilt using `position: fixed`, with the icon's own
    `getBoundingClientRect()` captured on hover to compute the tooltip's
    on-screen coordinates — `fixed` positioning escapes scrollable
    ancestors entirely, since it's relative to the viewport. Also moved
    the tooltip to open *below* the icon rather than above, after noticing
    it could overlap the tab buttons when a row sits near the top of a
    short list.
  - The "no birth date" (RMF, unknown age) case no longer renders a
    separate `<Link>` below a pill — the icon itself is now directly
    clickable to `/settings` (via `useRouter().push()`, since a
    hover-only tooltip can't reliably also hold a clickable link).
- **New sell-time tax warning** in `TransactionModal`: selling a
  non-`normal`-bucket asset now checks every buy lot for that asset (not
  just one) via the existing `computeTaxHoldingStatus()` — no new
  eligibility logic was written, per the ask. If any lot isn't fully
  eligible, the existing preview/confirm dialog (same one that already
  shows the oversell warning) gets an appended line, e.g. "1 RMF lot of
  X hasn't met the holding-period condition yet (not eligible until
  ...). Selling now may require repaying the tax benefit already
  claimed." **Warns, doesn't block** — same D44 philosophy as the
  oversell check.
  - This app doesn't track which specific lot a sale draws from (no
    per-lot FIFO allocation exists anywhere in the codebase), so the
    check is intentionally conservative: it reports the single latest
    ("most restrictive") not-yet-eligible date across *all* flagged
    lots — preferring the age-55 date over the holding-period date when
    both apply and age is later, since that's the true binding
    constraint once both conditions are considered together.
- Verified live, with the user's explicit permission (asked again this
  round, per CLAUDE.md — separate from the earlier badge-redesign
  permission): temporarily set `B-BHARATA` to `RMF`, confirmed the
  compact icon appears next to edit/delete, confirmed the hover tooltip
  text and positioning (first attempt showed nothing at all — the
  clipping bug above, caught by this same live test), opened "+ Add
  transaction," selected Sell for that asset, confirmed the preview
  dialog shows the tax warning with an accurate date, then **cancelled**
  rather than confirming (no sell was actually recorded). Reverted the
  asset back to `normal` afterward each time.
  - **Caught a real test-hygiene slip along the way**: one verification
    script crashed mid-run, before reaching its own revert step, leaving
    `B-BHARATA` set to `RMF` in the live database. Caught this on the
    very next check (rather than assuming a prior "reverted: yes" log was
    still accurate) and fixed it immediately with a dedicated
    check-and-revert script before continuing.
- ARCHITECTURE.md and DESIGN.md updated: the tax-holding-period section
  now describes the icon+tooltip (not pill) presentation, the `fixed`-
  positioning fix and why, and the new sell-time warning's per-lot,
  most-restrictive-date logic.
- Design decisions to consider logging in DECISIONS.md (not yet saved):
  (1) sell-time warning checks *every* buy lot and reports the most
  restrictive date, rather than building per-lot FIFO sale allocation
  (out of scope per the ask, which said to reuse existing logic as-is);
  (2) tooltip uses `position: fixed` with hover-time JS positioning
  instead of a CSS-only `absolute` tooltip, specifically to escape the
  Transactions list's scroll container.

## 2026-07-08 — Renamed "Market Value" to "Current Value" (Holdings table + summary card)
- Wording-only change, no calculation logic touched — still `quantity ×
  last_price` exactly as before. Renamed in both places this term
  appeared as a user-facing label on the Holdings page: the table's
  column header (`Market Value` → `Current Value`) and the summary card
  (`Total market value` → `Total current value`), so the two stay
  consistent with each other.
- Also updated `AllocationDonut`'s empty-state message ("No holdings
  with a market value yet" → "...a current value yet") for the same
  reason — it uses the identical underlying `market_value` figures, so
  leaving it worded differently would have reintroduced the exact
  inconsistency this task was asked to fix.
- Left `ARCHITECTURE.md` and a `holdings/page.tsx` code comment
  referencing "market value" unchanged — those describe the underlying
  `holdings` view's actual `market_value` column/field, which is a
  schema/data-layer name, not a UI label, and isn't part of this rename.
  `CHANGELOG.md`/`DECISIONS.md` entries that used the old wording were
  also left as-is, since both are append-only historical logs, not
  living documentation.
- Verified live: confirmed both "CURRENT VALUE" (table header) and
  "TOTAL CURRENT VALUE" (summary card) render correctly, and confirmed
  no leftover "MARKET VALUE" text remains anywhere on the page. Read-only

## 2026-07-08 — Fixed: selected portfolio no longer resets when switching tabs
- **Bug**: Holdings/Targets/Rebalancing each kept "which portfolio is
  selected" as independent local state (inside `usePortfolios()`, driven
  by a `<select>` dropdown). Switching tabs via the nav bar always
  remounted the page fresh, silently resetting the selection back to
  the first portfolio.
- **Fix**: `usePortfolios()` (`src/lib/hooks/usePortfolios.ts`) rewritten
  so the selected portfolio lives in the URL (`?portfolio=<id>`) instead
  of local state — the URL is now the single source of truth, so it
  survives navigation between tabs. `setSelectedId` no longer exists in
  the hook's return value (there's no dropdown left to drive it).
  - No `?portfolio=` in the URL at all, or one that doesn't match a real
    portfolio (stale bookmark, typed URL): still falls back to the first
    portfolio, exactly as before — the URL is then synced to match via
    `router.replace()` (not `push`, so this doesn't add a back-button
    history entry).
- **Dropdown removed** from Holdings/Targets/Rebalancing, replaced with
  a new `PortfolioLabel` component (`src/components/PortfolioLabel.tsx`)
  — plain text showing the portfolio name plus a "Switch portfolio" link
  back to Overview (`/`), since switching now only happens from there.
  Deleted `PortfolioPicker.tsx` (fully unused once all 3 pages migrated).
- **NavBar** (`src/components/NavBar.tsx`) now reads the current
  `?portfolio=` value via `useSearchParams()` and appends it to the
  Holdings/Targets/Rebalancing/Prices links specifically (not
  Assets/Settings, which aren't portfolio-scoped) — so switching tabs
  carries the id forward instead of just linking to the bare path.
  Also fixed the two in-page links that pointed to another
  portfolio-scoped page without the id: Holdings' drift-alert banner
  ("View Rebalancing") and its unpriced-holdings banner ("Add prices").
  Overview's own portfolio cards already linked with `?portfolio=`
  correctly and needed no change.
- **Prices is not actually portfolio-scoped** — it operates globally
  over all assets/prices, with no `usePortfolios()` call and no
  per-portfolio filtering anywhere in its logic, despite being named
  as one of the 4 affected pages. Left its page logic untouched; its
  NavBar link still carries `?portfolio=` forward for consistency (in
  case the user detours through Prices and back), even though the page
  itself ignores it.
- Transitive Next.js constraint: since `usePortfolios()` now calls
  `useSearchParams()` internally, every page using the hook needs a
  `<Suspense>` boundary (a Next.js build-time requirement, not a real
  runtime suspension) — added to Targets and Rebalancing (Holdings
  already had one from an earlier round). NavBar itself now also calls
  `useSearchParams()` and is rendered by the root layout for every
  route, so `src/app/layout.tsx` now wraps `<NavBar />` in
  `<Suspense fallback={null}>` as well.
- Verified live with Playwright against the dev server (read-only
  navigation, no data changes): landing on `/holdings` with no
  `?portfolio=` correctly defaults to the first portfolio and syncs the
  URL, without redirecting to `/`; clicking Targets → Rebalancing →
  Prices → Holdings via the nav bar keeps the same portfolio id in the
  URL at every step; clicking a different portfolio's card on Overview
  and then clicking through the same tabs correctly carries *that*
  portfolio's id instead; "Switch portfolio" correctly returns to `/`;
  no `<select>` remains on any of the 3 pages.
- Design decisions worth logging in DECISIONS.md (not yet saved):
  (1) removing `setSelectedId` entirely from `usePortfolios()`'s public
  API now that there's no dropdown to drive it; (2) using
  `router.replace()` rather than `push()` for the URL auto-correction,
  to avoid polluting browser history; (3) wrapping `<NavBar />` in
  `<Suspense>` at the root-layout level, since that's the only place
  it can be done given NavBar is rendered by every route's shared
  ancestor; (4) still forwarding `?portfolio=` to Prices' NavBar link
  despite Prices not consuming it, for cross-page consistency.
  check — no data touched.

## 2026-07-08 — Page headers enlarged; "Switch portfolio" becomes a pill button
- New shared `PageHeader` component (`src/components/PageHeader.tsx`) —
  title (`text-2xl` → `text-3xl`, still bold) and description (`text-sm`
  → `text-base`, same muted color) both sized up one step. Replaces the
  identical `<header><h1>...<p>...</p></header>` block that was
  previously duplicated across all 7 pages (Overview, Holdings, Targets,
  Rebalancing, Prices, Assets, Settings) — future header-style changes
  now happen in one place.
- `PortfolioLabel`'s "Switch portfolio" link (Holdings/Targets/
  Rebalancing) restyled from a plain underlined text link to a small
  pill button: rounded-full, soft shadow at rest, lift + stronger shadow
  on hover, press back down on click — same depth system as every other
  button in the app — plus a small swap-arrows icon, matching the
  existing icon convention (20x20 viewBox, `currentColor` stroke,
  `strokeWidth 1.75`, rounded caps, used by `WarningIcon` etc.).
- Verified live with Playwright: confirmed all 7 pages' `<h1>` now
  render at 30px/700 weight (up from the previous 24px); screenshotted
  the Holdings page header and the "Switch portfolio" button at rest
  and on hover to confirm the pill shape, icon, and lift/shadow read
  correctly against the dark theme. Read-only, no data touched.
- Design decisions worth logging in DECISIONS.md (not yet saved):
  (1) extracting `PageHeader` as a new shared component now that the
  exact same header markup existed in all 7 pages verbatim; (2) reusing
  the app's existing secondary-button depth treatment (soft shadow,
  hover-lift, press-down) for "Switch portfolio" rather than inventing a
  new button style, just switched to `rounded-full` for the pill shape.

## 2026-07-09 — Phase 7 step 1: login/signup UI + auth schema prep (RLS/data migration/route protection deliberately NOT done yet)
- **New migration, NOT yet applied to the live database**:
  `migrations/0007_add_auth_user_id.sql`. Adds the
  `portfolios.user_id → auth.users` foreign key (the `user_id` column
  itself already existed, unreferenced, since `0001_init.sql` —
  discovered while reading the schema; this migration only adds the FK,
  not a new column). Adds `user_settings.user_id` (nullable, unique)
  so settings can eventually move off today's single-row convention.
  Both stay nullable — not enforced `not null` until real data has been
  assigned an owner in a later step. RLS is NOT enabled by this
  migration. `assets`/`prices` untouched (shared across all users, per
  the existing plan).
- **New `/login` and `/signup` pages**, Supabase Auth built-in
  (email/password only, no OAuth). `signInWithPassword()` /
  `signUp()` via the existing publishable-key client — no server
  middleware. Signup shows a "check your email to confirm" message
  instead of redirecting when the Supabase project requires email
  confirmation (this one does) — `signUp()` returns no session in that
  case, so there's nothing to redirect with yet.
- **New shared `AuthCard`** component (`src/components/AuthCard.tsx`) —
  same card chrome as the app's existing modals (rounded-xl, border,
  `shadow-lg`), used by both new pages, instead of Supabase Auth UI's
  own prebuilt component (which ships its own theme, not this app's).
- **NavBar**: tracks session via `getSession()` +
  `onAuthStateChange()`; shows a "Log out" pill button when signed in
  (calls `signOut()`, redirects to `/`) or a plain "Log in" link when
  signed out. Portfolio tabs are hidden on `/login`/`/signup`, same
  reasoning as the existing Overview-page special case (no
  portfolio/user context on either).
- **Deliberately not done this round** (separate, riskier steps for
  later, per the explicit ask): RLS is still off; no existing data
  has been assigned a real `user_id`; no route protection or
  logged-out redirect exists anywhere — every page still behaves
  exactly as it did before this change, fully usable without logging
  in.
- Verified live with Playwright against the dev server: `/login` and
  `/signup` render with the correct card styling (screenshotted both);
  NavBar correctly hides portfolio tabs on both auth pages and shows
  "Log in" on Overview when signed out; a wrong-credentials login
  attempt shows Supabase's real inline error ("Invalid login
  credentials") without navigating away. A full signup→confirm→login
  round trip could not be completed in this session: Supabase rejected
  `@example.com` test addresses as invalid (its own built-in domain
  validation), and a follow-up attempt with a real-format address hit
  Supabase's email-send rate limit from the repeated test attempts.
  Confirmed no test user was actually created in either case (both
  attempts errored before an account was made), so nothing needed
  cleanup. Asked the user for permission before attempting any
  signup that would touch the live Supabase Auth database, per
  CLAUDE.md.
- ARCHITECTURE.md and ROADMAP.md updated: new "Auth (Phase 7, step 1)"
  section, `user_settings` data-model note updated to mention the new
  (unused-so-far) `user_id` column, and Phase 7 broken into its 4
  steps with step 1 marked done.
- Design decisions worth logging in DECISIONS.md (not yet saved): see
  the response for this round for the full list (FK `on delete`
  behavior choices, redirect-after-logout target, hiding nav tabs on
  auth pages, not adding a confirm-password field, reusing
  `AuthCard`/modal chrome instead of Supabase Auth UI).

## 2026-07-09 — Real-time password validation on /signup
- **New "Confirm password" field**, plus a live checklist under both
  password fields, re-evaluated on every keystroke (no waiting for
  submit): at least 12 characters, one uppercase letter, one number,
  one special character, and passwords matching. Pure rule logic
  extracted to `src/lib/passwordRules.ts` (`checkPasswordRules()` /
  `allPasswordRulesMet()`), following the same pattern as other pure
  domain functions in `src/lib/` (`xirr.ts`, `drift.ts`, etc.).
  "Special character" is deliberately any non-alphanumeric character,
  not a fixed allowlist — the ask gave `!@#$%^&*` as examples, not an
  exhaustive set.
- Each rule renders as its own line with a checkmark (met) or dot (not
  yet) — reuses `TaxHoldingBadge`'s blue-for-met/gray-for-not-yet
  treatment (D62), not green/red, consistent with DESIGN.md reserving
  that pair for P&L only.
- "Sign up" is disabled until every rule passes (including the match
  check) — also re-checked inside `handleSubmit` itself as a defensive
  guard, in case Enter-to-submit ever bypassed the disabled button.
- Confirmed this doesn't interfere with Supabase's own signup errors
  (duplicate email, rate limit, etc.) — the `error` state and the new
  checklist are fully independent; both can render in the same card at
  once.
- Verified live with Playwright against the dev server: screenshotted
  the empty, weak-password, mismatched-confirm, and all-rules-met
  states; confirmed the submit button's disabled state flips correctly
  at each stage; confirmed a real Supabase error ("email rate limit
  exceeded", still active from the previous round's testing) still
  renders correctly alongside the new checklist UI, unobstructed. No
  live signups were attempted this round (still rate-limited from
  before), so no cleanup was needed.
- Design decisions worth logging in DECISIONS.md (not yet saved): see
  the response for this round (checklist placement below both password
  fields rather than split per-field, special-character definition,
  reusing the TaxHoldingBadge color convention).

## 2026-07-10 — Prices page: pick assets from a dropdown instead of typing symbols, CSV paste kept as a second tab
- **New "Select from list" mode** (now the default tab): one row per
  asset, each using the same search-then-pick combobox pattern as
  `TransactionModal`'s asset picker (without "add new asset" — Prices
  only sets prices for assets that already exist). "+ Add another
  asset" appends more rows, so entering several prices in one batch
  still works exactly like before, just via picking instead of typing
  CSV lines.
- The picker excludes any asset with its own auto-refresh (BTC/ETH via
  CoinGecko) — picking one from the list to manually re-enter its price
  would just be redundant with the automated refresh — and excludes
  whatever's already picked in another row of the same batch, so the
  same asset can't accidentally get two different prices queued in one
  go.
- **`COINGECKO_IDS` extracted** to `src/lib/coingecko.ts` (with a new
  `hasAutoFetch()` helper) instead of living only inside
  `/api/refresh-crypto-prices/route.ts` — the Prices page needed the
  same mapping to know which assets to exclude, and the ask was
  explicit about not hardcoding it a second time. The route now imports
  from the shared file; behavior there is unchanged.
- **CSV paste kept, not removed** — moved to its own "Paste CSV" tab,
  unchanged in behavior (still one `symbol,price` line per asset,
  matched by symbol text). Both tabs feed the same preview → old
  price/new price/% diff table and the same `DIFF_WARNING_PCT` warning
  and confirm/save flow as before — only how the entries get built
  differs between the two tabs.
- Saved rows from the list-picker path are tagged `source: 'manual'`
  (vs. `'csv'` for pasted rows) in the `prices` table, to distinguish
  the two after the fact.
- Switching tabs clears any in-progress preview from the other mode,
  so a stale preview from CSV mode can't be confirmed while looking at
  the list-picker tab or vice versa.
- Fixed a real (if minor) bug found while screenshotting the new page
  header text: a literal space between `</code>` and the following word
  in a multi-line JSX fragment got silently dropped by JSX's whitespace
  collapsing, rendering "price</code>lines" with no space. Fixed with
  an explicit `{" "}`, the same technique this file's description text
  already used elsewhere for the same reason.
- Verified live with Playwright against the dev server (read-only —
  every check stopped at "Preview," never clicked "Confirm & save,"
  so nothing was written to the live `prices` table): confirmed
  BTC/ETH are absent from the picker's option list; confirmed picking
  an asset in row 1 removes it from row 2's options; confirmed the
  preview table and >30%-diff warning render correctly for a
  deliberately unrealistic price; confirmed the CSV tab still works
  unchanged; confirmed switching tabs clears the other tab's leftover
  preview; confirmed the header-text spacing fix.
- Design decisions worth logging in DECISIONS.md (not yet saved): (1)
  excluding auto-fetched assets from the picker entirely rather than
  allowing a manual override there too; (2) excluding already-picked
  assets from other rows' dropdowns in the same batch; (3) keeping
  CSV paste as a permanent second tab rather than removing it; (4)
  tagging list-picker saves as `source: 'manual'` vs. `'csv'` for
  pasted rows; (5) preferring exact `assetId` matching over symbol-text
  matching when an id is already known (list-picker path), leaving
  CSV-paste's existing symbol-text matching untouched.

## 2026-07-11 — Phase 7 step 2: route protection (live) + backfill/NOT NULL/RLS migrations (prepared, NOT applied)
- **Route protection is live in code as of this round** — every page
  except `/login`/`/signup` now requires a real session:
  - New `<RequireAuth>` (`src/components/RequireAuth.tsx`) wraps
    Overview, Holdings, Targets, Rebalancing, Prices, Assets, and
    Settings. Tracks the session the same way `NavBar` already does
    (`getSession()` + `onAuthStateChange()`); renders nothing while
    checking or once a logged-out visitor has been bounced;
    `router.replace()`s to `/login` if there's no session.
  - New `useRedirectIfAuthed()` (`src/lib/hooks/useRedirectIfAuthed.ts`)
    does the inverse on `/login`/`/signup` — an already-logged-in
    visitor gets sent to `/` instead of seeing the form.
  - Client-side only, no Next.js middleware — that would need a
    cookie-based session (`@supabase/ssr`) instead of this app's
    existing localStorage-based client session, a bigger architecture
    change than asked for. Means a brief blank render before the
    redirect fires, acceptable since RLS blocks the underlying data at
    the same time regardless.
  - **This takes effect immediately, independent of whether the
    migrations below have been applied** — the redirect only checks
    "is there a session," not "does RLS allow this data." A real login
    is now required to use the app at all, including in dev.
- **Two existing insert call sites patched** so they keep working once
  `portfolios.user_id` is `not null` and RLS is on (otherwise either
  would violate the not-null constraint or insert a row invisible to
  everyone under RLS): `NewPortfolioModal` now sets `user_id` from the
  current session; the Settings page's insert-a-fresh-row fallback (no
  existing `user_settings` row yet) does the same. No other insert/
  update/select call site needed changes — RLS filters transparently
  at the database layer, so the app never needed its own
  `.eq("user_id", ...)` filters.
- **Three new migrations, NOT applied to the live database** (per an
  explicit instruction — prepared and reviewed here first):
  - `migrations/0008_backfill_owner_user_id.sql` — assigns every
    existing `portfolios`/`user_settings` row to the one real
    `auth.users` account. Includes a safety check that fails loudly if
    `auth.users` doesn't have exactly one row (rather than silently
    mis-assigning data to the wrong owner), plus a commented-out manual
    alternative (hardcode the UUID from Supabase Dashboard →
    Authentication → Users) for when that assumption doesn't hold.
  - `migrations/0009_portfolios_user_id_not_null.sql` — makes
    `portfolios.user_id not null`. Deliberately its own file (not
    combined with 0008's data update), so an incomplete backfill fails
    loudly here instead of compounding with the data migration in the
    same transaction. `user_settings.user_id` deliberately stays
    nullable — only `portfolios.user_id` was asked to become `not
    null` this round.
  - `migrations/0010_enable_rls.sql` — enables RLS on
    `portfolios`/`user_settings` (direct `auth.uid() = user_id` check)
    and `transactions`/`targets`/`portfolio_snapshots` (indirect check
    via a scalar subquery to `portfolios.user_id`, since none of those
    three tables has its own `user_id` column). `assets`/`prices`
    intentionally excluded — still shared across all users.
  - `migrations/README.md` updated with all three entries.
- Verified live with Playwright (read-only, no DB writes, no migration
  applied): confirmed all 7 protected pages redirect a logged-out
  visitor straight to `/login`; confirmed `/login` and `/signup`
  themselves don't redirect while logged out; screenshotted the
  `/holdings` → `/login` redirect to confirm no flash of broken/empty
  content along the way.
- **Not done this round, and deliberately so per an explicit
  instruction**: none of 0008/0009/0010 have been run against the live
  database. The critical remaining check — logging in with the real
  account and confirming every portfolio's full data (holdings,
  transactions, targets, snapshots) is still visible after RLS is on —
  requires actually applying these migrations first, which needs your
  own confirmation before proceeding.
- ARCHITECTURE.md updated: reworked the Auth section, added "Route
  protection" and "Backfilling existing data to a real owner +
  enabling RLS" sections describing exactly what's live vs. prepared.
  ROADMAP.md's Phase 7 updated to reflect step 2's actual state (code
  live, migrations prepared but not applied) instead of the old
  step-2/3/4 breakdown.
- Design decisions worth logging in DECISIONS.md (not yet saved): see
  the response for this round (client-side `<RequireAuth>` instead of
  Next.js middleware; the `auth.users` safety-check-then-backfill
  approach vs. a hardcoded UUID; keeping 0008/0009/0010 as three
  separate files; leaving `user_settings.user_id` nullable while
  `portfolios.user_id` becomes `not null`).

## 2026-07-11 — Phase 7 step 2 confirmed complete: migrations 0008–0010 applied, RLS verified
- Migrations 0008 (backfill), 0009 (`portfolios.user_id not null`), and
  0010 (enable RLS) have now been applied to the live database and
  confirmed: logging in with the real account shows every portfolio's
  full data (holdings, transactions, targets, snapshots) intact — RLS
  isn't hiding anything that should be visible.
  ARCHITECTURE.md's "Supabase & security" section corrected — it still
  said "RLS is OFF now... enable it when auth is added," which was no
  longer true. Updated it plus the "Route protection" and "Backfilling
  existing data..." sections (both still said "not yet applied"),
  `migrations/README.md`, and `ROADMAP.md`'s Phase 7 (now marked done)
  for consistency, since leaving them contradicting each other would
  have been stale documentation, not just an unrelated line.

## 2026-07-11 — Forgot/reset password flow (Supabase Auth built-in, no custom email)
- New `/forgot-password` page: single email field, calls
  `supabase.auth.resetPasswordForEmail(email, { redirectTo:
  `${origin}/reset-password` })`. Always shows the same "If an account
  exists for this email, a reset link has been sent." message on
  success — this holds automatically without any extra logic, since
  Supabase's own API already doesn't distinguish "email has an
  account" from "email doesn't" on success; a genuine API error (rate
  limit, etc.) still shows through, since that applies regardless of
  which email was submitted and so doesn't leak anything about a
  specific account.
- New `/reset-password` page, reachable only via the emailed link:
  Supabase's client auto-detects the link's token on load
  (`detectSessionInUrl`, on by default) and turns it into a short-lived
  recovery session. The page checks `getSession()` plus an
  `onAuthStateChange` listener for the `PASSWORD_RECOVERY` event to
  tell a real reset link apart from someone navigating to the URL
  directly with no token — the latter shows a plain "This password
  reset link is invalid or has expired" message with a link back to
  `/forgot-password`, never a raw Supabase error.
  - New password + confirm password fields, reusing `/signup`'s
    checklist exactly: same rules (`src/lib/passwordRules.ts`,
    unchanged), same checkmark/dot UI — extracted the list rendering
    itself into a new shared `src/components/PasswordChecklist.tsx`
    (used by both `/signup`, refactored to drop its own inline copy,
    and the new page). Submit stays disabled until every rule passes,
    identical to signup.
  - On submit: `supabase.auth.updateUser({ password })`, then
    deliberately `signOut()`s before redirecting to
    `/login?reset=success` — without that sign-out, `/login`'s own
    `useRedirectIfAuthed()` would immediately bounce the
    still-logged-in-from-recovery user to `/` before they ever saw the
    success message, defeating the point of redirecting to `/login` at
    all.
  - Deliberately does **not** call `useRedirectIfAuthed()`, unlike
    every other auth page — arriving here via a real link legitimately
    creates a session, so that hook would immediately break the page
    by bouncing a valid recovery visit away.
- `/login` now has a "Forgot password?" link under the Log in button,
  and reads a one-time `?reset=success` param via
  `window.location.search` inside a plain `useEffect` (not
  `useSearchParams()`, which would need a `<Suspense>` boundary here
  for what's only ever a single read right after a fresh navigation,
  never reactive in-page query tracking) — shows it via the existing
  `Toast` component, then `router.replace("/login")` to strip the
  param from the URL.
- `NavBar`'s `isAuthPage` check extended to `/forgot-password` and
  `/reset-password` — same tab-hiding treatment as `/login`/`/signup`.
- Verified live with Playwright (read-only, no emails sent, no DB
  writes): `/login` shows the "Forgot password?" link and navigates to
  `/forgot-password` correctly (NavBar tabs hidden there too);
  `/reset-password` visited directly with no token shows the friendly
  "invalid or has expired" message and a working "Request a new link"
  button, not a raw error; `/login?reset=success` shows the toast and
  strips the query param from the URL. Could not test the full
  valid-link → set-new-password path end-to-end without triggering a
  real password-reset email to a real account, which wasn't attempted
  this round.
- ARCHITECTURE.md's Auth section updated with the full forgot/reset
  flow, the `PasswordChecklist` extraction, and the `signOut()`-before-
  redirect reasoning.
- Design decisions worth logging in DECISIONS.md (not yet saved): see
  the response for this round (extracting `PasswordChecklist` as a
  shared component now used in two places; signing out the recovery
  session before redirecting to `/login` rather than logging the user
  straight into `/`; using `window.location.search` instead of
  `useSearchParams()` on `/login` to avoid an unnecessary Suspense
  wrap; deliberately excluding `/reset-password` from
  `useRedirectIfAuthed()`).

## 2026-07-11 — Verified /forgot-password's redirectTo is already dynamic (no code change needed)
- Confirmed `resetPasswordForEmail`'s `redirectTo` already reads
  `window.location.origin` at request time (set this way when
  `/forgot-password` was first built) — resolves to
  `http://localhost:3000/reset-password` in dev and the real
  production domain automatically, with no hardcoded host anywhere
  (grepped the whole `src/` tree for "localhost" — zero matches) and
  no code change needed between environments.
- Documented in ARCHITECTURE.md that this is separate from, and not a
  substitute for, the Supabase Dashboard's own **Authentication → URL
  Configuration → Redirect URLs** allow-list — Supabase rejects/ignores
  any `redirectTo` value not listed there, regardless of how correct
  the app's own code is. Both
  `http://localhost:3000/reset-password` and the production URL need
  to be added there by hand — this is dashboard configuration, not
  something in this repo, so it can't be checked or fixed from code.

## 2026-07-12 — Rename portfolio from the Overview page
- Each portfolio card now has a small pencil icon next to its name
  (same icon path as Assets' edit icon) opening a new
  `EditPortfolioModal` (`src/components/EditPortfolioModal.tsx`) — a
  single "Portfolio name" field, prefilled with the current name, plus
  Save/Cancel. Same modal chrome as `NewPortfolioModal`/`EditAssetModal`
  (`rounded-xl border shadow-lg` card over a blurred backdrop) — no
  native `prompt()`/`confirm()`.
- Save does a direct `update` on `portfolios.name` only (`base_currency`
  untouched) — no schema change needed, the column already existed.
  Validation: trimmed name must be non-empty ("Enter a portfolio
  name." if blank). No duplicate-name check — portfolio name isn't a
  unique identifier anywhere in the schema, so two portfolios can
  legitimately share a name, matching the existing `portfolios` table
  design (no unique constraint on `name`).
- On success: closes the modal, shows a "Portfolio renamed." toast
  (matching the existing "Portfolio created." pattern), and reloads
  the Overview summaries so the new name appears immediately.
- **Nested-interactive-element handling**: since each entire portfolio
  card is itself a `<Link>` to that portfolio's Holdings page, the new
  pencil button's `onClick` calls `preventDefault()` and
  `stopPropagation()` so clicking it opens the rename modal instead of
  also navigating away — otherwise every click on the icon would have
  triggered the card's own link underneath it.
- DESIGN.md's "Portfolio Overview cards" entry updated to document the
  new pencil icon and the nested-interactive-element handling.
- Verified via `npm run lint` and `npm run build` (both clean). Could
  not verify the actual rename live via Playwright — Overview is
  behind `<RequireAuth>` (Phase 7), and I don't have login credentials
  for the real account, so this needs to be checked manually (see the
  response for this round for exact steps).
- Design decisions worth logging in DECISIONS.md (not yet saved): see
  the response for this round (nested button-in-anchor with
  `stopPropagation` instead of restructuring the whole card away from
  being a real `<Link>`; icon button sized `h-6 w-6` here vs. Assets'
  `h-7 w-7`, to fit inline next to compact card text; no duplicate-name
  check, matching the schema's existing lack of a uniqueness
  constraint on `portfolios.name`).