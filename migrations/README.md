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
| 0007_add_auth_user_id.sql | Phase 7 step 1 (applied): adds the `portfolios.user_id → auth.users` foreign key (the column already existed since 0001, unreferenced); adds `user_settings.user_id` (nullable, unique) so settings can eventually be per-user instead of single-row |
| 0008_backfill_owner_user_id.sql | Phase 7 step 2 (applied): backfills `user_id` on existing `portfolios`/`user_settings` rows to the one real auth account, with a safety check that fails loudly if there isn't exactly one `auth.users` row. Data-only — no schema change |
| 0009_portfolios_user_id_not_null.sql | Phase 7 step 2 (applied): makes `portfolios.user_id` `not null`. Deliberately its own file, run only after confirming 0008 backfilled every row |
| 0010_enable_rls.sql | Phase 7 step 2 (applied): enables RLS on `portfolios`/`user_settings` (direct `user_id` check) and `transactions`/`targets`/`portfolio_snapshots` (indirect check via `portfolios.user_id`). `assets`/`prices` intentionally left without RLS — shared across all users |
| 0011_add_finnhub_price_source.sql | Finnhub foreign-stock price auto-fetch (NOT applied yet — see DECISIONS.md): adds `'finnhub'` as an allowed `prices.source` value, alongside the existing `'manual'`/`'csv'`/`'api'` (the last of which stays CoinGecko's, kept distinct rather than shared, so each row's provider is identifiable later) |
| 0012_fix_holdings_avg_cost_running_total.sql | Bug fix, NOT applied yet — see GOTCHAS.md and DECISIONS.md: replaces the `holdings` view's `avg_cost` formula with a proper running weighted-average-cost (`WITH RECURSIVE`, replaying buy/sell in chronological order), fixing a real bug where the original 0001 formula (lifetime average buy price, ignoring sells) silently diverges from the correct answer whenever a buy occurs after a prior sell. Contains a commented-out, read-only preview query to run first and compare old vs. new `avg_cost` before applying the actual `CREATE OR REPLACE VIEW` |
| 0013_add_coingecko_id.sql | NOT applied yet — see DECISIONS.md (supersedes D20): adds `assets.coingecko_id` (text, nullable, unique) so `/api/refresh-crypto-prices` can auto-refresh any CoinGecko coin per-asset instead of only the symbols in a hardcoded map. Backfills `bitcoin`/`ethereum` onto the existing BTC/ETH rows |
| 0014_add_multicurrency_fx.sql | Applied — adds `transactions.fx_rate_to_base` (numeric, nullable). **Unused**: tried for two different multi-currency approaches (per-transaction FX capture, then display-time conversion — see DECISIONS.md D119-D135), both since replaced by a single-currency-per-portfolio validation model (D136) that needs no FX math at all. Kept rather than dropped (D128, reaffirmed D141) — nothing reads/writes it. `portfolios.base_currency` already existed since 0001 and needed no change |
| 0015_add_price_source.sql | NOT applied yet — see GOTCHAS.md #11 and DECISIONS.md D154 (supersedes D20/D95 in part). Adds `assets.price_source` (text, nullable, check-constrained to `'finnhub'`/`'coingecko'`/null) as the one explicit auto-fetch-eligibility flag, replacing the reused `market`/`coingecko_id` checks. Backfills the two unambiguous cases (`coingecko_id is not null` → `'coingecko'`; `asset_type = 'stock' and market is not null` → `'finnhub'`) automatically; includes a read-only query listing every ambiguous `asset_type = 'stock' and market is null` row (the SCHD case) for manual, one-by-one review instead of guessing |

## Applying migrations
Run the file's contents in the Supabase SQL Editor, in order. There's no
automated migration runner yet (fine for a solo Phase 1 project) — add one
(e.g. Supabase CLI migrations) if the project grows to need dev/prod sync.
