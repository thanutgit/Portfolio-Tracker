-- ============================================================
-- Portfolio Tracker — Migration 0013: assets.coingecko_id
--
-- Supersedes D20 (CoinGecko symbol -> id mapping hardcoded in code,
-- COINGECKO_IDS in src/lib/coingecko.ts). That was fine when only BTC
-- was held; now crypto assets can be created for ANY CoinGecko coin via
-- TransactionModal's "Search asset" mode, so the mapping has to live in
-- the database, per-asset, instead of a static list in code. See
-- DECISIONS.md for the full reasoning (D-number assigned separately).
--
-- NOT applied yet — run manually in the Supabase SQL Editor.
-- ============================================================

alter table assets
    add column coingecko_id text;

-- One CoinGecko coin id should map to at most one asset row — without
-- this, creating the same coin twice (e.g. two "Bitcoin" rows) would
-- make /api/refresh-crypto-prices double-update from a single price
-- fetch. Postgres unique constraints don't treat NULL = NULL, so this
-- doesn't block multiple non-crypto (or not-yet-backfilled crypto)
-- rows from all having a null coingecko_id at once.
alter table assets
    add constraint assets_coingecko_id_unique unique (coingecko_id);

comment on column assets.coingecko_id is
    'CoinGecko coin id (e.g. "bitcoin"), used by /api/refresh-crypto-prices '
    'to fetch this asset''s price. NULL for non-crypto assets, and for '
    'crypto assets created before this column existed or not yet '
    'backfilled — refresh-crypto-prices reports these as skipped rather '
    'than silently ignoring them.';

-- Backfill the two crypto assets that already exist in the system,
-- created back when COINGECKO_IDS was still a hardcoded { BTC, ETH }
-- map. upper(symbol) guards against either having been typed in
-- lowercase via manual entry.
update assets
   set coingecko_id = 'bitcoin'
 where asset_type = 'crypto' and upper(symbol) = 'BTC' and coingecko_id is null;

update assets
   set coingecko_id = 'ethereum'
 where asset_type = 'crypto' and upper(symbol) = 'ETH' and coingecko_id is null;

-- ============================================================
-- Read-only check to run BEFORE applying the two alters above, and
-- again AFTER the backfill, to confirm exactly what changed:
--
--   select id, symbol, asset_type, coingecko_id
--   from assets
--   where asset_type = 'crypto'
--   order by symbol;
--
-- Before: coingecko_id column won't exist yet (query will error —
-- that's expected, it's just there to run again afterward).
-- After: BTC/ETH rows should show 'bitcoin'/'ethereum'; any other
-- existing crypto asset (if any) will show null until backfilled
-- manually via the Assets page's edit form, or a follow-up UPDATE.
-- ============================================================
