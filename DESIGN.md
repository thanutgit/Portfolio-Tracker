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

## Depth & elevation
Default state is flat — depth is reserved for interaction feedback, not
decoration.
- Buttons: soft `shadow-sm` at rest. On hover, step up to `shadow-md` and
  lift ~1px (`-translate-y-px`). On active/press, drop back to
  `translate-y-0` and `shadow-sm` — reads as a physical press, not a bounce.
  Disabled buttons don't lift or gain shadow on hover.
- Icon buttons (edit/delete/close): transparent at rest — no shadow, no
  background. Hover adds a rounded (full-circle) neutral background, the
  same lift/shadow as buttons above, and a color shift toward the action's
  intent (blue-ish for edit/neutral actions, red for delete). This red is a
  destructive-action affordance, not a data value, so it doesn't conflict
  with the green/red P&L rule below — it never sits next to or represents a
  number.
- Cards/containers (summary cards, table wrappers) keep their existing
  static `shadow-sm`, unchanged — that elevation signals grouping, not
  interactivity, so it never moves or intensifies.
- Every shadow stays soft and low-opacity (Tailwind's default `shadow-sm`/
  `shadow-md` scale, ~150ms transition). No glow, no colored shadows, no
  gradients — this is additive polish on "flat and quiet," not a departure
  from it.

## Data display rules
- Money values: always show currency, consistent decimal places, thousand
  separators (e.g. ฿12,450.00).
- Gains/losses: color (green/red) AND a +/− sign — never color alone
  (accessibility).
- Empty states (no portfolios yet, no holdings yet) get a simple, calm
  message + a clear next action — not a jarring blank page.
- Composite numbers (a figure that's the sum of two or more parts — e.g.
  Total Return = price gain + dividends) must show the parts as separate,
  labeled columns/values alongside the total, not just the combined number.
  Two green numbers with no label look identical and get misread as
  duplicates. Apply this again for future composite figures (e.g. FX-adjusted
  returns in Phase 3).

## Responsive
- Must work on mobile — this is a portfolio you'll check on your phone.
  Tables should scroll or reflow sensibly on narrow screens, not break layout.

## What to avoid
- No gradients, neon colors, or heavy shadows/glow — keep it flat and quiet.
  (Subtle hover/active depth on interactive elements is fine — see Depth &
  elevation.)
- All interactive elements (buttons, icon buttons, links, clickable rows,
  dropdowns) must show `cursor: pointer` on hover — hard requirement, not
  optional polish. Native `<button>` elements don't get this by default in
  most browsers, so it has to be added explicitly.
- No dense "spreadsheet-style" tables with tiny text — this is Phase 1's
  main view, it should feel premium, not like raw data dump.
- No stock illustration/emoji clutter. Icon buttons (edit/delete etc.) are
  small inline SVGs matching the accent/neutral palette, not emoji.