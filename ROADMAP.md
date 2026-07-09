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

## Phase 4 — history & benchmark (done)
`portfolio_snapshots` (done), the growth/trend chart on Holdings (done,
using `recharts`), XIRR / money-weighted annualized return (done,
`src/lib/xirr.ts`), and drift-threshold alerts (done, `src/lib/drift.ts`
— quiet badges/banner on Overview and Holdings, reusing the Rebalancing
page's own drift formula) — benchmark comparison (SET, S&P 500) —
considered and dropped, see DECISIONS.md.

## Phase 5 — Thai tax & live prices (in progress)
RMF/SSF/ThaiESG holding-period tracking (done — `src/lib/taxHolding.ts`,
`user_settings` table for birth date, badges in the History modal) —
still to come: live price APIs for Thai funds/stocks (dividend tax
withholding was already handled earlier, in Phase 3).

## Phase 6 — LLM / wiki
LLM-assisted analysis over the structured data.
_(original requirement #4)_

On hold — paused, not dropped. Revisit once there's clearer scope for
what the LLM feature should actually do.

## Phase 7 — Auth & Row Level Security (step 1 done, in progress)
Turn on for real once you want to share the URL with someone else, or
start worrying about data security — right now anyone with the URL +
publishable key can read/write everything (see GOTCHAS.md #2).

- **Step 1 (done)**: login/signup UI (Supabase Auth, email/password —
  `/login`, `/signup`, logout in the nav bar) + schema prep
  (`migrations/0007_add_auth_user_id.sql`, not yet applied to the live
  database — see DECISIONS.md). No OAuth yet. **No route protection or
  redirect** — every page still works fully logged-out, unchanged from
  before. RLS still off.
- **Step 2 (not started)**: enable the RLS policy
  `auth.uid() = portfolios.user_id` (scaffold noted in ARCHITECTURE.md),
  and the equivalent for `user_settings`.
- **Step 3 (not started)**: migrate existing data (current seed data,
  and anything added under single-user dev) to a real `user_id`, then
  make `portfolios.user_id` / `user_settings.user_id` `not null`.
- **Step 4 (not started)**: add route protection (redirect logged-out
  users away from portfolio-scoped pages) — deliberately deferred until
  after step 3, so protection doesn't lock out access to real data
  before it has a real owner assigned.
- Still to decide: genuinely multi-user, or still single-user but gated
  behind a login so randoms with the URL can't get in.
