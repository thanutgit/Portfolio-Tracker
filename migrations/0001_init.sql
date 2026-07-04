-- ============================================================
-- Portfolio Tracker — Phase 1 Schema (PostgreSQL)
-- ใช้ได้กับ Supabase / Neon / Postgres ในเครื่อง
-- ครอบคลุม: หลายพอร์ต, บันทึกซื้อขาย, ราคาล่าสุด, คำนวณ holdings อัตโนมัติ
-- ============================================================
-- แนวคิดหลัก: เราไม่เก็บ "ยอดถือครอง" ตรง ๆ
-- ยอดถือครอง (holdings) คำนวณสดจากตาราง transactions
-- ============================================================


-- ------------------------------------------------------------
-- 1) portfolios — พอร์ตการลงทุน (มีได้หลายพอร์ต)
-- ------------------------------------------------------------
create table portfolios (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid,                              -- เจ้าของพอร์ต (map กับ auth.users ของ Supabase)
    name          text not null,                     -- เช่น 'พอร์ตหุ้นไทย', 'พอร์ต DCA กองทุน'
    base_currency char(3) not null default 'THB',    -- สกุลหลักของพอร์ต
    created_at    timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 2) assets — สินทรัพย์ (ตารางกลาง ใช้ร่วมทุกพอร์ต)
--    1 แถว = 1 หุ้น/กองทุน/เงินสด
-- ------------------------------------------------------------
create table assets (
    id          uuid primary key default gen_random_uuid(),
    symbol      text not null,                       -- PTT, CPALL, AAPL, SCBS&P500-A
    name        text not null,
    asset_type  text not null default 'stock'
                check (asset_type in ('stock','etf','fund','bond','cash')),
    market      text,                                -- SET, mai, NYSE, NASDAQ, null (กองทุน/เงินสด)
    currency    char(3) not null default 'THB',      -- สกุลของสินทรัพย์ตัวนี้
    sector      text,                                -- (optional) ไว้ทำ allocation ภายหลัง
    country     text,                                -- (optional)
    tax_bucket  text not null default 'normal'
                check (tax_bucket in ('normal','RMF','SSF','ThaiESG')),
    created_at  timestamptz not null default now(),
    unique (symbol, market)                          -- กันสร้าง asset ซ้ำ
);


-- ------------------------------------------------------------
-- 3) transactions — รายการซื้อขาย (★ แหล่งความจริง)
--    ทุกอย่างคำนวณจากตารางนี้
--    quantity เก็บเป็นบวกเสมอ แล้วดูความหมายจาก type
-- ------------------------------------------------------------
create table transactions (
    id           uuid primary key default gen_random_uuid(),
    portfolio_id uuid not null references portfolios(id) on delete cascade,
    asset_id     uuid not null references assets(id)     on delete restrict,
    type         text not null
                 check (type in ('buy','sell','dividend','fee','deposit','withdraw','split')),
    trade_date   date not null,
    quantity     numeric(20,6) not null default 0,       -- จำนวนหุ้น/หน่วย (บวกเสมอ)
    price        numeric(20,6) not null default 0,       -- ราคาต่อหน่วย (สกุลของ asset)
    fee          numeric(20,6) not null default 0,       -- ค่าคอมมิชชั่น
    tax          numeric(20,6) not null default 0,       -- เช่น หัก ณ ที่จ่ายปันผล 10%
    fx_rate      numeric(20,10) not null default 1,      -- อัตราแลกเป็น base_currency ณ วันนั้น
    note         text,
    created_at   timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 4) prices — ราคาล่าสุดของสินทรัพย์
--    เก็บได้หลายแถวต่อ asset (เก็บประวัติ) ใช้แถวล่าสุดตอนคำนวณ
-- ------------------------------------------------------------
create table prices (
    id        uuid primary key default gen_random_uuid(),
    asset_id  uuid not null references assets(id) on delete cascade,
    price     numeric(20,6) not null,
    as_of     timestamptz not null default now(),
    source    text not null default 'manual'
              check (source in ('manual','csv','api'))
);


-- ------------------------------------------------------------
-- Indexes — ทำให้ query เร็ว
-- ------------------------------------------------------------
create index idx_tx_portfolio      on transactions(portfolio_id);
create index idx_tx_asset          on transactions(asset_id);
create index idx_tx_date           on transactions(trade_date);
create index idx_prices_asset_asof on prices(asset_id, as_of desc);
create index idx_portfolios_user   on portfolios(user_id);


-- ============================================================
-- VIEWS — ส่วนที่ "คำนวณ holdings ให้เอง"
-- ============================================================

-- ราคาล่าสุดต่อ asset (เอาแถว as_of ใหม่สุด)
create view latest_prices as
select distinct on (asset_id)
    asset_id, price, as_of
from prices
order by asset_id, as_of desc;


