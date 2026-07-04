-- ============================================================
-- Migration 0004: Dividend income + total return (Phase 3 — dividends slice only)
-- ============================================================
-- No table/column changes. `transactions.type = 'dividend'` already existed
-- since 0001_init.sql. This migration only adds two new read-only views on
-- top of the existing `holdings` view (never modified — see GOTCHAS.md /
-- CLAUDE.md non-negotiables).
--
-- Dividend transaction convention (enforced by the app, not a DB constraint):
--   quantity = 1
--   price    = gross dividend amount received, in the asset's currency
--   tax      = withholding tax amount (e.g. 10% for Thai dividends)
--   fee      = 0 (kept for schema consistency, unused for dividends so far)
--   net dividend = quantity * price - tax - fee
-- ============================================================


-- dividend_income — net dividends received per asset per portfolio (all-time)
create view dividend_income as
select
    t.portfolio_id,
    t.asset_id,
    sum(t.quantity * t.price - t.tax - t.fee) as net_dividends
from transactions t
where t.type = 'dividend'
group by t.portfolio_id, t.asset_id;


-- holdings_with_returns — holdings + total return
--   unrealized_pnl (from holdings, unchanged)  = price gain/loss only
--   total_return (new)                         = unrealized_pnl + net dividends
-- The two are shown side by side in the UI so the dividend contribution is visible.
create view holdings_with_returns as
select
    h.*,
    coalesce(d.net_dividends, 0)                    as net_dividends,
    h.unrealized_pnl + coalesce(d.net_dividends, 0) as total_return,
    case when h.cost_basis = 0 then null
         else (h.unrealized_pnl + coalesce(d.net_dividends, 0))
              / h.cost_basis * 100
    end                                              as total_return_pct
from holdings h
left join dividend_income d
    on d.portfolio_id = h.portfolio_id and d.asset_id = h.asset_id;
