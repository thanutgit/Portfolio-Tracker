-- ============================================================
-- Migration 0005: portfolio_snapshots (Phase 4 — snapshots slice only)
-- ============================================================
-- เก็บมูลค่ารวมของพอร์ตรายวัน เพื่อใช้วาดกราฟเทรนด์ในอนาคต — รอบนี้แค่
-- วางโครงสร้างข้อมูลให้พร้อมสะสม ยังไม่ทำกราฟจริง
--
-- ไม่รวม (เก็บไว้ทำรอบถัดไป): benchmark comparison, XIRR,
-- drift-threshold alerts — ส่วนที่เหลือของ Phase 4
-- ============================================================


-- ------------------------------------------------------------
-- portfolio_snapshots — มูลค่าพอร์ตรวม ณ วันหนึ่งๆ
--   อย่างมาก 1 แถวต่อ portfolio ต่อวัน — unique constraint กันบันทึกซ้ำ
--   วันเดียวกันหลายแถว (บทเรียนจาก GOTCHAS.md #1); แอปฝั่ง client upsert
--   ทับแถวเดิมถ้ามีอยู่แล้ว ไม่ error
-- ------------------------------------------------------------
create table portfolio_snapshots (
    id            uuid primary key default gen_random_uuid(),
    portfolio_id  uuid not null references portfolios(id) on delete cascade,
    snapshot_date date not null,
    total_value   numeric(20,6) not null,           -- มูลค่าตลาดรวมทั้งพอร์ต ณ วันนั้น
    total_cost    numeric(20,6) not null,            -- ต้นทุนรวมทั้งพอร์ต ณ วันนั้น
    cash_value    numeric(20,6) not null default 0,  -- ส่วนที่เป็นเงินสด (asset_type = 'cash')
    created_at    timestamptz not null default now(),
    unique (portfolio_id, snapshot_date)
);

create index idx_portfolio_snapshots_portfolio_date
    on portfolio_snapshots(portfolio_id, snapshot_date desc);


-- ============================================================
-- หมายเหตุการออกแบบ (Phase 4 — snapshots only)
-- ============================================================
-- - total_value / total_cost คำนวณฝั่งแอปจาก holdings_with_returns ตอนที่
--   หน้าแรกโหลดสำเร็จ (SUM ของ market_value / cost_basis ทุก asset ใน
--   พอร์ตนั้น ณ ตอนนั้น) ไม่ได้ query ย้อนหลังจาก transactions+prices —
--   เก็บ snapshot ไว้ล่วงหน้าง่ายและเร็วกว่าตอนวาดกราฟทีหลัง
-- - cash_value ต้องรู้ asset_type ของแต่ละ holding ซึ่ง holdings/
--   holdings_with_returns view ไม่มีคอลัมน์นี้ (ไม่แก้ view เดิม) แอปจึง
--   query asset_type จาก assets แยกอีกครั้งตอนคำนวณ snapshot เท่านั้น
-- - Auto-snapshot (เปิดหน้าแรก): เช็คก่อนว่าวันนี้มีแถวหรือยัง มีแล้วไม่
--   ต้องเขียนซ้ำ ทำเงียบๆ ไม่โชว์ error ถ้าล้มเหลว (เหมือน crypto
--   auto-refresh) — ต่างจากปุ่ม "Save today's value" ที่ upsert ทับเสมอ
--   (ผู้ใช้ตั้งใจกดเพื่ออัปเดตด้วยราคาระหว่างวันล่าสุด) และโชว์
--   success/error ให้เห็น
