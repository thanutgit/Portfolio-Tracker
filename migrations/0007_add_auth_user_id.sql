-- ============================================================
-- Portfolio Tracker — Migration 0007: Auth prep, step 1 (Phase 7)
-- เตรียม schema สำหรับ Supabase Auth เท่านั้น — ยังไม่เปิด RLS,
-- ยังไม่บังคับ user_id (not null), ยังไม่ย้ายข้อมูลจริงให้มีเจ้าของ
-- ขั้นเหล่านั้นทำแยกในรอบถัดไป หลัง auth ใช้งานได้จริงแล้ว
-- ============================================================


-- ------------------------------------------------------------
-- 1) portfolios.user_id — ผูกกับ auth.users
--    คอลัมน์นี้มีอยู่แล้วตั้งแต่ 0001_init.sql (uuid, nullable, ไม่มี FK)
--    migration นี้แค่เพิ่ม foreign key ผูกกับ auth.users ให้จริง
--    ยังคง nullable ไว้ก่อน — จะบังคับ not null ตอน migrate ข้อมูลจริง
--    (เมื่อ user เดิมถูก assign เจ้าของครบทุกแถวแล้ว)
--
--    on delete set null (ไม่ใช่ cascade): ถ้า auth user ถูกลบ ไม่อยากให้
--    ข้อมูลการเงิน (portfolios + transactions ที่ผูกกับมันผ่าน cascade
--    ต่อ) หายไปด้วย — portfolio จะกลายเป็น "ไม่มีเจ้าของ" แทน ไม่ใช่ถูกลบ
--    (ทางเลือกนี้เป็นจุดตัดสินใจ ดู DECISIONS.md)
-- ------------------------------------------------------------
alter table portfolios
    add constraint portfolios_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;


-- ------------------------------------------------------------
-- 2) user_settings — เปลี่ยนจาก single-row เป็นผูกกับ user_id
--    เดิม (0006): ไม่มี user_id เลย ใช้เป็นแถวเดียวสำหรับผู้ใช้คนเดียว
--    ตอนนี้: เพิ่ม user_id (nullable ไว้ก่อน เหมือน portfolios) +
--    unique constraint ต่อ user (unique อนุญาตหลาย NULL ได้ตามปกติของ
--    Postgres จึงไม่กระทบแถวเดิมที่ยังไม่มี user_id)
--
--    on delete cascade (ต่างจาก portfolios): user_settings เป็นแค่
--    ข้อมูลส่วนตัวเบาๆ (วันเกิด) ผูก 1:1 กับ user โดยตรง ไม่ใช่ข้อมูล
--    การเงินที่ต้องรักษาไว้ ถ้า user ถูกลบ ลบ settings ไปด้วยเลยสมเหตุสมผล
-- ------------------------------------------------------------
alter table user_settings
    add column user_id uuid references auth.users(id) on delete cascade;

alter table user_settings
    add constraint user_settings_user_id_key unique (user_id);


-- ============================================================
-- ยังไม่ทำในรอบนี้ (ตั้งใจ, ทำในขั้นถัดไปของ Phase 7):
-- ============================================================
-- - ยังไม่เปิด row level security (rls) บนตารางไหนทั้งสิ้น
-- - ยังไม่บังคับ portfolios.user_id / user_settings.user_id เป็น not null
-- - ยังไม่ assign เจ้าของให้ข้อมูลจริงที่มีอยู่ (seed_data.sql เดิม)
-- - assets, prices ไม่แก้ในรอบนี้ (ใช้ร่วมกันทุก user ตามที่ตกลง)
