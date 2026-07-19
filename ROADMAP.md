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
allocation (sector / country) — all done. Multi-currency: settled on
**one portfolio = one currency**, enforced by validation in
`TransactionModal` (picking an existing asset or creating a new one both
block a currency mismatch against the portfolio's `base_currency`) — see
ARCHITECTURE.md's "Multi-currency approach (current)" and DECISIONS.md
D136-D140. Two earlier directions were tried and fully removed: capturing
an FX rate per transaction (D119-D126, doesn't match real usage — FX is
exchanged well before/after the actual trade) and converting mixed
currencies for display (D127-D135, removed by D141 because no real
mixed-currency data exists to support and prevention is simpler than
reconciliation — `src/lib/fx.ts`, `/api/fx-rate`, and all related UI are
gone from the codebase, confirmed by repo-wide grep). No schema change —
`assets` isn't portfolio-scoped in the DB, so this is UI/app-layer
validation only; `transactions.fx_rate_to_base` (migration 0014) stays
in the schema, unused. Allocation by currency still not started.

Realized gain via FIFO — built and verified (src/lib/realizedGain.ts,
confirmed against real PRINCIPAL VNEQ-A 23-transaction history), but
hidden behind a feature flag (SHOW_REALIZED_GAIN = false in
holdings/page.tsx) — the user decided they don't need to see it since
they're not an active trader. Flip the flag to re-enable; no rework
needed. See DECISIONS.md D145-D148.

## Phase 4 — history & benchmark (done)
`portfolio_snapshots` (done), the growth/trend chart on Holdings (done,
using `recharts`), XIRR / money-weighted annualized return (done,
`src/lib/xirr.ts`), and drift-threshold alerts (done, `src/lib/drift.ts`
— quiet badges/banner on Overview and Holdings, reusing the Rebalancing
page's own drift formula) — benchmark comparison (SET, S&P 500) —
considered and dropped, see DECISIONS.md.

The auto-snapshot write mechanism went through several rounds
(D36/D37 → D149/D150 → D151/D152) before settling on its current form:
one periodic 60s check on the Holdings page, no other trigger sites, and
no manual "Save today's value" button (removed in D152).

## Phase 5 — Thai tax & live prices (in progress)
RMF/SSF/ThaiESG holding-period tracking (done — `src/lib/taxHolding.ts`,
`user_settings` table for birth date, badges in the History modal) —
still to come: live price API for Thai funds only (foreign stocks now
auto-fetch via Finnhub, crypto via CoinGecko — done) (dividend tax
withholding was already handled earlier, in Phase 3).

## Phase 6 — LLM / wiki
LLM-assisted analysis over the structured data.
_(original requirement #4)_

On hold — paused, not dropped. Revisit once there's clearer scope for
what the LLM feature should actually do.

## Phase 7 — Auth & Row Level Security (done)
Turned on for real — RLS is on, so it's no longer true that anyone with
the URL + publishable key can read/write everything (see GOTCHAS.md #2,
now historical).

- **Step 1 (done)**: login/signup UI (Supabase Auth, email/password —
  `/login`, `/signup`, logout in the nav bar) + schema prep
  (`migrations/0007_add_auth_user_id.sql`, applied). No OAuth yet.
- **Step 2 (done)**: route protection (`<RequireAuth>` on every page
  except `/login`/`/signup`, `useRedirectIfAuthed()` on those two — see
  ARCHITECTURE.md) is live in code. The data/RLS side —
  `migrations/0008_backfill_owner_user_id.sql` (assigned existing rows
  to the one real account), `0009_portfolios_user_id_not_null.sql`, and
  `0010_enable_rls.sql` (RLS on `portfolios`/`user_settings`/
  `transactions`/`targets`/`portfolio_snapshots`; `assets`/`prices` stay
  open) — all applied and verified: logging in with the real account
  shows every portfolio's full data (holdings, transactions, targets,
  snapshots) intact.
- **Password reset / "forgot password" flow (done)** — `/forgot-password`
  and `/reset-password`, same password-validation checklist as
  `/signup`. See ARCHITECTURE.md's Auth section for the full flow.
- **Genuinely multi-user already works** — RLS scopes every
  user-owned table to `auth.uid()`, so a second real signup would get
  their own isolated portfolios/transactions/etc. today, not just a
  gate in front of one shared dataset. What's left is optional
  polish, not a blocking decision:
  - No OAuth (Google, etc.) — email/password only.
  - No complete email-confirmation UX — `/signup` shows a "check your
    email" message if the Supabase project requires confirmation, but
    there's no resend-confirmation link, no dedicated
    "confirmed!"/error landing page for the confirmation link itself,
    and no handling for an expired confirmation link.
  - No account settings (change email, change password, delete
    account).
  - `assets`/`prices` stay shared across all users by design (not
    per-user) — revisit only if that assumption ever needs to change.
