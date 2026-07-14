-- ============================================================
-- Portfolio Tracker — Migration 0012: Fix avg_cost to a proper running
-- weighted-average-cost (replaces the "holdings" view from 0001_init.sql)
-- ============================================================
-- BUG (confirmed against real data, PRINCIPAL VNEQ-A):
--   Old formula:  avg_cost = SUM(qty*price+fee WHERE type='buy')
--                            / SUM(qty WHERE type='buy')
--   This computes the LIFETIME AVERAGE PURCHASE PRICE (every unit ever
--   bought, divided by however many were ever bought) — not the average
--   cost of the units CURRENTLY held. It ignores sells entirely, which is
--   only correct if every sell happens strictly AFTER every buy for that
--   asset. If a BUY happens after a prior SELL (e.g. a DCA fund: buy,
--   partial redeem, keep buying), the two diverge — proven with a small
--   worked example: buy 100@10, sell 50, buy 100@20 gives the correct
--   answer 2500/150 = 16.6667, but the old formula gives (1000+2000)/200
--   = 15. Real-world case: PRINCIPAL VNEQ-A, buggy value
--   13.23335786260057 vs. the correct 13.2059.
--
-- FIX: replay every buy/sell in chronological order (`WITH RECURSIVE`),
-- keeping a running (quantity, total_cost) state per (portfolio_id,
-- asset_id) — buy adds quantity and cost; sell removes quantity AND
-- removes cost proportionally at the CURRENT running average cost
-- (before that sell), never at the sale price. This is the textbook
-- weighted-average-cost method and is NOT expressible as a plain
-- aggregate SUM(), since a sell's cost removal depends on the running
-- average computed from every prior row — the same reason a running bank
-- balance needs a recursive/window calculation, not a flat SUM.
--
-- Ordering caveat: same-day transactions for the same asset are ordered
-- by (trade_date, created_at, id) as a best-effort tiebreaker. `created_at`
-- is NOT reliable within a single multi-row batch insert (Postgres's
-- `now()` is frozen for the whole statement, so every row in one batch
-- gets an identical `created_at`) — `id` (a random UUID) is the final
-- tiebreaker purely for determinism, not true chronological accuracy.
-- True same-day intra-batch sequencing isn't captured anywhere in the
-- current schema; this is a known, accepted limitation, not something
-- this migration solves (see DECISIONS.md).
--
-- Affects every asset that has ever had a partial sell followed by a
-- later buy — not just PRINCIPAL VNEQ-A. See the read-only audit query
-- in this same file (commented out below) to see every affected asset
-- and by how much, BEFORE applying the actual view replacement.
-- ============================================================


-- ------------------------------------------------------------
-- STEP 0 (recommended, read-only, safe to run anytime, changes nothing):
-- Preview what avg_cost WOULD become for every (portfolio, asset) that
-- has at least one sell, compared to what it is today — run this first
-- and sanity-check a few rows (including PRINCIPAL VNEQ-A) before
-- applying STEP 1 below.
-- ------------------------------------------------------------
-- with recursive ordered_txns as (
--     select
--         t.portfolio_id, t.asset_id, t.type, t.trade_date,
--         t.quantity, t.price, t.fee,
--         row_number() over (
--             partition by t.portfolio_id, t.asset_id
--             order by t.trade_date, t.created_at, t.id
--         ) as rn
--     from transactions t
--     where t.type in ('buy', 'sell')
-- ),
-- running_totals as (
--     select
--         o.portfolio_id, o.asset_id, o.rn,
--         case when o.type = 'buy' then o.quantity else 0 end as running_qty,
--         case when o.type = 'buy' then o.quantity * o.price + o.fee else 0 end as running_cost
--     from ordered_txns o
--     where o.rn = 1
--     union all
--     select
--         o.portfolio_id, o.asset_id, o.rn,
--         case when o.type = 'buy' then r.running_qty + o.quantity
--              else r.running_qty - o.quantity end,
--         case when o.type = 'buy' then r.running_cost + o.quantity * o.price + o.fee
--              else r.running_cost - case when r.running_qty = 0 then 0
--                                          else o.quantity * (r.running_cost / r.running_qty) end
--         end
--     from running_totals r
--     join ordered_txns o
--         on o.portfolio_id = r.portfolio_id and o.asset_id = r.asset_id and o.rn = r.rn + 1
-- ),
-- final_totals as (
--     select distinct on (portfolio_id, asset_id)
--         portfolio_id, asset_id, running_qty, running_cost
--     from running_totals
--     order by portfolio_id, asset_id, rn desc
-- ),
-- had_any_sell as (
--     select distinct portfolio_id, asset_id from transactions where type = 'sell'
-- )
-- select
--     a.symbol,
--     f.portfolio_id,
--     old.avg_cost as old_buggy_avg_cost,
--     case when f.running_qty = 0 then null else f.running_cost / f.running_qty end as new_correct_avg_cost
-- from final_totals f
-- join had_any_sell s on s.portfolio_id = f.portfolio_id and s.asset_id = f.asset_id
-- join assets a on a.id = f.asset_id
-- join holdings old on old.portfolio_id = f.portfolio_id and old.asset_id = f.asset_id
-- order by a.symbol;


