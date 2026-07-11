-- ============================================================
-- Portfolio Tracker — Migration 0008: Backfill owner user_id (Phase 7 step 2)
-- ต้องรัน 0007_add_auth_user_id.sql ก่อน (เพิ่มคอลัมน์ user_id ให้
-- portfolios/user_settings แล้ว — migration นี้แค่ "เติม" ค่าให้แถวเดิม
-- ที่ยังเป็น null ทั้งหมด ผูกกับบัญชี auth จริงบัญชีเดียวที่มีอยู่ตอนนี้
-- ============================================================
-- ยังไม่บังคับ not null ในไฟล์นี้ (แยกไปทำใน 0009 หลังเช็คว่า backfill
-- ครบจริง) และยังไม่เปิด RLS (แยกไปทำใน 0010)
-- ============================================================


-- ------------------------------------------------------------
-- ทางเลือกที่ 1 (ค่าเริ่มต้น ใช้บล็อกด้านล่างนี้ได้เลย):
-- ดึง user_id จาก auth.users อัตโนมัติ — ปลอดภัยเฉพาะตอนที่มี auth user
-- อยู่ "พอดี 1 คน" เท่านั้น (ตรงกับสถานการณ์ตอนนี้) บล็อกนี้เช็คก่อนว่า
-- มี auth.users กี่แถว ถ้าไม่ใช่ 1 แถวพอดี จะ raise exception ทันที
-- (ไม่ backfill มั่ว) กันกรณีมีการสร้าง user ที่ 2 ขึ้นมาระหว่างทางแล้ว
-- ลืมไป จะได้ไม่ assign ข้อมูลผิดเจ้าของแบบเงียบๆ
-- ------------------------------------------------------------
do $$
declare
    user_count int;
begin
    select count(*) into user_count from auth.users;
    if user_count <> 1 then
        raise exception
            'Expected exactly 1 row in auth.users, found %. Resolve manually (see the commented-out manual option below) before backfilling.',
            user_count;
    end if;
end $$;

update portfolios
set user_id = (select id from auth.users limit 1)
where user_id is null;

update user_settings
set user_id = (select id from auth.users limit 1)
where user_id is null;


-- ------------------------------------------------------------
-- ทางเลือกที่ 2 (ใช้แทนบล็อกด้านบน ถ้าไม่อยากพึ่ง "มี user พอดี 1 คน"
-- หรือถ้ามีมากกว่า 1 คนจริงๆ และรู้ว่าต้องการ assign ให้คนไหน):
-- หา UUID เอง — Supabase Dashboard → Authentication → Users → คลิก
-- บัญชีของคุณ → copy ค่า "User UID" แล้วแทนที่ 'PASTE-YOUR-UUID-HERE'
-- ด้านล่าง (ลบ comment ออกก่อนรัน และคอมเมนต์บล็อก do $$ ... $$ ด้านบน
-- ทิ้งไป จะได้ไม่รันซ้ำสองรอบ):
-- ------------------------------------------------------------
-- update portfolios
-- set user_id = 'PASTE-YOUR-UUID-HERE'
-- where user_id is null;
--
-- update user_settings
-- set user_id = 'PASTE-YOUR-UUID-HERE'
-- where user_id is null;


-- ------------------------------------------------------------
-- ตรวจสอบหลังรัน (ควรได้ 0 ทั้งคู่ก่อนไปต่อที่ 0009):
-- ------------------------------------------------------------
-- select count(*) from portfolios where user_id is null;
-- select count(*) from user_settings where user_id is null;
