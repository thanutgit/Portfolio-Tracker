# Roadmap

Build one phase at a time. Do NOT build a later phase unless explicitly asked.

## Phase 1 — core (done)
Multiple portfolios, add assets, record transactions, enter prices manually,
display holdings with P&L.
_(covers original requirements: multiple portfolios + price tracking)_

## Phase 2 — rebalancing (in progress)
`targets` table (desired % per asset or per group). Compute drift and how much
to buy/sell — in % AND in baht/units. Allocation pie: current vs target.
_(original requirement #3)_

## Phase 3 — accurate returns (mostly done)
Dividends / total return, CSV/paste price import, multi-dimension
allocation (sector / country) — all done. Multi-currency + FX, and
allocation by currency, deliberately not done yet: every asset is THB
today, so there's nothing to convert or break out by currency until a
non-THB holding exists.

## Phase 4 — history & benchmark (in progress)
`portfolio_snapshots` (done), the growth/trend chart on Holdings (done,
using `recharts`), XIRR / money-weighted annualized return (done,
`src/lib/xirr.ts`), and drift-threshold alerts (done, `src/lib/drift.ts`
— quiet badges/banner on Overview and Holdings, reusing the Rebalancing
page's own drift formula) — still to come: benchmark comparison (SET,
S&P 500).

## Phase 5 — Thai tax & live prices (in progress)
RMF/SSF/ThaiESG holding-period tracking (done — `src/lib/taxHolding.ts`,
`user_settings` table for birth date, badges in the History modal) —
still to come: live price APIs for Thai funds/stocks (dividend tax
withholding was already handled earlier, in Phase 3).

## Phase 6 — LLM / wiki
LLM-assisted analysis over the structured data.
_(original requirement #4)_

## Phase 7 — Auth & Row Level Security
Turn on for real once you want to share the URL with someone else, or
start worrying about data security — right now anyone with the URL +
publishable key can read/write everything (see GOTCHAS.md #2).

- Add login (Supabase Auth built-in — email/password or OAuth).
- Enable the RLS policy `auth.uid() = portfolios.user_id` (the scaffold
  is already noted in ARCHITECTURE.md).
- Migrate existing data (current seed data, and anything added under
  single-user dev) to a real `user_id`.
- Decide: genuinely multi-user, or still single-user but gated behind a
  login so randoms with the URL can't get in.