-- ------------------------------------------------------------
-- STEP 1: replace the "holdings" view with the corrected formula.
-- Output columns are unchanged (same names, same order) — CREATE OR
-- REPLACE keeps `holdings_with_returns` (which selects `holdings.*`)
-- working with no changes needed there.
-- ------------------------------------------------------------
create or replace view holdings as
with recursive ordered_txns as (
    select
        t.portfolio_id,
        t.asset_id,
        t.type,
        t.trade_date,
        t.quantity,
        t.price,
        t.fee,
        row_number() over (
            partition by t.portfolio_id, t.asset_id
            order by t.trade_date, t.created_at, t.id
        ) as rn
    from transactions t
    where t.type in ('buy', 'sell')
),
running_totals as (
    -- base case: each (portfolio_id, asset_id)'s first transaction
    select
        o.portfolio_id,
        o.asset_id,
        o.rn,
        case when o.type = 'buy' then o.quantity else 0 end as running_qty,
        case when o.type = 'buy' then o.quantity * o.price + o.fee else 0 end as running_cost
    from ordered_txns o
    where o.rn = 1

    union all

    -- recursive step: apply each next transaction to the prior running state
    select
        o.portfolio_id,
        o.asset_id,
        o.rn,
        case
            when o.type = 'buy' then r.running_qty + o.quantity
            else r.running_qty - o.quantity
        end as running_qty,
        case
            when o.type = 'buy' then r.running_cost + o.quantity * o.price + o.fee
            -- sell: remove cost at the CURRENT running average (before this
            -- sell), never at the sale price — the defining rule of
            -- weighted-average-cost accounting.
            else r.running_cost - case
                when r.running_qty = 0 then 0
                else o.quantity * (r.running_cost / r.running_qty)
            end
        end as running_cost
    from running_totals r
    join ordered_txns o
        on o.portfolio_id = r.portfolio_id
       and o.asset_id = r.asset_id
       and o.rn = r.rn + 1
),
final_totals as (
    -- the last row (highest rn) per (portfolio_id, asset_id) holds the
    -- final running quantity/cost after replaying the full history
    select distinct on (portfolio_id, asset_id)
        portfolio_id,
        asset_id,
        running_qty,
        running_cost
    from running_totals
    order by portfolio_id, asset_id, rn desc
)
select
    f.portfolio_id,
    f.asset_id,
    a.symbol,
    a.name,
    a.currency,
    f.running_qty                                     as quantity,
    case when f.running_qty = 0 then null
         else f.running_cost / f.running_qty
    end                                                as avg_cost,
    lp.price                                           as last_price,
    f.running_cost                                     as cost_basis,     -- = quantity * avg_cost, computed
                                                                           -- directly to avoid a divide-then-
                                                                           -- multiply rounding round-trip
    f.running_qty * lp.price                           as market_value,
    (f.running_qty * lp.price) - f.running_cost        as unrealized_pnl,
    case when f.running_cost = 0 then null
         else ((f.running_qty * lp.price) - f.running_cost) / f.running_cost * 100
    end                                                as unrealized_pct
from final_totals f
join assets a on a.id = f.asset_id
left join latest_prices lp on lp.asset_id = f.asset_id
-- same "fully sold off" exclusion as the original view
where f.running_qty <> 0;
