-- ============================================================
-- Portfolio Tracker — Migration 0015: assets.price_source (replaces
-- market/coingecko_id reuse as the auto-fetch eligibility signal)
-- ============================================================
-- WHY: isForeignStock() (asset_type = 'stock' AND market IS NOT NULL)
-- and hasAutoFetch() (coingecko_id IS NOT NULL) each borrowed a field
-- whose real job is something else (an exchange code, a foreign-API
-- reference id) to answer "does this asset auto-fetch its price." That
-- broke the moment Finnhub's /stock/profile2 returned an empty profile
-- for an ETF (SCHD, SPY, ...) — market stayed null even though the
-- asset was a real, Finnhub-confirmed symbol, which isForeignStock()
-- then read as "not eligible," silently excluding it from BOTH
-- auto-fetch and the Prices page's manual-entry list at once. See
-- GOTCHAS.md #11 and DECISIONS.md D153 (superseded) / D154.
--
-- FIX: one explicit column, price_source (nullable text): NULL = manual
-- entry, 'finnhub' = stock/ETF auto-fetched via Finnhub, 'coingecko' =
-- crypto auto-fetched via CoinGecko. Set directly at asset-creation time
-- going forward — no more deriving eligibility from market/coingecko_id.
-- Both of those columns KEEP their existing meaning (exchange code /
-- CoinGecko coin id) and keep being written the same way; they just stop
-- being read as eligibility flags anywhere in the app.
--
-- NOTE: this is a different column from prices.source (0001_init.sql /
-- 0011_add_finnhub_price_source.sql), which tracks where one PRICE ROW
-- came from ('manual'/'csv'/'api'/'finnhub'). assets.price_source
-- tracks which mechanism, if any, an ASSET is eligible for — a
-- similar-sounding but genuinely different question. Do not conflate
-- the two when reading either column.
-- ============================================================


-- ------------------------------------------------------------
-- STEP 1: add the column (same "text + check" style as asset_type/
-- tax_bucket in 0001_init.sql, not a Postgres enum type — easier to
-- extend later without a type migration).
-- ------------------------------------------------------------
alter table assets
    add column price_source text
                check (price_source in ('finnhub', 'coingecko'));


-- ------------------------------------------------------------
-- STEP 2: backfill the two UNAMBIGUOUS cases — every existing row where
-- the old reused-field signal was actually reliable.
-- ------------------------------------------------------------

-- Crypto: coingecko_id is set unconditionally and immediately when a
-- crypto asset is created via search (never depends on a secondary
-- profile lookup the way stocks' market does) — a 100% reliable signal,
-- no ambiguous cases possible here.
update assets
set price_source = 'coingecko'
where coingecko_id is not null;

-- Stocks: a non-null market could only ever have come from the Finnhub
-- profile lookup (manual entry never collects it, D95) — also 100%
-- reliable.
update assets
set price_source = 'finnhub'
where asset_type = 'stock'
  and market is not null;


-- ------------------------------------------------------------
-- STEP 3 (read-only — run this and review the list before deciding
-- anything): every stock that's AMBIGUOUS — asset_type = 'stock' with
-- market IS NULL. This is exactly the SCHD-shaped case: could be a real
-- Finnhub-created ETF that hit the empty-profile bug (should become
-- 'finnhub'), or a genuinely hand-typed foreign stock via Manual Entry
-- that Finnhub doesn't even recognize (should stay NULL/manual).
--
-- There is no field in the current schema that reliably tells these
-- apart after the fact: asset_type alone doesn't (manual entry can also
-- produce asset_type = 'stock' — see the "hand-typed foreign stock"
-- case in src/lib/finnhub.ts's comments), and currency doesn't either
-- (a Finnhub-created row's currency may never have been corrected from
-- whatever the portfolio's default was at creation time, if Finnhub's
-- profile call came back empty). Rather than guess, this just lists
-- every candidate for you to decide, one at a time, in STEP 4 below.
-- ------------------------------------------------------------
select id, symbol, name, currency, sector, country
from assets
where asset_type = 'stock'
  and market is null
order by symbol;


-- ------------------------------------------------------------
-- STEP 4 (template — fill in after reviewing STEP 3's output): for each
-- row you confirm really came from Finnhub search (e.g. SCHD), mark it
-- 'finnhub' by symbol. Leave anything you're unsure about, or know was
-- genuinely hand-typed, untouched — it correctly stays NULL/manual.
-- ------------------------------------------------------------
-- update assets set price_source = 'finnhub' where symbol in ('SCHD');


-- ------------------------------------------------------------
-- STEP 4b (optional — same review, different column): while you're
-- looking at these rows anyway, any of them that are actually ETFs (not
-- individual stocks) were also mis-set to asset_type = 'stock' — this
-- app hardcoded 'stock' for every Finnhub-created asset until
-- DECISIONS.md D155, which added auto-classification (stock vs. etf)
-- for NEW assets going forward. D155 doesn't retroactively fix rows
-- created before it — SCHD (a real ETF) is exactly this case.
-- Reclassifying asset_type has no effect on auto-fetch eligibility
-- either way (price_source alone drives that, D154) — this is a display/
-- correctness nicety, not required for pricing to work. Simplest done
-- directly in EditAssetModal.tsx (open the asset, change "Asset type"
-- from Stock to ETF, save) rather than SQL — included here only for
-- convenience if you'd rather batch it with STEP 4 above.
-- ------------------------------------------------------------
-- update assets set asset_type = 'etf' where symbol in ('SCHD');


-- ------------------------------------------------------------
-- STEP 5 (optional, read-only): sanity check after STEP 2/4 — review
-- every stock/crypto asset's final price_source at a glance.
-- ------------------------------------------------------------
-- select id, symbol, asset_type, market, coingecko_id, price_source
-- from assets
-- where asset_type in ('stock', 'crypto')
-- order by asset_type, symbol;
