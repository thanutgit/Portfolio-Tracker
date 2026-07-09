# Migrations

Ordered, re-runnable SQL files — one per schema change. This is what keeps
future dev/prod databases in sync (see ARCHITECTURE.md → Database migrations,
DECISIONS.md D11).

## Rules
- Never edit an old migration file after it's been applied anywhere. If a
  change is needed, write a NEW numbered file that alters/fixes it.
- Number sequentially: `0001_init.sql`, `0002_add_targets.sql`, ...
- Each file should be runnable on its own, in order, against a fresh database.
- `seed_data.sql` (in the project root, not here) is NOT a migration — it's
  real portfolio data, kept separate so schema changes and personal data
  don't mix.

## Current migrations
| File | What it does |
|------|---------------|
| 0001_init.sql | Phase 1 schema: portfolios, assets, transactions, prices tables + latest_prices, holdings views |
| 0002_add_targets.sql | Phase 2: `targets` table (portfolio_id, asset_id, target_pct, drift_threshold) |
| 0003_add_crypto_asset_type.sql | Adds `crypto` as an allowed `asset_type` (for Bitcoin etc.) |
| 0004_add_dividend_returns.sql | Phase 3 (dividends slice): `dividend_income` + `holdings_with_returns` views — net dividends and total_return, built on top of `holdings` |
| 0005_add_portfolio_snapshots.sql | Phase 4 (snapshots slice): `portfolio_snapshots` table (portfolio_id, snapshot_date, total_value, total_cost, cash_value) — daily portfolio value history for a future growth chart |
| 0006_add_user_settings.sql | Phase 5 (RMF holding-period slice): `user_settings` table (`id`, `birth_date`, `created_at`) — single-row, no `user_id` yet (no auth — see ROADMAP.md Phase 7); used only to check RMF's age-55 condition |
| 0007_add_auth_user_id.sql | Phase 7 step 1 (auth prep, NOT applied yet — see DECISIONS.md): adds the `portfolios.user_id → auth.users` foreign key (the column already existed since 0001, unreferenced); adds `user_settings.user_id` (nullable, unique) so settings can eventually be per-user instead of single-row. RLS still off; no data migrated to real owners yet |

## Applying migrations
Run the file's contents in the Supabase SQL Editor, in order. There's no
automated migration runner yet (fine for a solo Phase 1 project) — add one
(e.g. Supabase CLI migrations) if the project grows to need dev/prod sync.