-- holdings — ยอดถือครอง + ต้นทุนเฉลี่ย + กำไร/ขาดทุน (คำนวณสด)
--
-- หมายเหตุเรื่องต้นทุนเฉลี่ย (weighted average):
--   การขายไม่เปลี่ยนต้นทุนเฉลี่ยต่อหน่วย ดังนั้น
--   ต้นทุนเฉลี่ยของหน่วยที่เหลือ = (ต้นทุนซื้อทั้งหมด) / (จำนวนที่ซื้อทั้งหมด)
--   วิธีนี้รองรับ DCA หลายสิบงวดได้อัตโนมัติ
create view holdings as
select
    h.portfolio_id,
    h.asset_id,
    h.symbol,
    h.name,
    h.currency,
    h.quantity,
    h.avg_cost,
    h.last_price,
    h.quantity * h.avg_cost                          as cost_basis,     -- ต้นทุนรวม
    h.market_value,                                                     -- มูลค่าตลาด
    h.market_value - (h.quantity * h.avg_cost)       as unrealized_pnl, -- กำไร/ขาดทุนที่ยังไม่รับรู้
    case when h.quantity * h.avg_cost = 0 then null
         else (h.market_value - h.quantity * h.avg_cost)
              / (h.quantity * h.avg_cost) * 100
    end                                              as unrealized_pct  -- % กำไร/ขาดทุน
from (
    select
        t.portfolio_id,
        t.asset_id,
        a.symbol,
        a.name,
        a.currency,
        -- จำนวนสุทธิ = ซื้อ - ขาย
        sum(case when t.type = 'buy'  then t.quantity
                 when t.type = 'sell' then -t.quantity
                 else 0 end)                                 as quantity,
        -- ต้นทุนเฉลี่ย = ต้นทุนซื้อรวม (รวมค่าธรรมเนียม) / จำนวนที่ซื้อ
        sum(case when t.type = 'buy' then t.quantity * t.price + t.fee
                 else 0 end)
          / nullif(sum(case when t.type = 'buy' then t.quantity else 0 end), 0)
                                                             as avg_cost,
        lp.price                                             as last_price,
        sum(case when t.type = 'buy'  then t.quantity
                 when t.type = 'sell' then -t.quantity
                 else 0 end) * lp.price                      as market_value
    from transactions t
    join assets a         on a.id = t.asset_id
    left join latest_prices lp on lp.asset_id = t.asset_id
    group by t.portfolio_id, t.asset_id, a.symbol, a.name, a.currency, lp.price
    -- ตัดตัวที่ขายหมดแล้ว (quantity = 0) ออกจากรายการถือครอง
    having sum(case when t.type = 'buy'  then t.quantity
                    when t.type = 'sell' then -t.quantity
                    else 0 end) <> 0
) h;


-- ============================================================
-- ตัวอย่างการใช้งาน (ลบออกได้ / รันเพื่อทดสอบ)
-- ============================================================

-- สร้างพอร์ต
-- insert into portfolios (name) values ('พอร์ต DCA กองทุน');

-- สร้าง asset
-- insert into assets (symbol, name, asset_type, currency)
-- values ('SCBS&P500', 'SCB S&P 500', 'fund', 'THB');

-- (A) ของเก่าที่ DCA มาแล้ว = OPENING BALANCE แค่ 1 บรรทัด
--     ใส่ จำนวนหน่วยรวม + ต้นทุนเฉลี่ย ที่แอปกองทุนโชว์
-- insert into transactions (portfolio_id, asset_id, type, trade_date, quantity, price)
-- values (
--   (select id from portfolios where name = 'พอร์ต DCA กองทุน'),
--   (select id from assets     where symbol = 'SCBS&P500'),
--   'buy', '2026-01-01', 1000, 18.50   -- เช่น ถือ 1000 หน่วย ต้นทุนเฉลี่ย 18.50
-- );

-- (B) งวด DCA ใหม่ที่ซื้อเพิ่ม = อีก 1 บรรทัดต่องวด
-- insert into transactions (portfolio_id, asset_id, type, trade_date, quantity, price)
-- values (
--   (select id from portfolios where name = 'พอร์ต DCA กองทุน'),
--   (select id from assets     where symbol = 'SCBS&P500'),
--   'buy', '2026-02-01', 158.73, 18.90  -- ซื้อเพิ่ม 3,000 บาท ได้ 158.73 หน่วย
-- );

-- ใส่ราคา NAV ล่าสุด
-- insert into prices (asset_id, price, source)
-- values ((select id from assets where symbol = 'SCBS&P500'), 19.40, 'manual');

-- ดูผลลัพธ์ (ต้นทุนเฉลี่ย + กำไร/ขาดทุน คำนวณให้อัตโนมัติ)
-- select symbol, quantity, avg_cost, last_price, unrealized_pnl, unrealized_pct
-- from holdings;


-- ============================================================
-- หมายเหตุถ้าใช้ SQLite แทน Postgres (ตอนทำในเครื่อง)
-- ============================================================
-- - uuid + gen_random_uuid()  ->  ใช้ text แล้วให้แอปสร้าง id เอง (เช่น uuid v4)
-- - timestamptz               ->  ใช้ text/datetime แทน
-- - numeric(20,6)             ->  ใช้ numeric หรือ real
-- - distinct on (...)         ->  SQLite ไม่มี ใช้ window function
--                                 (row_number() over ... order by as_of desc) แทน
-- - check constraint ใช้ได้ปกติ, foreign key ต้องเปิด PRAGMA foreign_keys = ON;


-- ============================================================
-- (ทางเลือก) Row Level Security — เปิดตอน deploy บน Supabase
-- ให้ผู้ใช้เห็นเฉพาะพอร์ตของตัวเอง เพิ่มทีหลังได้เมื่อมีระบบ login
-- ============================================================
-- alter table portfolios enable row level security;
-- create policy "own portfolios" on portfolios
--   for all using (auth.uid() = user_id);
