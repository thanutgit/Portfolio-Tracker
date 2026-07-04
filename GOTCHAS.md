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
