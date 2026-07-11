-- ============================================================
-- Portfolio Tracker — Migration 0009: portfolios.user_id NOT NULL (Phase 7 step 2)
-- แยกจาก 0008 โดยตั้งใจ — ถ้า backfill พลาด (ยังมีแถว user_id เป็น null
-- หลงเหลือ) การรันไฟล์นี้จะ error ทันที (constraint violation) แทนที่
-- จะไปพังตอนรวมกับ update ในไฟล์เดียวกัน ทำให้เห็นปัญหาชัดเจนกว่า
-- ============================================================
-- ก่อนรันไฟล์นี้ ต้องเช็คว่า 0008 backfill ครบจริงก่อน:
--   select count(*) from portfolios where user_id is null;   -- ต้องได้ 0
-- ถ้าไม่ใช่ 0 ห้ามรันไฟล์นี้ — กลับไปแก้ 0008 ให้ครบก่อน
--
-- หมายเหตุ: ตั้งใจบังคับ not null เฉพาะ portfolios.user_id ตามที่สั่งไว้
-- user_settings.user_id ยังคง nullable ต่อไป (ดู DECISIONS.md ถ้าอยากคง
-- ความสม่ำเสมอ อาจบังคับ not null ตัวนี้ด้วยในอนาคต — ไม่ทำตอนนี้เพราะ
-- ไม่ได้อยู่ใน scope ที่สั่ง)
-- ============================================================

alter table portfolios
    alter column user_id set not null;
