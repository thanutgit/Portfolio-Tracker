# Portfolio Tracker — start here

Personal investment portfolio tracker: multiple portfolios of Thai/global
stocks & funds, price tracking, rebalancing (later). Thai market focus
(SET/mai, THB, RMF/SSF/ThaiESG).

Detailed docs are split into companion files. Read only what's relevant to the
task in front of you — don't load everything.

## Non-negotiables (always apply)
- **Holdings are COMPUTED from `transactions`, never stored.** Query the
  `holdings` view; do NOT recompute average cost in app code. (DECISIONS.md D1, D5)
- **Never expose the Supabase SECRET key** (`sb_secret_...`). Client uses the
  PUBLISHABLE key only. No key values in any committed file.
- **Build only the phase currently in progress** per ROADMAP.md — don't jump
  ahead to a later phase unless explicitly asked.
- **Schema changes go in `migrations/` as new numbered files.** Never edit
  `migrations/0001_init.sql` or any applied migration — add
  `migrations/000N_description.sql` instead. See migrations/README.md.

## Doc map
| File | Read it when |
|------|--------------|
| ARCHITECTURE.md | tech stack, data model, DB schema, Supabase setup, deployment |
| DESIGN.md | building or styling any UI — colors, typography, layout, tone |
| DECISIONS.md | before reversing an existing choice — check why it was made |
| ROADMAP.md | deciding what to build next; phase scope |
| migrations/README.md | making any schema change |
| migrations/ | current DB schema — read all files in order, README.md first |
| GOTCHAS.md | debugging a weird bug or writing SQL by hand — check known footguns first |
| seed_data.sql | real portfolio data already inserted — reference only, don't re-run blindly |

## Keeping these docs healthy
- Made a real decision? Append it to DECISIONS.md. Don't silently revert one.
- Finished a task/phase? Log it (CHANGELOG.md already exists — keep it updated).
- Hit a real bug/footgun? Record it in GOTCHAS.md.
- Keep this map current, and keep every file short — it loads into context.