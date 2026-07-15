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

## D108 — New `formatUnitPrice()`, separate from `formatMoney()`, specifically for per-unit prices (Avg Cost, Last Price, transaction Price)
A per-unit price (e.g. a NAV or share price) needs different
decimal-place handling than an aggregate total — the existing fixed
2dp rule for money values doesn't fit it the same way.

## D109 — Dividend amounts stay on `formatMoney()`, even though they're stored in the same `transactions.price` column as buy/sell prices
For a dividend row, `price` semantically means the gross total amount
received, not a per-unit price — matches the existing `dividend_income`
convention (`quantity = 1`, `price` = gross amount).

## D110 — `formatUnitPrice()` uses fixed 4 decimal places (rounding/padding as needed), not trimmed trailing zeros
The trim-trailing-zeros approach kept every decimal a raw/unrounded
stored or computed value happened to have, which made a messy DB
division result (e.g. a weighted-average cost) display with a long,
jagged decimal tail that read as broken rather than precise.

## D111 — Fixed `avg_cost` in the `holdings` view with a `WITH RECURSIVE` CTE, replacing the old aggregate `SUM()`
Confirmed real bug: the old formula computed the lifetime average
purchase price, not the cost of currently-held units, and was wrong
every time a buy happened after a prior sell. This is inherently
order-sensitive — it needs to replay the transaction history in
chronological order via a recursive CTE, not a plain aggregate.
Confirmed impact: `avg_cost`/`cost_basis`/`unrealized_pnl`/
`total_return` were affected; `quantity`/`market_value`/XIRR were not.

## D112 — `/api/finnhub-search` silently falls back to a `/quote` lookup when `/search` returns nothing, fired in parallel rather than after `/search` fails
Finnhub's `/search` index sometimes misses a real, valid ticker the
user already knows. Rather than surfacing that as "not found," the
route fires `/quote` alongside `/search` whenever the query is
ticker-shaped (no spaces, ≤5 chars) and, only if `/search` comes back
empty, checks whether `/quote` returned a live price (`c > 0`) to
confirm the symbol is real. Kept entirely server-side (per instruction)
so the client never learns two Finnhub endpoints are involved — it just
sees one more result, labeled "— verified via direct lookup" so the
user knows it wasn't a name/description match. Parallel, not
sequential, so a real ticker's request doesn't pay for two round-trips.

## D113 — Didn't chase a free API for ETF sector/country; show an advisory message and let the user fill it in manually instead
Tested both Finnhub (`/stock/profile2` has no ETF fundamentals) and FMP
(`/stable/etf-sector-weighting` returns empty even for SPY on the free
tier) — neither gives this data for free. This is an industry-wide
pattern: ETF-level analytics is usually a premium feature. Not worth
adding a 3rd API integration (Alpha Vantage), since it would likely hit
the same limitation.

## D114 — Crypto (BTC/ETH) search folded into a unified "Search asset" mode; Sector auto-filled from CoinGecko `categories`, filtered by a denylist regex
Renamed `TransactionModal`'s "Search stock (Finnhub)" mode to "Search
asset" — one result dropdown now mixes Finnhub stock matches with a
small, hardcoded crypto entry list (`CRYPTO_SEARCH_ENTRIES`, matched
instantly client-side, no API call). Confirmed via real test calls that
CoinGecko's `categories` field exists and needs no API key, but
`categories[0]` is not relevance-ranked and is full of non-sector noise
(fund/index/portfolio names); both BTC and ETH's first category was
also literally `"Smart Contract Platform"`, misleading for Bitcoin.
Chose a denylist regex (`/portfolio|index|holdings|ecosystem|fund/i`)
over a per-symbol override list or a manual-pick dropdown — cheap, no
maintenance list, accepted tradeoff that the residual first category
can still be an imperfect fit (confirmed post-fix: both BTC and ETH
still resolve to `"Smart Contract Platform"` after filtering — still
an improvement over the old hardcoded "Cryptocurrency", but not a
fully differentiated result). Search scope deliberately limited to
symbols already in `COINGECKO_IDS` (BTC, ETH), not the full CoinGecko
coin universe, so anything creatable this way automatically already
has price auto-refresh support — no second list to keep in sync.
Country stays hardcoded `"Global"` and Currency stays the form's THB
default; only Sector is fetched, via a new `GET /api/coingecko-profile`
route.

