# Gotchas

Real issues hit during development — read before repeating the mistake.

## #1 — SQL batch errors partway through leave partial data behind
When running multiple `insert` statements together in Supabase SQL Editor and
one statement errors (e.g. a check constraint violation), earlier statements
in the same run may have already committed successfully. Re-running the whole
batch after fixing the error can then create duplicates, because the
successful earlier inserts aren't rolled back automatically.

**What happened:** Adding Bitcoin required first altering `assets_asset_type_check`
to allow `'crypto'`. Before that migration was applied, an insert failed with
`asset_type` = `'crypto'`. The batch was retried a few times while debugging,
and because `portfolios` has no unique constraint on `name`, and the
transaction insert had `quantity`/`price` swapped in one attempt, three rows
ended up in `transactions` for BTC — one correct, one with quantity/price
swapped, one a duplicate of the correct one. This showed up in the UI as an
absurd BTC market value (quantity misread as a multi-million-baht price).

**Fix:** Query for duplicates before trusting the UI:
```sql
select t.id, t.quantity, t.price, t.trade_date
from transactions t join assets a on a.id = t.asset_id
where a.symbol = 'SYMBOL_HERE';
```
Delete the wrong/duplicate rows by `id`, keep the one correct row.

**Prevention:**
- Before re-running a multi-statement SQL batch after an error, `select` to
  check what already landed — don't just re-run blindly.
- Double-check column order in `values (...)` matches the target column list
  exactly, especially when quantity and price are both plain numerics (no
  type distinction catches a swap).
- Consider adding a unique constraint on `portfolios.name` per user, and
  reviewing whether `assets` needs a broader uniqueness rule beyond
  `(symbol, market)` — tracked as a possible future migration, not done yet.

## #2 — The `.env.local` block doesn't stop capturing keys from network requests
The project's safety hook (`.claude/hooks/block-env.mjs`) blocks reading
`.env.local` directly, but that only closes one path to the Supabase keys —
it doesn't prevent getting the same values another way and using them to
write to the database directly.

**What happened:** While testing the portfolio value trend chart, temporary
historical `portfolio_snapshots` rows were needed to exercise the
"2+ rows" chart path. Instead of reading `.env.local` (blocked), the
Supabase URL and *publishable* key were captured from the browser's own
outgoing network requests (headers/query params on requests the app
itself already sends) via Playwright, then used to insert test rows
directly via the REST API. All test rows were deleted immediately after
verifying the chart.

**Why it matters:** `block-env.mjs` only blocks *reading the file*. It
doesn't block network access, and the publishable key is designed to be
public/client-exposed — capturing it from legitimate traffic isn't
bypassing anything secret. But because RLS is still off project-wide
(see DECISIONS.md, Phase 1), that publishable key can write/delete data
too, not just read it. So a hook aimed at protecting *secrets* doesn't
actually limit *what the app's own already-public key can do* to the
real database.

**Prevention:** Added a Non-negotiable to CLAUDE.md: never write/insert/
update/delete real data in the live database for testing without asking
the user first, every time — no exception for cases where a technical
path exists to do it unsupervised (like capturing the publishable key
from network traffic instead of reading `.env.local`). Read-only
`SELECT`s to verify behavior remain fine without asking.

A more durable, structural fix would be enabling RLS with real
write-limiting policies (not yet done — single-user dev setup, see
DECISIONS.md D7/D10 area); until then, any client-side credential (even
the "safe" publishable one) can write anything in the database, so the
CLAUDE.md rule above is a process safeguard, not a technical one.

## #3 — Newton-Raphson can overshoot past a financially meaningful rate boundary
**What happened:** While writing the XIRR solver, the test case "-50%
loss in 1 year" caused the first Newton-Raphson step to jump past
`rate = -1` — a boundary with no financial meaning, since a rate below
-100% doesn't correspond to any real investment outcome.

**Fix:** Used step-halving/damping (safeguarded Newton-Raphson) instead
of plain Newton-Raphson — if a step would cross the boundary, halve it
and retry (up to a capped number of times) rather than accepting an
invalid rate.

**Prevention:** When writing a numerical solver with a meaningful domain
constraint, test extreme cases (very large gains/losses), not just
calm-looking middle-of-the-road ones — that's exactly where naive
Newton-Raphson is most likely to overshoot.

