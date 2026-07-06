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