## D115 — Supersedes D20: dropped the hardcoded `COINGECKO_IDS` list in favor of an `assets.coingecko_id` column
D20's original reasoning ("hardcoded since only BTC is held right now")
no longer holds once crypto can be found and added for any coin in
CoinGecko via search — the mapping has to scale with however many
crypto assets exist, so it has to live in the database, per asset, not
as a static list in code.

## D116 — `coingecko_id` has a unique constraint
Prevents creating two asset rows pointed at the same coin, which would
make `/api/refresh-crypto-prices` double-update from a single price
fetch.

## D117 — Removed `COINGECKO_IDS`/`CRYPTO_SEARCH_ENTRIES` entirely rather than keeping either as a fallback
Nothing in the system should read from them once the migration is
applied — keeping them around unused would just be confusing dead code
to trip over later.

## D118 — Added a "CoinGecko ID" field to `EditAssetModal` (beyond what was asked)
Lets a legacy or manually-entered crypto asset be backfilled for
CoinGecko auto-refresh directly from the UI, instead of needing a
hand-written SQL `UPDATE` every time.

## D119 — Multi-currency step 1: no migration needed for `portfolios.base_currency`
Discovered it already exists (`0001_init.sql`, `char(3) not null default
'THB'`) and is already read throughout the app (`usePortfolios`,
Holdings, Rebalancing, Overview, `NewPortfolioModal`/`EditPortfolioModal`).
The ask to "add `base_currency` to `portfolios`" was based on a stale
assumption — nothing to do here, so `migrations/0014` only touches
`transactions`.

## D120 — New `transactions.fx_rate_to_base` column instead of reusing the existing (also pre-existing) `transactions.fx_rate`
`fx_rate` has existed since `0001_init.sql` but is dead code — never
read or written by any app code. It also can't serve the "not yet
backfilled" signal this feature needs: it's `not null default 1`, so
every existing row (including the real BABA/USD transactions this whole
effort is meant to fix) already carries a value of `1`, indistinguishable
from a genuine, verified 1:1 THB-to-THB rate. A new nullable column
(`fx_rate_to_base`) is added instead, so `NULL` means exactly one thing:
"no FX rate recorded yet." The old `fx_rate` column is left in place,
untouched — dropping unused-but-pre-existing columns is a separate
decision, not bundled into this schema-prep round.

## D121 — `src/lib/fx.ts` calls a new server-side `/api/fx-rate` route rather than hitting Frankfurter directly from the client
Frankfurter needs no API key, so there's no secret to protect here —
but routing through a Next.js API route keeps the external-call pattern
identical to the existing Finnhub integration (`/api/finnhub-search`,
`/api/finnhub-profile`, `/api/refresh-stock-prices`), and leaves room to
add caching or rate-limiting centrally later without touching every call
site. The same-currency (`from === to`) short-circuit lives in
`src/lib/fx.ts` itself, so the common case (THB transaction in a
THB-base portfolio) never even reaches the network.

## D122 — FX rates are fetched only after the user confirms the batch, not while they're still editing rows
**Superseded by D127**: this whole per-transaction `fx_rate_to_base`-capture
approach (D122-D126) was reverted one round later — real usage doesn't
exchange currency on the same day as the stock trade, so a trade-date
rate wasn't actually the right number to capture. Kept below for the
historical record of what was tried and why it didn't fit; see D127.

`TransactionModal`'s existing flow already builds a confirm-dialog
preview (oversell/tax-holding warnings) before anything touches the
database. Fetching `fx_rate_to_base` earlier — e.g. live per-row as the
user types — would fire a Frankfurter round-trip per keystroke-adjacent
edit and burn API calls on rows that get cancelled or edited further.
Fetching it right after confirm, immediately before the insert, means a
cancelled batch never costs a single FX lookup.

## D123 — Batch rows fetch FX rates independently, in parallel, with no dedup for repeated (currency, date) pairs
Matches the literal ask: each row may be a different asset/currency/date,
so each gets its own `getFxRate()` call via `Promise.allSettled` (not
`Promise.all`, so one failing row's error doesn't hide the others' results
— every failing row gets reported, not just the first). Two rows that
happen to share the same currency and date do issue two Frankfurter
calls rather than one cached lookup — deduping would add real complexity
(a cache keyed on currency+date, invalidation once the batch changes) for
a case (multiple foreign-currency rows on the same day, same batch) that's
rare in a personal portfolio. Revisit only if this turns out to matter in
practice.

