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

## Phase 7 — Auth & Row Level Security (step 2 in progress — migrations not yet applied)
Turn on for real once you want to share the URL with someone else, or
start worrying about data security — right now anyone with the URL +
publishable key can read/write everything (see GOTCHAS.md #2). This
stops being true only once 0008/0009/0010 below are actually applied.

- **Step 1 (done)**: login/signup UI (Supabase Auth, email/password —
  `/login`, `/signup`, logout in the nav bar) + schema prep
  (`migrations/0007_add_auth_user_id.sql`, not yet applied to the live
  database — see DECISIONS.md). No OAuth yet.
- **Step 2 (code done, migrations prepared but NOT applied)**: route
  protection (`<RequireAuth>` on every page except `/login`/`/signup`,
  `useRedirectIfAuthed()` on those two — see ARCHITECTURE.md) is live in
  code as of this round. The data/RLS side —
  `migrations/0008_backfill_owner_user_id.sql` (assign existing rows to
  the one real account), `0009_portfolios_user_id_not_null.sql`, and
  `0010_enable_rls.sql` (RLS on `portfolios`/`user_settings`/
  `transactions`/`targets`/`portfolio_snapshots`; `assets`/`prices` stay
  open) — is written and reviewed but **deliberately not yet run against
  the live database**. Next: apply 0008 → 0009 → 0010 in order, then
  confirm logging in with the real account still shows every portfolio's
  full data (holdings, transactions, targets, snapshots) before treating
  this step as complete.
- Still to decide: genuinely multi-user, or still single-user but gated
  behind a login so randoms with the URL can't get in.
