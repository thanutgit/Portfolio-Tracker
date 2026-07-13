-- ============================================================
-- Portfolio Tracker — Migration 0011: Finnhub price source
-- เพิ่ม 'finnhub' เป็นค่าที่ยอมรับได้ใน prices.source (แยกจาก 'api'
-- เดิมที่ใช้กับ CoinGecko อยู่แล้ว) — ดู DECISIONS.md สำหรับเหตุผลที่
-- แยกค่า ไม่ใช้ 'api' ร่วมกันทั้งสอง provider
-- ============================================================
-- ยังไม่รัน — ตรวจสอบชื่อ constraint ก่อน (ปกติ Postgres ตั้งชื่อ
-- อัตโนมัติเป็น "prices_source_check" สำหรับ inline check ที่ไม่ได้ตั้ง
-- ชื่อเองใน 0001_init.sql — เช็คได้ด้วย:
--   select conname from pg_constraint where conrelid = 'prices'::regclass;
-- ถ้าชื่อไม่ตรงกับด้านล่าง ให้แก้ชื่อใน "drop constraint" ให้ตรงก่อนรัน
-- ============================================================

alter table prices drop constraint prices_source_check;

alter table prices
    add constraint prices_source_check
    check (source in ('manual', 'csv', 'api', 'finnhub'));
