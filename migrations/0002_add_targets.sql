-- ============================================================
-- Portfolio Tracker — Migration 0002: Rebalancing targets (Phase 2)
-- เพิ่มตาราง targets สำหรับตั้งเป้าสัดส่วน (%) ต่อ asset ต่อพอร์ต
-- ============================================================


-- ------------------------------------------------------------
-- targets — เป้าสัดส่วน (%) ของแต่ละ asset ในพอร์ต ใช้คำนวณ rebalancing
--   target_pct       = สัดส่วนเป้าหมาย (0-100) ของ asset นี้ในพอร์ต
--   drift_threshold  = ส่วนต่าง (%) ที่ยอมรับได้ก่อนต้องปรับพอร์ต
--                      ไม่ตั้งไว้ = ใช้ default 5%
-- ------------------------------------------------------------
create table targets (
    id              uuid primary key default gen_random_uuid(),
    portfolio_id    uuid not null references portfolios(id) on delete cascade,
    asset_id        uuid not null references assets(id)     on delete cascade,
    target_pct      numeric(5,2) not null
                    check (target_pct >= 0 and target_pct <= 100),
    drift_threshold numeric(5,2) not null default 5.00
                    check (drift_threshold >= 0),
    created_at      timestamptz not null default now(),
    unique (portfolio_id, asset_id)                        -- 1 target ต่อ asset ต่อพอร์ต
);

create index idx_targets_portfolio on targets(portfolio_id);


-- ============================================================
-- หมายเหตุการออกแบบ (Phase 2)
-- ============================================================
-- - ตั้ง target เป็นรายสินทรัพย์ (per-asset) เท่านั้น ยังไม่รองรับ target
--   แบบกลุ่ม (เช่น ตามประเภทสินทรัพย์ / sector) — ถ้าต้องการภายหลัง ค่อยเพิ่ม
--   ตาราง target_groups แยกต่างหาก ไม่กระทบ schema นี้
-- - หน้า UI จะให้ตั้ง target เฉพาะ asset ที่พอร์ตนั้นถืออยู่จริงเท่านั้น
--   (บังคับจากฝั่งแอป ไม่ใช่ constraint ในตารางนี้) — ถ้าขายหมดในภายหลัง
--   แถว target เดิมจะยังอยู่ และหน้า rebalancing จะตีความว่าเป็น "เป้าที่ยัง
--   ไม่ได้ซื้อ" (current % = 0)
