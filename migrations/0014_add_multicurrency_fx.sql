-- ============================================================
-- Portfolio Tracker — Migration 0014: transactions.fx_rate_to_base
--
-- Multi-currency support, step 1 (schema only — no calculation logic
-- changes this round). See ARCHITECTURE.md / ROADMAP.md Phase 3 and
-- DECISIONS.md D119-D121.
--
-- NOTE: portfolios.base_currency already exists (added in
-- 0001_init.sql: `char(3) not null default 'THB'`) and is already read
-- throughout the app (usePortfolios, Holdings, Rebalancing, Overview,
-- etc.) — nothing to add there. See DECISIONS.md D119.
--
-- transactions ALSO already has an fx_rate column (0001_init.sql,
-- `numeric(20,10) not null default 1`), but it's dead code — never
-- read or written anywhere in the app — and can't serve this purpose:
-- being `not null default 1`, every existing row (including the real
-- BABA/USD transactions this work is meant to fix) already carries a
-- value of 1, so there'd be no way to tell "genuinely 1:1 (THB-to-THB)"
-- apart from "not backfilled yet". A new, nullable column is added
-- instead so NULL can mean exactly one thing: "no verified FX rate
-- recorded for this transaction yet". The old `fx_rate` column is left
-- untouched (still unused) — whether to drop it is a separate decision
-- for later. See DECISIONS.md D120.
--
-- NOT applied yet — run manually in the Supabase SQL Editor.
-- ============================================================

alter table transactions
    add column fx_rate_to_base numeric(20,10);

comment on column transactions.fx_rate_to_base is
    'Exchange rate from this transaction''s asset currency to the '
    'portfolio''s base_currency, as of trade_date (e.g. asset priced in '
    'USD, portfolio base_currency THB, fx_rate_to_base = 36.5 means '
    '1 USD = 36.5 THB on trade_date). NULL = not yet recorded — every '
    'existing transaction, including foreign-currency ones like BABA, is '
    'NULL until backfilled (planned step 5). Once the app starts writing '
    'this column, a THB-priced transaction in a THB-base portfolio is '
    'expected to store 1, not NULL. See src/lib/fx.ts.';

-- ============================================================
-- Read-only check to run before/after:
--
--   select t.id, a.symbol, a.currency, p.base_currency, t.trade_date,
--          t.fx_rate_to_base
--   from transactions t
--   join assets a on a.id = t.asset_id
--   join portfolios p on p.id = t.portfolio_id
--   order by t.trade_date desc
--   limit 20;
--
-- Before: query errors (column doesn't exist yet) — expected.
-- After: new column exists; every row shows NULL until a later round
-- backfills it.
-- ============================================================
