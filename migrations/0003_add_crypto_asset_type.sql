-- Migration 0003: add 'crypto' as an allowed asset_type
-- (needed to track Bitcoin / other crypto holdings)

alter table assets drop constraint assets_asset_type_check;

alter table assets add constraint assets_asset_type_check
  check (asset_type in ('stock','etf','fund','bond','cash','crypto'));
