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

## Applying migrations
Run the file's contents in the Supabase SQL Editor, in order. There's no
automated migration runner yet (fine for a solo Phase 1 project) — add one
(e.g. Supabase CLI migrations) if the project grows to need dev/prod sync.