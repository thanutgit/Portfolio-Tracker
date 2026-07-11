-- ============================================================
-- Portfolio Tracker — Migration 0010: Enable RLS (Phase 7 step 2)
-- ต้องรัน 0007 → 0008 → 0009 ให้เสร็จก่อน (portfolios.user_id ต้อง
-- not null และ backfill ครบทุกแถวแล้ว) ไม่งั้นเปิด RLS แล้ว portfolio
-- ที่ยังไม่มีเจ้าของจะหายไปจากทุกคนทันที (auth.uid() ไม่มีทาง match
-- user_id ที่เป็น null ได้)
-- ============================================================
-- ตารางที่ผูกกับ user โดยตรง (มีคอลัมน์ user_id เอง): portfolios,
-- user_settings — policy เช็ค auth.uid() = user_id ตรงๆ
--
-- ตารางที่ผูกกับ user ทางอ้อม (ผ่าน portfolio_id ไม่มี user_id เอง):
-- transactions, targets, portfolio_snapshots — policy เช็คผ่าน subquery
-- ไปที่ portfolios.user_id
--
-- assets, prices: ไม่เปิด RLS — ใช้ร่วมกันทุก user ตามที่ตกลงไว้ตั้งแต่
-- Phase 7 step 1 (ดู ARCHITECTURE.md, DECISIONS.md)
-- ============================================================


-- ------------------------------------------------------------
-- portfolios — เจ้าของตรง
-- ------------------------------------------------------------
alter table portfolios enable row level security;

create policy "own portfolios" on portfolios
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);


-- ------------------------------------------------------------
-- user_settings — เจ้าของตรง
-- ------------------------------------------------------------
alter table user_settings enable row level security;

create policy "own user_settings" on user_settings
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);


-- ------------------------------------------------------------
-- transactions — เจ้าของทางอ้อม ผ่าน portfolios.user_id
-- ------------------------------------------------------------
alter table transactions enable row level security;

create policy "own transactions" on transactions
    for all
    using (auth.uid() = (select user_id from portfolios where id = portfolio_id))
    with check (auth.uid() = (select user_id from portfolios where id = portfolio_id));


-- ------------------------------------------------------------
-- targets — เจ้าของทางอ้อม ผ่าน portfolios.user_id
-- ------------------------------------------------------------
alter table targets enable row level security;

create policy "own targets" on targets
    for all
    using (auth.uid() = (select user_id from portfolios where id = portfolio_id))
    with check (auth.uid() = (select user_id from portfolios where id = portfolio_id));


-- ------------------------------------------------------------
-- portfolio_snapshots — เจ้าของทางอ้อม ผ่าน portfolios.user_id
-- ------------------------------------------------------------
alter table portfolio_snapshots enable row level security;

create policy "own portfolio_snapshots" on portfolio_snapshots
    for all
    using (auth.uid() = (select user_id from portfolios where id = portfolio_id))
    with check (auth.uid() = (select user_id from portfolios where id = portfolio_id));


-- ============================================================
-- ตรวจสอบหลังรัน (ทำตอน login ด้วย account จริงในแอป ไม่ใช่ SQL Editor
-- ซึ่งใช้ secret key ที่ bypass RLS อยู่แล้ว จะเช็คไม่ได้ผลจริง):
-- ============================================================
-- - เข้า /login ด้วย account จริง แล้วเช็คว่า Overview เห็นพอร์ตครบ
--   ทุกพอร์ตเหมือนก่อนเปิด RLS
-- - เปิดแต่ละพอร์ต เช็ค Holdings/Targets/Rebalancing/portfolio_snapshots
--   (trend chart) เห็นข้อมูลครบ ไม่มีแถวหายไป
