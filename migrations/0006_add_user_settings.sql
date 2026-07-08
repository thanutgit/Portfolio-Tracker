-- ============================================================
-- Migration 0006: user_settings (Phase 5 — RMF holding-period age check)
-- ============================================================
-- เก็บวันเกิดผู้ใช้ ใช้เช็คเงื่อนไขอายุ 55 ปีของ RMF เท่านั้น (SSF/
-- ThaiESG ไม่มีเงื่อนไขอายุ) ยังไม่มีระบบ auth ตอนนี้ (ดู ROADMAP.md
-- Phase 7) จึงยังไม่ผูกกับ user_id จริง — ใช้เป็น "single row" สำหรับ
-- ผู้ใช้คนเดียวตอนนี้ก็พอ ไม่ต้องซับซ้อน
-- ============================================================

create table user_settings (
    id         uuid primary key default gen_random_uuid(),
    birth_date date,                                   -- nullable — ผู้ใช้ยังไม่กรอกได้
    created_at timestamptz not null default now()
);

-- ไม่มี unique constraint บังคับ "แถวเดียว" ในระดับ DB โดยตั้งใจ —
-- แอปฝั่ง client จัดการเอง (select ... limit 1 มาก่อน ถ้ามีแล้ว update
-- ถ้ายังไม่มี insert) ง่ายกว่าและพอสำหรับ single-user dev ตอนนี้