## D124 — Editing an existing transaction/dividend does NOT recompute `fx_rate_to_base`, even if `trade_date` changes
Scoped deliberately to match the ask ("record it correctly starting at
creation," not "keep it correct forever"). `HistoryModal`'s edit-buy/sell
form (`handleTxnSubmit`) and edit-dividend form (`handleDividendSubmit`'s
`editingDividendId` branch) both leave `fx_rate_to_base` untouched on
`.update()`. **Known gap**: editing a foreign-currency transaction's
`trade_date` after the fact leaves its `fx_rate_to_base` stale (still
tied to the original date), which is a smaller, narrower version of the
exact staleness bug this whole feature exists to fix. Not addressed this
round — flagged here so it isn't mistaken for an oversight later; revisit
when edit-time FX recomputation is explicitly asked for.

## D125 — No fallback to `1` when a Frankfurter lookup fails; the whole batch is blocked instead
A silent fallback would reproduce the exact bug that motivated this
feature (the old `transactions.fx_rate` column's `not null default 1`
making every foreign-currency row look like a verified 1:1 rate — see
`migrations/0014`). Both `TransactionModal` (batch buy/sell) and
`HistoryModal` (new dividend) surface a specific per-row error naming the
currency pair and date, and refuse to insert until the lookup succeeds.

## D126 — Two-stage saving indicator ("Fetching exchange rates…" → "Saving…") instead of a single generic "Saving…"
A Frankfurter round-trip (~1-2s) is a materially different wait than the
Supabase insert that follows it. Collapsing both into one "Saving…" label
would look like a stall with no explanation, especially for a
multi-row batch triggering several sequential-looking Frankfurter calls.
`TransactionModal.savingStage` and `HistoryModal.savingDividendStage`
(`"fx" | "insert" | null`) drive both the button label and the disabled
state, replacing what used to be a plain boolean in each.

## D127 — Multi-currency: convert only at portfolio-total display time, using TODAY's rate — not at transaction creation time, using the trade-date rate (supersedes D122-D126)
**Why the change of mind**: D122-D126's approach assumed the FX rate
that matters for a foreign-currency purchase is the rate on the trade's
own `trade_date`. Real usage doesn't work that way — someone typically
exchanges a chunk of THB into USD once, holds that USD balance, and buys
foreign stocks out of it over time on dates that have nothing to do with
when the exchange happened. A `trade_date` FX rate would be a real,
verifiable number, but not the number that's actually true for the
user's own cash flow — capturing it at creation added API calls,
blocking-error UX, and a whole `fx_rate_to_base`-per-transaction data
model for a figure that doesn't represent reality any better than not
having it. Converting only at the moment a portfolio *total* is
displayed, using today's rate, is honest about being a live
mark-to-market approximation rather than pretending to be a precise
historical record — and it's simpler: no new data captured on write, no
risk of a batch insert being blocked by a flaky FX API. `TransactionModal`
and `HistoryModal` are reverted to their pre-D122 state (plain price in
the asset's own currency, no FX involved at write time at all).

## D128 — `transactions.fx_rate_to_base` (migration 0014) is kept, unused, rather than dropped
The column is harmless — nullable, no default, nothing reads or writes
it now that D127 reverted the write path. Dropping it and potentially
re-adding something similar later would be more migration churn than
leaving one unused nullable column in place. Revisit only if a future,
genuinely different feature needs it (e.g. an explicit "currency
exchange" transaction type, or a deliberate historical-cost-basis-in-
base-currency project) — same "leave it, note it, don't chase it" call
already made for the older, also-unused `fx_rate` column (D120).

## D129 — New `getFxRatesForPairs()` helper in `src/lib/fx.ts`, shared by Holdings and Overview
Both pages need the exact same behavior: given a list of (asset currency,
portfolio base currency) pairs, dedupe to one `getFxRate()` call per
distinct pair (e.g. five USD holdings in one THB portfolio cost one
Frankfurter round-trip, not five — two portfolios both holding USD
against a THB base still only cost one, since Overview collects pairs
across all portfolios before fetching), and report which pairs failed
instead of throwing, so a caller can total up what it can. Written once
and imported by both rather than duplicated.

## D130 — A holding whose currency's FX rate couldn't be fetched contributes 0 to totals, disclosed rather than silently dropped or blocking the page
Same "show what's known, disclose what isn't" precedent as D63's
unpriced-holdings handling — a total that's honestly incomplete and says
so beats no total at all, and nothing destructive happens if a total is
briefly off after a network hiccup. The disclosure mechanism differs by
page density: Holdings gets a full banner (matching the existing
unpriced-holdings banner exactly, same InfoIcon/style); Overview's
compact card list gets a smaller inline note (`· FX rate unavailable for
N`) next to the holdings count instead of a new banner component, since
a full banner per card would be disproportionate to the card's size.
`convertToBase()` (Holdings) and its Overview equivalent both return
`null` (not `0`) for "couldn't convert," and callers add `?? 0`
explicitly only at the point they sum — keeps the "unknown" vs. "known
to be zero" distinction visible in the count, per GOTCHAS.md #6.

## D131 — XIRR's mixed-currency inaccuracy is documented as a known limitation this round, not fixed
Fixing it properly would mean converting every historical cash flow at
its OWN trade-date rate — exactly the trade-date-FX-capture complexity
D127 just decided against for the ledger itself (or refetching a
historical rate live on every XIRR computation, which is its own can of
worms). Out of scope for this round. Flagged two ways: a code comment on
`loadXirr()` in `holdings/page.tsx` explaining the gap, and a "· approx."
suffix appended to the "Annualized Return (XIRR)" `SummaryCard` label
whenever the selected portfolio holds more than one currency — so the
number isn't presented as more precise than it actually is, without
building a fix nobody asked for yet.

## D132 — Multi-currency breakdown lines use the currency CODE after the amount ("15.00 HKD"), not a symbol before it
Every other money display in the app puts a symbol first (`formatMoney`,
`฿12,450.00`), which works when exactly one currency is in view. A
breakdown line can list several different currencies in the same short
string (`"15.00 HKD + 30.00 USD"`), where symbols alone would be
ambiguous or visually indistinguishable (e.g. "$" is used by more than
one currency) — the ISO code disambiguates unambiguously. New
`formatCurrencyBreakdown()` in `src/lib/format.ts` is deliberately
separate from `formatMoney()` rather than a mode/flag on it, since the
two are formatting genuinely different things (one value in a known
currency vs. several values whose currencies are the point).

## D133 — `SummaryCard` gets a new `subLine` prop, distinct from the existing `suffix`
`suffix` already existed for an inline same-line addition (e.g. the P&L
`%` next to the value). The currency breakdown needed a full line BELOW
the value instead — stacking, not inlining, matches DESIGN.md's existing
"composite value + its detail render as stacked lines, not one long
inline string" precedent (Responsive section) and the table's own
value+%/value+sub-value pattern already used for Unrealized P&L/Total
Return. Reused the muted small-text treatment already established for
those table sub-lines (`text-[10px] text-gray-400 dark:text-gray-500`)
rather than inventing a new muted-text style.

## D134 — The currency breakdown line shows RAW holding composition, independent of whether that currency's FX conversion actually succeeded
Deliberately not filtered by `fxFailedCurrencies`/`fxUnconvertedCount` —
even if today's USD rate fails to fetch (so the main total silently
excludes that holding's value, per D130), the breakdown line still
truthfully discloses "you hold some USD here," which is arguably MORE
useful during exactly the failure case, not less. Two independent
disclosures (banner/inline-count for "totals may be incomplete," and
breakdown line for "here's what's not-THB in this portfolio") answering
two different questions, not one mechanism serving both.

## D135 — Per-row "Current Value" only shows the THB-equivalent second line for holdings whose currency differs from the portfolio's base currency, reusing the already-cached `fxRates` from D129 (no new API calls)
A THB holding's THB-equivalent is itself — showing "฿4,027.67 (฿4,027.67)"
would be pure noise. When a foreign-currency holding's rate isn't cached
(fetch failed, or still loading), the row just shows its native-currency
value alone rather than a broken/placeholder second line — same
"disclose what's known, don't fake what isn't" approach as the rest of
this feature.