## #4 — XIRR gives a technically-correct but useless result if the transaction history is too short
**What happened:** Testing against real data (the Retirement portfolio,
whose transactions all fall within a 4-day span) produced an XIRR of
+3,145,865% — mathematically correct, but meaningless, because
annualizing a return measured over a very short span massively distorts
the number.

**Fix:** Added a `minSpanDays` guard (default 30 days). Below that span
between the earliest and latest cash flow, show "not enough data"
instead of a number.

**Prevention:** Any time-based metric (annualized return, XIRR, CAGR)
needs an explicit "span too short to be meaningful" case built in from
the start — don't just trust the formula. Test against real, existing
data, not only synthetic cases, since that's what surfaced this one.

## #5 — Saying "file updated" doesn't mean the real file actually changed
**What happened:** Recurred multiple times this session — `migrations/
README.md` missing its row for `0002`, `DECISIONS.md` missing D14–D16,
`DESIGN.md` missing its "Depth & elevation" section, all despite each
one having been reported as already updated. The usual cause is that an
edit got overwritten by something else touching the same file on disk
(e.g. the user's own unsaved/overwritten local state), not the AI
fabricating the update — but from the outside, the two look identical.

**Fix:** Open the actual file on disk and check it by eye every time
"updated" is reported — especially for `DECISIONS.md`, `ARCHITECTURE.md`,
`DESIGN.md`, none of which have a hook forcing them to stay in sync.

**Prevention:** Before treating a summary of "file X was updated" as
true, open that file at least once per significant round of work —
don't just trust the description of what was done.

## #6 — `?? 0` silently turns "unknown" into "value is zero"
**What happened:** The `holdings` view correctly returns `null` for
`unrealized_pnl`/`total_return` when there's no price — it genuinely
can't compute them. But the app code used `Number(h.unrealized_pnl ?? 0)`,
converting that `null` into `0`. The table then showed "฿0.00" (implying
P&L is exactly break-even) when the real meaning was "can't be computed,
price unknown" — a completely different thing.

**Fix:** Keep the `null` as-is instead of defaulting it to `0`, and have
the UI render "—" for it, matching how `Last Price`/`Market Value`
already handled the same situation.

**Prevention:** Be careful with `?? 0` (or any default value) on
financial numbers — "no data" and "data exists and is zero" are two
different states and must not collapse into the same value.

## #7 — Reset-password link redirects to / instead of /reset-password
**What happened:** Clicking the password-reset link from the email
landed on `/` (Overview) with the user automatically logged in,
instead of on `/reset-password`.

**Root cause (confirmed via DevTools Network tab):** testing was done
through a Vercel **Preview** deployment URL (e.g.
`portfolio-tracker-4qtceqr4m-thanutsu.vercel.app`) — Vercel generates a
new random preview URL on every push. That URL was never (and
realistically can't be) registered in Supabase's Redirect URLs
allow-list, which only lists the stable `localhost:3000` and the real
production domain. Supabase rejected the unrecognized `redirectTo` and
fell back to its default, landing on `/` with the recovery session's
tokens attached instead of `/reset-password` — and since Overview is
behind `<RequireAuth>`, a valid (if unintended) session was enough to
render it normally, logging the user in.

Ruled out along the way: the app's own code (`redirectTo` was already
correct — `${window.location.origin}/reset-password`, verified against
the working tree, git HEAD, and the original commit) and a Supabase
account-wide incident (a real banner was showing at the time, but
coincidental, not the actual cause).

**Fix:** Test the reset-password flow only against a URL that's
actually in the Redirect URLs allow-list — `localhost:3000` for local
dev, or the stable production domain. Never a per-push Vercel Preview
URL.

**Prevention:** When testing a Supabase redirect-based flow (password
reset, email confirmation, OAuth) on Vercel, use the production domain
or localhost, not a Preview deployment's randomly-generated URL —
preview URLs change every push and aren't practical to allow-list.

## #8 — `avg_cost` formula (since 0001_init.sql) is wrong for any asset with a buy after a prior sell
**What happened:** Holdings showed PRINCIPAL VNEQ-A's Avg Cost as
`13.23335786260057`; hand-calculating the correct weighted-average cost
from the real 23-row transaction history gave `13.2059` instead — a
genuine, confirmed data bug, not a display/rounding issue.

**Root cause:** the `holdings` view's original formula —
```sql
sum(qty*price+fee where type='buy') / sum(qty where type='buy')
```
— computes the *lifetime average purchase price* (every unit ever
bought, divided by however many were ever bought), not the average cost
of units *currently held*. It ignores sells entirely. That's only
mathematically correct if every sell happens strictly after every buy
for that asset — proven wrong with a minimal example: buy 100@10, sell
50, buy 100@20 should average to `2500/150 = 16.667`, but the formula
gives `(1000+2000)/200 = 15`. The moment a buy happens *after* a prior
sell (e.g. an ongoing DCA fund with an occasional partial redemption),
the formula silently diverges from the correct answer — no error, no
warning, just a wrong number that looks plausible.

**Fix:** `migrations/0012_fix_holdings_avg_cost_running_total.sql` (not
yet applied at time of writing) replays every buy/sell in chronological
order via a `WITH RECURSIVE` CTE, keeping a running `(quantity,
total_cost)` state — a sell removes cost proportionally at the running
average cost *at that point in time*, never the sale price. Verified
against 5 hand-computable cases (including the exact buy-sell-buy
pattern above) via an equivalent JS simulation before writing the SQL,
since the live data couldn't be queried directly (RLS + no login
credentials — see GOTCHAS.md #7's general credential constraint).

**Prevention:** A weighted-average-cost calculation that only aggregates
buys and discards sells is a strong smell — the moment sells can be
interleaved with more buys (not just "sold off at the very end"), the
calculation needs to be order-sensitive (a running replay), not a flat
aggregate `SUM()`. Test this kind of formula against an interleaved
buy/sell/buy sequence specifically, not just "buy a few times, sell at
the end" — that specific ordering is exactly the case where the wrong
formula still happens to give the right answer, hiding the bug.

## #9 — An 8-item `.slice()` cap silently hid assets from the empty-query asset picker
**What happened:** Opening the asset search dropdown in "+ Add
transaction" (and, identically, the Prices page's "Select from list"
picker) *without typing anything* showed only some of the real assets
in the system. Typing the missing asset's name found it immediately —
which looked like a search-relevance bug, but wasn't.

