# Portfolio Tracker

A personal investment portfolio tracker for Thai and international stocks
and funds — live holdings with unrealized P&L, dividend-inclusive total
return, time-weighted annualized return (XIRR), a portfolio value trend
chart, sector/country allocation, rebalancing calculations, drift-threshold
alerts, and holding-period tracking for Thai tax-advantaged funds
(RMF/SSF/ThaiESG). Built for the Thai market (SET/mai, THB) but also
supports foreign assets and crypto.

🔗 **Live:** https://portfolio-tracker-umber-six.vercel.app

---

## What this project does

A tool for anyone holding stocks/funds/crypto across multiple portfolios who
wants to know:
- What am I holding right now, at what value, and what's my gain/loss
  (with or without dividends)?
- What's my real annualized return, accounting for how long each chunk of
  money has actually been invested?
- How has my portfolio grown over time?
- How is my portfolio spread across sectors/countries?
- How far off is my current allocation from my target, and exactly what
  should I buy/sell (in currency and units) to fix it?
- For each RMF/SSF/ThaiESG lot I've bought, has it met the tax holding-period
  requirement yet?

Everything is manageable directly from the web UI — creating/editing/deleting
portfolios, assets, transactions, dividends, and prices — no SQL Editor
needed for day-to-day use.

See `ROADMAP.md` for what's done, in progress, and not started.

---

## Core design principle (important)

**Holdings are never stored directly — they're computed from a transaction
ledger.**

Instead of storing "holds 100 shares of PTT," the app records every buy/sell
as a ledger row (`transactions`) and computes current quantity, average cost,
gain/loss, and annualized return from that. This is what makes correct
weighted-average cost, realized P&L on partial sells, dividend-inclusive
return, and DCA history all work correctly — something a simple "current
balance" table can't do. Full reasoning in `DECISIONS.md` D1–D6.

---

## Current features

### Portfolios & holdings
- Multiple portfolios — create/edit/delete from the UI
- Overview page listing every portfolio with its value, return %, and any
  drift warning, all in one place
- Quantity/average cost/gain-loss computed live from transaction history
- Create/edit/delete buy/sell transactions from the UI, with a preview
  before confirming, an oversell warning, and a warning if an edit would
  make historical holdings go negative
- Create new assets inline via a combobox in the transaction form

### Returns
- Dividends — record/edit/delete, including withholding tax
- Total Return (incl. dividends), shown separately from price-only
  Unrealized P&L
- **XIRR** — money-weighted annualized return, accounting for the actual
  date each cash flow occurred
