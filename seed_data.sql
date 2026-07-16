-- ============================================================
-- Seed data — "Retirement" portfolio
-- Real data inserted 2026-07-03. Re-run this after a fresh schema
-- apply (e.g. rebuilding a dev database) to restore this portfolio.
-- Safe to re-run only on an EMPTY database — running twice will
-- create duplicate portfolios/assets (no unique constraint on
-- portfolio name; assets are unique on (symbol, market) but market
-- is null here, so duplicates are possible — check before re-running).
-- ============================================================

-- 1) สร้างพอร์ต (ทำครั้งเดียว)
insert into portfolios (name) values ('Retirement');

-- 2) สร้าง assets ทุกตัวพร้อมกัน
insert into assets (symbol, name, asset_type, currency) values
  ('SCBS&P500E', 'SCB S&P 500', 'fund', 'THB'),
  ('SCBGOLDE', 'SCB GOLD', 'fund', 'THB'),
  ('SCBCHAE', 'SCB CSI300', 'fund', 'THB'),
  ('B-INNOTECH', 'Fidelity Funds Global Technology Fund', 'fund', 'THB'),
  ('PRINCIPAL VNEQ-A', 'Vietnam Active Fund', 'fund', 'THB'),
  ('KFHEALTH-A', 'JP Morgan Global Healthcare Fund', 'fund', 'THB'),
  ('B-BHARATA', 'Nippon India Equity Fund, USD Class I', 'fund', 'THB');

-- 3) ใส่ opening balance ของแต่ละตัวพร้อมกัน
-- (opening balance = ยอดรวมที่ถืออยู่ ณ วันที่บันทึก ไม่ใช่ประวัติ DCA ทุกงวด — ดู DECISIONS.md D6)
insert into transactions (portfolio_id, asset_id, type, trade_date, quantity, price)
select
  (select id from portfolios where name = 'Retirement'),
  a.id,
  'buy',
  '2026-07-03',
  v.qty,
  v.avg_cost
from (values
  ('B-INNOTECH', 510.2699::numeric, 33.2155::numeric),
  ('PRINCIPAL VNEQ-A', 1358.5296::numeric, 13.2356::numeric),
  ('KFHEALTH-A', 1188.9383::numeric, 12.6163::numeric),
  ('B-BHARATA', 790.2917::numeric, 15.8169::numeric),
  ('SCBS&P500E', 455.6383::numeric, 35.0390::numeric),
  ('SCBGOLDE', 790.3425::numeric, 18.5209::numeric),
  ('SCBCHAE', 4482.0275::numeric, 9.2421::numeric)
) as v(symbol, qty, avg_cost)
join assets a on a.symbol = v.symbol;

-- 4) ใส่ราคาล่าสุดของทุกตัวพร้อมกัน
-- (ราคานี้จะเก่าลงเรื่อยๆ ตามเวลา — ใช้แค่ตอน seed ครั้งแรก ราคาจริงควรอัปเดตแยก
-- ไม่ใช่มาแก้ไฟล์นี้)
insert into prices (asset_id, price, source)
select a.id, v.price, 'manual'
from (values
  ('SCBS&P500E', 43.5570::numeric),
  ('SCBGOLDE', 22.7749::numeric),
  ('SCBCHAE', 11.1446::numeric),
  ('B-INNOTECH', 40.9195::numeric),
  ('PRINCIPAL VNEQ-A', 12.6783::numeric),
  ('KFHEALTH-A', 13.6417::numeric),
  ('B-BHARATA', 14.7518::numeric)
) as v(symbol, price)
join assets a on a.symbol = v.symbol;

-- 5) Bitcoin — added later (requires migrations/0003_add_crypto_asset_type.sql
-- to be applied first, since 'crypto' is not in the original asset_type check)
insert into assets (symbol, name, asset_type, currency) values
  ('BTC', 'Bitcoin', 'crypto', 'THB');

insert into transactions (portfolio_id, asset_id, type, trade_date, quantity, price)
select
  (select id from portfolios where name = 'Retirement'),
  a.id,
  'buy',
  '2026-07-03',
  0.003025,
  2996421.211
from assets a
where a.symbol = 'BTC';

insert into prices (asset_id, price, source)
select id, 2073441.44, 'manual'
from assets where symbol = 'BTC';