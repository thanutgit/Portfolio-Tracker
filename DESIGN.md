# Design

Visual direction: clean, modern fintech (think Stripe / Notion) — light and
airy by default, quiet and precise. Not playful, not heavy/corporate-bank.
Numbers are the hero; the UI should get out of their way.

## Tone in one line
"A calm, precise tool a professional trusts with their money" — not a
consumer app, not a bank's legacy dashboard.

## Color
- Neutral base: white / very light gray surfaces. Avoid pure black text —
  use dark gray (`gray-900`-ish) for primary text.
- One accent color for interactive elements (links, primary buttons, active
  states). Keep it restrained — not the star of the page.
- Financial semantics use conventional colors: gains = green, losses = red.
  Never repurpose green/red for anything else in the UI (avoid confusion with
  P&L).
- Dark mode is a first-class palette swap, not an afterthought — every color
  above needs a dark-mode equivalent (dark surfaces, light text, same accent
  hue adjusted for contrast). Support both; let the user (or system
  preference) toggle.

## Typography
- One clean sans-serif system font stack (e.g. Inter, or the system UI font
  stack) — no decorative or display fonts.
- Numbers (prices, P&L, quantities) use a monospace or tabular-numeral
  variant so figures align in columns — this matters a lot for a portfolio
  table.
- Clear hierarchy: page titles, section labels, and data should be visually
  distinct by weight/size, not just color.

## Layout & spacing
- Generous whitespace over dense packing. Tables and cards should breathe.
- Card-based sections for grouped info (a portfolio's summary, a holdings
  table) with soft borders/shadows — not harsh dividing lines.
- Rounded corners, subtle borders — matches the fintech-clean reference.

## Data display rules
- Money values: always show currency, consistent decimal places, thousand
  separators (e.g. ฿12,450.00).
- Gains/losses: color (green/red) AND a +/− sign — never color alone
  (accessibility).
- Empty states (no portfolios yet, no holdings yet) get a simple, calm
  message + a clear next action — not a jarring blank page.

## Responsive
- Must work on mobile — this is a portfolio you'll check on your phone.
  Tables should scroll or reflow sensibly on narrow screens, not break layout.

## What to avoid
- No gradients, neon colors, or heavy shadows/glow — keep it flat and quiet.
- No dense "spreadsheet-style" tables with tiny text — this is Phase 1's
  main view, it should feel premium, not like raw data dump.
- No stock illustration/emoji clutter.