- Portfolio value trend chart (daily snapshots, automatic + manual "save
  today's value")
- Sector and country allocation donut charts

### Rebalancing
- Set target allocation (%) per asset
- Rebalancing page compares current vs. target and shows exactly how much
  to buy/sell, in currency and units
- Automatic drift-threshold alerts (badge/banner) on Overview and Holdings
  when any asset drifts beyond its threshold

### Prices
- Enter prices manually one at a time, or paste CSV/tab-separated data for
  many assets at once (with a preview and a warning for >30% price jumps)
- BTC price auto-refreshes from CoinGecko (immediately on page load, then
  every 60s)

### Thai tax tracking
- Tracks RMF (5 years + age 55+)/SSF (10 years)/ThaiESG (5 years) holding
  periods per purchase lot, not per fund
- Settings page for entering a birth date (used for RMF's age condition)
- Warns (doesn't block) when selling a fund that hasn't met its holding
  period yet

### Accounts & security
- Sign up / log in with email + password (Supabase Auth)
- Every page except login/signup requires a session — logged-out visitors
  are redirected to `/login`
- Each user's portfolios, transactions, targets, snapshots, and settings
  are private to them (Postgres Row Level Security) — one user can never
  see another's holdings
- Assets and prices are shared across all users by design (a fund's price
  is the same for everyone; there's no reason to duplicate that data
  per-user)

### Not yet built (see `ROADMAP.md` for details)
- Multi-currency / FX (deferred — every asset is THB today)
- Live price API for Thai funds (no good free API exists; CSV import covers
  this instead)
- LLM-assisted analysis (Phase 6 — on hold, scope not yet defined)

### Known issue (being investigated)
- Password reset emails currently redirect to `/` instead of
  `/reset-password` after clicking the link — the `redirectTo` value and
  Supabase's Redirect URLs allow-list both check out correctly, so the
  cause isn't yet confirmed. See `GOTCHAS.md` for the investigation so far.

### Deliberately dropped
- Benchmark comparison (SET, S&P 500) — S&P 500 has a solid free API
  (FRED), but SET Index has no usable free API (only paid/official
  services). Doing only half the comparison wasn't worth the added
  complexity, so this was dropped rather than half-built.

---

## Tech stack

| Layer | Uses | Why |
|-------|------|-----|
| Frontend | Next.js 16 (App Router) + TypeScript + React 19 | Popular, well-supported, free deploy on Vercel |
| Styling | Tailwind CSS 4 | Fast styling, dark-first fintech tone per DESIGN.md |
| Charts | recharts (trend chart) + hand-rolled SVG (allocation donuts) | recharts for the line chart; donuts predate that dependency |
| Database | Supabase (Postgres) | Free tier + built-in auth (for later) + auto REST API + pgvector for a future LLM phase |
| Deploy | Vercel | Free, no Docker, auto-deploys on every GitHub push |

Future direction: Docker + k3s on a VPS with separate dev/prod (all config
lives in env vars, so this move needs no rewrite).

---

## Getting started

```bash
npm install
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
# (from your Supabase project → Connect button, or Settings → API Keys)
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/signup` to create an
account (or `/login` if you already have one). Every page requires a session.

### Database setup
Run the SQL files in `migrations/` **in numeric order** in the Supabase SQL
Editor (0001 through 0010 currently). See `migrations/README.md` for details.
Migrations 0008–0010 (Phase 7: auth backfill + RLS) assume you're
bootstrapping with exactly one real account — see the comments in those
files if you're setting up fresh with multiple users from the start.

---

## Project structure

```
portfolio-tracker/
├── src/
│   ├── app/
│   │   ├── page.tsx           #   / — Overview: all portfolio cards
│   │   ├── login/             #   /login
│   │   ├── signup/            #   /signup
│   │   ├── holdings/          #   /holdings — holdings, P&L, XIRR,
│   │   │                          trend chart, allocation, transaction/dividend history
│   │   ├── targets/           #   /targets — set target allocation
│   │   ├── rebalancing/       #   /rebalancing — current vs. target
│   │   ├── prices/            #   /prices — enter/paste prices
│   │   ├── assets/            #   /assets — manage the asset list
│   │   ├── settings/          #   /settings — birth date (for RMF condition)
│   │   └── api/
│   │       └── refresh-crypto-prices/  # fetches BTC price from CoinGecko
│   ├── components/            # PageHeader, NavBar, ConfirmDialog, Toast,
│   │                             TrendChart, DonutChart, HistoryModal,
│   │                             RequireAuth (session gate), ...
│   └── lib/
│       ├── supabase.ts        # Supabase client
│       ├── xirr.ts            # money-weighted annualized return
│       ├── drift.ts           # shared drift formula (Overview/Holdings/Rebalancing)
│       ├── taxHolding.ts       # RMF/SSF/ThaiESG holding-period rules
│       ├── transactions.ts    # wouldCauseNegativeHolding() safety check
│       ├── assets.ts          # asset creation / symbol-uniqueness, shared across forms
│       └── passwordRules.ts   # signup password strength rules (pure functions)
├── migrations/                # ordered schema changes (0001–0010)
├── seed_data.sql              # real portfolio data (reference/restore only, not schema)
├── .env.local                 # real keys (gitignored)
├── .claude/hooks/              # blocks reading .env; enforces CHANGELOG.md updates
└── [project docs — see table below]
```

### Documentation system ("living docs")

This project splits documentation into several files, each covering one
concern, so only what's relevant to the task at hand needs to be read —
useful for both humans and AI assistants working on the codebase.

| File | Read it for |
|------|-------------|
| `CLAUDE.md` | Starting point/map — non-negotiable rules + a table of which file to read when (loaded every session) |
| `ARCHITECTURE.md` | System structure — tech stack, data model, schema, Supabase setup, feature-level implementation notes |
| `DESIGN.md` | Visual direction — colors (dark-first, blue accent), typography, layout, UI rules |
| `DECISIONS.md` | Every real decision made + why — prevents silently reverting a settled choice |
| `ROADMAP.md` | Phased plan (1–7) — what's next |
| `CHANGELOG.md` | Log of completed work, by date |
| `GOTCHAS.md` | Real bugs/footguns hit, how they were fixed, how to avoid repeating them |
| `migrations/README.md` | Migration rules + a table of what each file does |

**How this stays maintainable:** top-level docs (`CLAUDE.md`,
`ARCHITECTURE.md`, `DESIGN.md`) are written to be stable and only updated
when something genuinely changes. `CHANGELOG.md` and `DECISIONS.md` are
append-only logs that grow with real work — a Claude Code hook automatically
checks that `CHANGELOG.md` gets updated whenever code changes.

---

## Security

- Never commit `.env*` files (already gitignored) — they hold Supabase keys
- The client only ever uses the **publishable key**; the **secret key** must
  never appear in the repo or in browser-side code
- Claude Code hooks in `.claude/hooks/` block reading `.env` files and
  enforce a `CHANGELOG.md` update on every code/schema change
- **Row Level Security is on** for `portfolios`, `user_settings`,
  `transactions`, `targets`, and `portfolio_snapshots` — each user can only
  read/write their own rows. `assets` and `prices` are intentionally shared
  across all users (see `ARCHITECTURE.md`).
- Every page except `/login`/`/signup` requires a logged-in session
  (client-side `<RequireAuth>` gate — see `ARCHITECTURE.md`, not
  middleware, per `DECISIONS.md`)
- No inactivity/session-timeout enforcement yet — Supabase's "Inactivity
  timeout" setting requires the Pro plan; sessions currently last until the
  user manually logs out. Not a concern for now, but worth knowing if this
  is ever shared more widely.