**Root cause:** the Supabase query itself (`.from("assets").select(...)
.order("symbol")`) has no `.limit()` — it always fetches every row. The
actual cap was client-side, inside the combobox's own `useMemo`:
```ts
if (!q) return options.slice(0, 8);
return options.filter(...).slice(0, 8);
```
Both branches slice to 8, but with very different effect: with no
search text, the *entire* alphabetically-sorted list gets truncated to
its first 8 symbols, unconditionally — anything sorting after position
8 can never appear without being searched for directly. With search
text, the list is filtered down to real matches *first*, so the same
slice(8) almost never actually removes anything. Deterministic, not
random — the same assets are missing on every load, not a different
one each time.

**Fix:** raised the empty-query branch's cap from 8 to 50 in both
`TxnAssetCombobox` (`TransactionModal.tsx`) and `AssetRowCombobox`
(`prices/page.tsx`) — see DECISIONS.md for why 50 specifically. The
searched-results branch keeps its 8-item cap (a real search narrows to
few enough matches that it's not the same bug).

**Prevention:** when a UI need ("show a short list") and a correctness
need ("show everything that matches, including 'no filter' as a valid
filter") share one `.slice()`/`.limit()` call, they can silently
conflict — a cap that's reasonable for "top 8 search results" is a
data-loss bug for "everything, no filter applied yet." Give the
unfiltered/empty-query case its own explicit ceiling, high enough that
it's not really a limit at the app's actual data scale, rather than
reusing whatever cap the filtered case uses.

## #10 — A `step="0.000001"` on a number input silently blocks any value with more decimals than that
**What happened:** Typing `2.2403415` (7 decimal places — a real
fractional-share quantity from a foreign broker's DCA/dividend
reinvestment) into the Quantity field in "+ Add transaction" was
rejected by the browser with "Please enter a valid value," before the
app's own `handleSubmit` (which calls `e.preventDefault()`) ever ran.

**Root cause:** `<input type="number" step="0.000001">` sets the
HTML5 step-mismatch constraint to exactly 6 decimal places — a value
with 7+ decimals fails native browser constraint validation on submit,
and the browser blocks the form (native validation UI, not this app's
code) before any JS handler sees it. The `step="0.000001"` was chosen
to *allow* fractional quantities in the first place, but any finite
step value still draws a hard line at that many decimal places — it
traded "blocks all decimals" (the `step="1"` default) for "blocks more
than 6 decimals," not "blocks no decimals."

**Fix:** changed `step="0.000001"` (Quantity, Price) and `step="0.01"`
(Fee) to `step="any"` on every quantity/price/fee input in
`TransactionModal.tsx` (single + batch) and `HistoryModal.tsx`'s
transaction-edit form — `step="any"` explicitly disables step-mismatch
validation, so any number of decimal places is accepted. Dividend
Amount/Tax fields (also in `HistoryModal.tsx`) were deliberately left
at `step="0.01"` — they're currency amounts, not share quantities, and
the bug's real-world trigger (long-tail fractional shares) doesn't
apply there.

**Prevention:** on a native `<input type="number">`, any finite `step`
value is a hard ceiling on decimal precision, not just a spinner
increment — it applies to typed/pasted input too, not only the
up/down arrows. For a field that can legitimately hold an unpredictable
number of decimal places (fractional share quantities, prices from
markets with sub-cent ticks), use `step="any"` rather than picking a
number of decimals and hoping it's enough — the moment real data
exceeds whatever was chosen, the browser silently blocks the value
with no app-level error message to debug from.

## #11 — A shared "is this eligible for auto-fetch" predicate silently excluded assets from BOTH auto-fetch and manual entry
**What happened:** SCHD (an ETF added via Finnhub search's "verified via
direct lookup" fallback, since Finnhub's `/search` doesn't index it)
never got a price from either mechanism — not auto-fetched by
`/api/refresh-stock-prices`, and not offered as a manual-entry option on
`/prices` either, as if the app had simply forgotten it existed.

**Root cause:** `isForeignStock()` (`src/lib/finnhub.ts`) — `asset_type
=== 'stock' && !!market` — gates *both* Finnhub auto-fetch eligibility
and the Prices page's "already handled automatically, don't ask for a
manual price" exclusion. `market` is populated from Finnhub's
`/stock/profile2` `exchange` field at asset-creation time, but that
endpoint returns `{}` for a lot of ETFs on the free tier (already known
from an earlier round — sector/country come back null the same way).
So a real, Finnhub-confirmed ETF could end up with `market IS NULL`,
which `isForeignStock()` reads identically to "never came through
Finnhub at all" — falling into neither category instead of the intended
one. There was also no UI anywhere to view or fix `assets.market`
directly, so once a row landed this way, nothing in the app could ever
correct it without raw SQL.

**Fix (two attempts):** the first attempt (D153, "Option B") patched
`market` specifically — always non-null once created via Finnhub search,
real exchange or a placeholder — at the asset-creation call site rather
than in `isForeignStock()`. That worked, but only fixed the `market`
half of the underlying pattern (an eligibility flag borrowed from a
field with a different real job); the same shape of bug was structurally
still possible for crypto's `coingecko_id`, even with no real case
having hit it yet. Fully reverted in favor of D154: one dedicated column,
`assets.price_source` (`migrations/0015_add_price_source.sql`, nullable,
`null`/`'finnhub'`/`'coingecko'`), set directly and unconditionally at
asset-creation time — `isForeignStock()`/`hasAutoFetch()` now read that
column and nothing else. `market`/`coingecko_id` keep their original
columns and meaning, just stop being read as eligibility signals.
`EditAssetModal.tsx` got an "Auto-fetch source" dropdown so this class of
gap (any asset, not just stocks) can be fixed from the UI without SQL.
Existing rows (SCHD included) get backfilled by migration where the old
signal was unambiguous; the genuinely ambiguous SCHD-shaped cases are
listed via a read-only query for manual, one-by-one review rather than a
guess — see DECISIONS.md D154 for why no reliable auto-classification
exists for those.

**Prevention:** when one predicate function decides *two* different
behaviors (here: "auto-fetch this" and "don't show a manual option for
this"), a field that predicate depends on going unexpectedly null
doesn't just disable one behavior — it can flip both at once into the
worst combination ("neither"), and that combination is easy to miss
precisely because each half looks individually correct (no error, no
crash, just an asset that quietly never gets a price). When an external
API's response can legitimately be incomplete for real, valid input
(not just invalid input), don't let an internal eligibility flag inherit
"missing" from that response directly — decide what "confirmed real,
but details unknown" should mean for your own logic, explicitly, rather
than propagating the API's null straight through.

## #12 — Two equivalent "no data for this symbol" cases handled inconsistently: one gracefully, one as a 502
**What happened:** `GET /api/finnhub-profile?symbol=SCHD.MX` (a
Mexican-exchange cross-listing of SCHD, surfaced by `/search` once the
ETP/ETF filter was widened — see DECISIONS.md D155) returned a 502
"server error," instead of the same graceful all-null response an
ordinary ETF with no profile data already got.

**Root cause:** Finnhub's `/stock/profile2` returns 200 with an empty
`{}` body for plenty of real, valid symbols it just has no fundamentals
for on the free tier (the already-known ETF case — SCHD's primary US
listing, SPY, etc.). But for some symbols — apparently including regional
cross-listings like `SCHD.MX`, plausibly not covered by `/profile2` on
the free tier at all — Finnhub responds with a genuine non-2xx status
instead of an empty 200. The route's `if (!res.ok)` branch treated that
as a hard error and returned its own 502/429 to the client, while the
`200 {}` case fell through to a graceful all-null 200 response. Same
underlying situation ("no profile data for this symbol"), two different
outcomes depending on *how* Finnhub happened to signal it — not
specific to `.MX`; any suffix/cross-listing could trigger the same
non-2xx response and hit the identical bug.

**Fix:** the route no longer returns any error status for a
Finnhub-side failure of any kind — network error, timeout, non-2xx
response, or a 2xx response whose body fails to parse as JSON all
degrade to the exact same all-null 200 response as the `{}` case. Only
two genuine errors remain, both about *this app's own* request being
malformed, not about what Finnhub said: a missing `FINNHUB_API_KEY`
(500, real misconfiguration) and a missing `symbol` query param (400,
real caller bug). Verified against the real Finnhub API:
`SCHD.MX` → `{"sector":null,"country":null,"currency":null,"market":null}`
(previously 502); `AAPL` → real profile data, unaffected.

**Prevention:** when a client already treats "request succeeded with no
useful data" and "request failed" identically (here, `TransactionModal`'s
`if (res.ok) { ... }` just does nothing either way, with no visible
distinction to the user), don't let the server-side implementation still
draw that distinction internally — it just means some inputs get gentler
handling than others for no reason the caller can see or benefit from.
Collapse to one graceful path unless something downstream would actually
act differently on the distinction.

## #13 — Turbopack's persistent cache survives "restart the server"
**What happened:** `step="any"` was fixed in `TransactionModal.tsx`
(confirmed correct via `git diff` — the commit matched what was
intended) but the browser still rejected quantities with more than 6
decimal places, and inspecting the live DOM showed `step="0.000001"` —
the old value — still being rendered. Restarting `npm run dev` and hard
refreshing (Ctrl+Shift+R) repeatedly did not change this.

**Root cause:** Turbopack's persistent disk cache
(`.next/dev/cache/turbopack`) is deliberately designed to survive a
process restart, so a cold start is fast — that's its entire purpose. A
plain restart just kills and relaunches the `next dev` process; it
still reads the previously-compiled chunk back out of that on-disk
cache instead of recompiling from the current source. Confirmed
directly: grepping the actually-served compiled chunks under
`.next/dev/server/chunks/ssr/` turned up the literal stale string
`0.000001`, even though the same string had zero matches anywhere in
`src/`.

**Fix:** stop the dev server, delete the entire `.next` directory
(`rm -rf .next` — includes the build output *and* the persistent
Turbopack cache, not just build output), then start a fresh `npm run
dev`. This is a real reset, unlike a plain restart, which only looks
identical from the terminal.

**Prevention:** if code has been changed and confirmed correct (`git
diff`/`git status` match intent) and the server has been restarted, but
browser behavior still doesn't match the change, don't jump to
re-diagnosing the code as wrong. Try `rm -rf .next` before restarting
as the first troubleshooting step, before any other diagnosis — a
"restart" that doesn't clear this cache can look identical to a real
reset while silently still serving stale compiled output.
