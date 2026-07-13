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
**Superseded by D32**: the UI mechanism changed from `window.confirm()` to a
custom `ConfirmDialog` component. The warn-don't-block philosophy here is
unchanged — only how it's presented changed.

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

## D32 — Replaced every `window.confirm()` with a custom `ConfirmDialog`, via a promise-based `useConfirm()` hook
Native browser dialogs don't match the app's dark-card/depth-button visual
language (DESIGN.md's Modals & dialogs section). A `useConfirm()` hook
returning `await confirm(message, options)` let every existing call site
swap in with minimal changes to the surrounding logic — no restructuring of
the checks that run before/after each confirmation. Supersedes D19 (same
warn-not-block behavior, different presentation).

## D33 — "+ Dividend" changed from text to an icon button
Consistency with the edit/delete icons already used in the same modal
system.

## D34 — Toasts are success-only; errors stay inline
A toast auto-dismisses after ~3s, which risks the user not reading it in
time — fine for a success confirmation, not for an error they need to act
on. Errors stay inline (don't disappear on their own) instead. Top-right
position and ~3s auto-dismiss were chosen as the common, expected pattern.

## D35 — `cash_value` computed via a separate `assets` query, not by extending `holdings`/`holdings_with_returns`
This lookup is only needed when saving a snapshot, not on every page load —
cheaper to keep the existing views untouched and query separately.

## D36 — Auto-snapshot doesn't run on the 60s silent crypto-refresh, only on initial load/portfolio switch
Limits how often the database gets checked/written while still achieving
the "once a day" goal in practice.

## D37 — Auto-snapshot checks-then-inserts; the manual button always upserts (overwrites)
Auto avoids unnecessary duplicate writes on repeat visits the same day. The
manual button signals clear user intent to update with the latest
intraday price.

## D38 — Portfolio cards are full-width horizontal rows, not a grid of tiles
Fits the left/right layout (icon + name on the left, value + badge on the
right) as designed.

## D39 — Same translucent blue wallet icon for every portfolio, no per-portfolio avatar colors
Portfolios have no distinguishing data to color by, unlike an asset's
symbol. Reuses the existing accent color from the nav pill/badge instead of
introducing a new color system.

## D40 — Overview card badge shows Total Return % (incl. dividends), not Unrealized P&L %
The more complete at-a-glance summary figure for a quick overview.

## D41 — No % badge on a portfolio with zero holdings
Avoids showing a meaningless 0%/NaN — just the value and holdings count.

## D42 — "Tracker" wordmark's neon glow stays in the existing blue accent family, not a new cyan/neon color
Keeps the app's single-accent-color rule intact, even though this is the
first glow outside the previously-defined chart/badge scope — widens that
scope to include the wordmark. Done via layered `text-shadow`, not a
`drop-shadow` filter, for better control over the glow radius on text.

## D43 — Buy/Sell toggle is neutral blue, not green/red
Green/red is reserved for P&L only per DESIGN.md, even though Buy/Sell
might intuitively seem to fit that color pairing.

## D44 — Selling more than currently held warns in the preview dialog, doesn't hard-block
The on-file holding can legitimately be out of sync with the real broker
for other reasons (e.g. older transactions not fully entered yet) — the
user should be able to decide for themselves.

## D45 — "Add new asset" expands inline in the same form, not a nested modal
Matches the literal instruction, and avoids the complexity of stacking one
modal on top of another.

## D46 — Asset-creation logic extracted to `src/lib/assets.ts`, shared between `NewAssetModal` and the transaction form
Reduces duplication — both places need the exact same logic.

## D47 — Symbol shown disabled, not hidden, in the asset edit form
Keeps visible context of which asset is being edited, while making clear
it can't be changed (it's the primary identifier).

## D48 — Asset update logic written inline in `EditAssetModal`, not extracted to `src/lib/assets.ts`
Only one call site right now, unlike `createAsset()` which is shared
between two. Not worth extracting until a second consumer exists.

## D49 — Deleted `NewAssetModal.tsx` entirely instead of just unlinking it
Confirmed zero remaining consumers — genuine dead code. Deleting it
outright avoids leaving confusing unused files around for later.

## D50 — Symbol is now editable in the asset edit form (supersedes D47)
A safe rename path now exists: a duplicate check before saving, plus a
clear warning that renaming doesn't affect transaction history, since
transactions reference the asset by internal id, not by symbol.

## D51 — "Can't delete" (asset has linked transactions) shows an info dialog explaining why, instead of hiding/disabling the delete button
The user should see a clear reason it's blocked, rather than a button
that does nothing with no explanation.

## D52 — Extracted `isSymbolTaken()` as a shared helper in `src/lib/assets.ts`
Used by both `createAsset()` and the edit form's rename check, so the
duplicate-symbol lookup logic isn't duplicated between the two.

## D53 — Transactions is the default tab in the History modal, not Dividends
This modal's main new purpose is viewing/editing transaction history.

## D54 — "Load more" re-queries with an expanding `.range()`, not per-page append
Simpler state, and the cost difference is negligible at this data scale.

## D55 — The negative-holding check always fetches the full transaction list, never relies on whatever page is currently paginated on screen
Prevents pagination from hiding a real risk that should be caught.

## D56 — `wouldCauseNegativeHolding()` extracted as a pure function in `src/lib/transactions.ts`
Separates the check's logic from the modal — easier to test and reuse.

## D57 — Allocation donut charts moved from a standalone `/allocation` page into the Holdings page (supersedes the earlier standalone-page choice)
Seeing portfolio allocation sitting right next to the table it summarizes
is more useful than a separate page for just two small charts.

## D58 — XIRR uses damped Newton-Raphson to prevent rate overshoot below -1
Found a real bug testing a -50%-loss-in-1-year case: the first step
jumped past the financially meaningful boundary. Fixed with standard
step-halving.

## D59 — XIRR's `minSpanDays` defaults to 30 days as the "too short to annualize" cutoff
Found with real data: transactions all within 4 days annualized to
+3,145,865% — mathematically correct but useless. Below 30 days, show
"not enough data" instead.

## D60 — XIRR cash flows come only from buy/sell/dividend transactions, not fee/deposit/withdraw/split
Matches the spec as literally given.

## D61 — No test framework added for `xirr()`; verified with an ad-hoc script instead
Consistent with how this session has verified everything else so far.

## D62 — TaxHoldingBadge uses blue for "conditions met," not green (resolves a self-contradicting spec)
The original ask specified both "green for conditions met" and "don't use
green/red — reserved for P&L," which conflict. Followed the more explicit
rule (no green/red) and used blue instead, matching the same precedent as
the Buy/Sell toggle (D43). Amber = not yet met, gray = can't be checked
(no birth date on file).

## D63 — Unpriced holdings still contribute 0 to portfolio totals (Total Market Value, etc.), with a banner instead of excluding them
Excluding an unpriced holding from the totals entirely would make Total
Market Value and Total Cost Basis inconsistent with each other (cost
basis is always known; market value isn't, without a price). That
inconsistency is more confusing than just disclosing directly, via a
banner, that some assets don't have a price yet and the totals may be
incomplete.

## D64 — `setSelectedId` removed entirely from `usePortfolios()`
There's no dropdown left to drive this state — the selected portfolio
now comes from the URL only.

## D65 — URL auto-correction uses `router.replace()`, not `push()`
Prevents the browser's back button from filling up with automatic
URL-correction history that the user never actually navigated to.

## D66 — `<NavBar>` wrapped in `<Suspense>` at the root layout
The only place this can be done, since NavBar is shared across every
route.

## D67 — Prices' NavBar link still carries `?portfolio=` even though the page ignores it
Keeps the URL consistent across pages; harmless since Prices already
ignores this query param.

## D68 — Extracted `PageHeader` as a new shared component
The exact same `<header><h1>...<p>...</p></header>` markup existed
verbatim in all 7 pages (Overview, Holdings, Targets, Rebalancing,
Prices, Assets, Settings) — worth a shared component so future
header-style changes happen in one place instead of 7.

## D69 — "Switch portfolio" reuses the existing secondary-button depth treatment, just `rounded-full`
Rather than inventing a new button style, it reuses the app's standard
soft-shadow/hover-lift/press-down button pattern already used
everywhere else, only changing the shape to a pill (`rounded-full`) to
read as a compact, secondary action next to the portfolio name.

## D70 — Benchmark comparison (SET/S&P 500) dropped from the roadmap, not built
S&P 500 has a genuine free API (FRED), but SET Index doesn't — the
official source is a paid service only. Building half the feature
(auto for S&P 500, manual entry for SET) would add code complexity
without enough benefit to justify it. Decided not to build this
feature at all.

## D71 — `portfolios.user_id` FK uses `on delete set null`, not `cascade`
Losing an auth user shouldn't delete real financial data along with
it, unlike ordinary supplementary data.

## D72 — `user_settings.user_id` FK uses `on delete cascade`
This is minor data (just a birth date) — fine for it to disappear
along with the user.

## D73 — Logout redirects to `/`, not `/login`
Nothing is actually gated yet, so `/` is the less confusing landing
spot.

## D74 — NavBar hides portfolio tabs on `/login` and `/signup`
Reuses the same logic as the existing Overview-page special case.

## D75 — No confirm-password field on signup, no OAuth
Followed the given scope exactly, without building beyond it.
(Confirm-password superseded by D76 once real-time validation was added.)

## D76 — Password checklist is one combined list below both password fields, not split per-field (supersedes D75's no-confirm-password part)
Easier to scan in one place, and keeps a single source of truth for
"can I submit yet."

## D77 — "Special character" means any non-alphanumeric character, not a fixed allowlist
The `!@#$%^&*` examples in the ask were just examples, not an
exhaustive list.

## D78 — Reused TaxHoldingBadge's blue/gray colors for the checklist instead of inventing new ones
Keeps green/red reserved for P&L only, per DESIGN.md.

## D79 — Assets with auto-fetch (BTC/ETH) are excluded from the Prices picker entirely, no manual override
Avoids a confusing situation over which price "wins" between a manual
entry and the auto-refreshed one.

## D80 — An asset already picked in one row is excluded from other rows' dropdowns in the same batch
Prevents the same asset from being queued with two conflicting prices
at once.

## D81 — "Paste CSV" tab kept permanently, not removed
Supports users who prepare prices in a spreadsheet and want to paste
them in one go.

## D82 — List-picker saves are tagged `source: 'manual'`, CSV saves `source: 'csv'`
Keeps each row's price source distinguishable for later review.

## D83 — When the asset id is already known (list-picker), match by id directly instead of symbol text like the CSV path
Slightly more accurate. The CSV path has no id available up front, so
it still has to match by symbol text.

## D84 — Client-side `<RequireAuth>` component instead of Next.js middleware
Avoids a bigger architecture change (cookie-based session, a new
dependency) that wasn't asked for this round.

## D85 — 0008 checks that `auth.users` has exactly one row before auto-backfilling, with a manual UUID option as fallback
Safe when there's genuinely only one user, but won't silently
mis-assign data to the wrong owner if more than one account turns out
to exist.

## D86 — 0008/0009/0010 kept as three separate files, not combined
If one step fails, the error is clear and isolated instead of tangled
up with the others, making the cause harder to find.

## D87 — `user_settings.user_id` stays nullable while `portfolios.user_id` becomes not null
Deliberately asymmetric — matches exactly what was asked, not extended
any further.

## D88 — Extracted `PasswordChecklist` as a shared component
Now used in two places (signup, reset-password) — shouldn't duplicate
the same code.

## D89 — Sign out the recovery session before redirecting to `/login`, rather than logging straight into `/`
Without signing out first, `/login`'s own `useRedirectIfAuthed()`
would immediately bounce the user away before they ever saw the
success message.

## D90 — Use `window.location.search` instead of `useSearchParams()` on `/login`
Avoids an unnecessary Suspense wrap for what's only ever a one-time
read.

## D91 — Deliberately don't use `useRedirectIfAuthed()` on `/reset-password`
This page intentionally has a temporary session from the email link —
using that hook would immediately break the entire page.

## D92 — Portfolio card's edit button uses `stopPropagation`/`preventDefault` instead of restructuring the card out of its `<Link>`
Minimal diff, faster to ship — accepted the tradeoff of non-standard
HTML nesting (interactive inside interactive) for simplicity.

## D93 — Portfolio card's edit icon uses `h-6 w-6`, not Assets' `h-7 w-7`
Fits the card's more compact text area better.

## D94 — No duplicate-name check when renaming a portfolio
`portfolios.name` has never had a unique constraint in the schema —
consistent with existing behavior.

## D95 — Reused the existing `assets.market` column instead of a new column or hardcoded symbol list
`market` can now genuinely be set from Finnhub's `exchange` field —
more fitting than building something new.

## D96 — `'finnhub'` is a separate `prices.source` value, not shared with crypto's `'api'`
Keeps each price row's provider distinguishable for later review.

## D97 — Added currency auto-fill beyond what was asked (sector/country only)
Guards against the real risk of a foreign stock being mistagged with
THB currency, which would compound the existing multi-currency gap.

## D98 — A fully blank row is silently skipped, not an error
It's just a spare row the user left over, not a mistake.

## D99 — "+ Add new asset" is one shared sub-form used by all rows, not duplicated per row
Prevents N copies of the Finnhub search UI from appearing if there are
N rows — tracks which row triggered it as its target instead.

## D100 — A sell row's tax-holding check counts buy lots from the same batch, not just the database
Matches the same reasoning as the oversell check — needs the whole
batch's picture, not just one row at a time.

## D101 — One combined confirm dialog with per-row numbering, instead of a separate dialog per row
Shows the whole batch at a glance, instead of clicking through one
dialog per row.

## D102 — Widened the modal to `max-w-2xl`
The original width was too narrow for the added per-row information.

## D103 — Hand-rolled `DatePicker`, no external library
Avoids a new dependency, consistent with `DonutChart`'s earlier
precedent of hand-rolling SVG instead.

## D104 — Year selection uses a number input, not a hundred-option dropdown
A long year dropdown is unwieldy — typing the year directly is faster.

## D105 — Reused the `TaxHoldingBadge` `position: fixed` + `getBoundingClientRect()` pattern
Same underlying problem (clipped by a modal's `overflow-y-auto`),
solved with the same approach already proven to work.

## D106 — No arrow-key navigation within the calendar grid
The text input already serves as the fast keyboard path — the
calendar itself is meant for mouse/touch use.

## D107 — Calendar month/weekday labels stay in English; only the typed format (DD/MM/YYYY) follows Thai convention
Keeps the scope appropriately sized — no need to translate the whole
calendar UI.
