# Design

Visual direction: dark-first, premium fintech/AI-tool feel — bold headline
numbers, a glowing accent chart, calm dark surfaces. Confident and modern,
not playful, not a flat corporate dashboard. Numbers are still the hero; the
UI frames them, it doesn't compete with them.

(Changed from the original light/Stripe-Notion direction — see DECISIONS.md
for when/why. This file describes the CURRENT direction; treat it as
authoritative over any earlier description.)

## Tone in one line
"A confident, AI-era wealth tool" — dark, bold, a little bit alive (the
glowing trend line), but still precise and trustworthy with real money.

## Color
- Dark is the PRIMARY and default mode: near-black page background
  (`gray-950`-ish), slightly lighter card surfaces (`gray-900`-ish) with a
  soft 1px border to separate cards from the background.
- Light mode still exists as a secondary, user-toggleable option — same
  structure, inverted surfaces — but dark is what the app opens in by
  default and what gets primary design attention.
- Accent color: BLUE (not green — green is reserved for gains, see below).
  Used for primary buttons, active nav state, links, the portfolio trend
  chart line, and badges like the "+4.2%"-style summary chip. The accent can
  glow — see Depth & elevation.
- Financial semantics unchanged and non-negotiable: gains = green, losses =
  red, always paired with a +/− sign. Blue accent must never appear in a way
  that could be mistaken for a gain/loss value.
- Secondary status colors (e.g. a "risk: high" or "health score" badge) use
  their own palette (amber/red/green as appropriate to their own meaning) —
  keep these visually distinct from the P&L green/red so a risk badge is
  never confused with a gain/loss figure. First real use: drift-threshold
  alerts (amber/orange, deliberately not red — see Components).

## Typography
- One clean sans-serif system font stack (e.g. Inter) — no decorative fonts.
- Headline numbers (portfolio total value, big hero stats) are BOLD and
  large — this is new: previously all numbers were similarly weighted, now
  the single most important number on a page (e.g. total portfolio value)
  should read as a clear visual anchor, noticeably bigger/bolder than
  supporting numbers.
- Numbers in tables (holdings rows, prices) stay tabular/monospace for
  column alignment — bold headline treatment is for hero/summary numbers
  only, not every number in a dense table.
- Clear hierarchy: page titles, section labels, and data distinct by
  weight/size, not just color.

## Layout & spacing
- Generous whitespace over dense packing. Tables and cards should breathe.
- Card-based sections with soft borders + subtle elevation (see below) on
  dark surfaces — cards should read as distinct panels floating slightly
  above the page background.
- Rounded corners throughout.
- **Every page must use `CONTAINER_CLASS` from `src/lib/layout.ts` as its
  main container — never set a page-specific `max-width` by hand.**
  (Lesson from a real bug: Overview once used its own `max-w-3xl` and
  quietly ended up narrower than every other page.)
- **Page container**: every page's `<main>` and the `NavBar` share one
  constant, `CONTAINER_CLASS` in `src/lib/layout.ts`
  (`mx-auto max-w-[1600px] px-4 sm:px-6 md:px-8 xl:px-12 2xl:px-16`) — full
  width with small padding on mobile, growing padding through tablet
  and desktop, fluid content width up to 1600px, then capped and centered
  beyond that so very large monitors don't stretch content edge-to-edge.
  Always import and use this constant rather than hardcoding a `max-w-*`
  on a new page — that's what previously let the Overview page drift to a
  narrower `max-w-3xl` while every other page used `max-w-5xl`, so nav and
  page edges quietly stopped lining up. All pages and the nav must render
  at the exact same width at every breakpoint.

## Depth & elevation
- Cards: soft shadow + a subtle 1px border (border does more work than
  shadow on dark backgrounds, where shadows are less visible). Static, not
  interactive — signals grouping.
- Buttons: same physical-press pattern as before (soft shadow at rest, lift
  + stronger shadow on hover, press back down on click, ~150ms transition).
  Primary buttons use the blue accent as their fill.
- GLOW is now allowed, scoped narrowly: the accent trend-line chart, small
  accent badges (e.g. a percentage-change chip), and the "Tracker" half of
  the brand wordmark (a permanent neon-blue text-shadow glow, not a hover
  effect) may have a soft blue glow to feel "alive." Glow does NOT apply
  to: data tables, holdings rows, P&L numbers, or any dense information
  display — those stay flat and legible. Glow is a hero-moment effect, used
  sparingly, never a default state for ordinary UI elements.
- Icon buttons (edit/delete/close): unchanged from before — transparent at
  rest, rounded neutral background + lift on hover, color shift toward
  intent (red for delete stays a destructive-action convention, not a P&L
  color).
- All interactive elements must show `cursor: pointer` on hover — unchanged
  hard requirement.

## Data display rules
- Money values: always show currency, consistent decimal places, thousand
  separators (e.g. ฿12,450.00).
- Gains/losses: color (green/red) AND a +/− sign — never color alone
  (accessibility). This rule is unaffected by the dark/blue direction change.
- Empty states get a simple, calm message + a clear next action.
- Composite numbers (e.g. Total Return = price gain + dividends) must show
  the parts as separate, labeled values alongside the total — unchanged from
  before, still applies.
- Status/score badges (health, alignment, risk-level style indicators) are
  fine as a pattern where useful, but should be clearly labeled (not just a
  colored number with no context) and must not visually resemble the P&L
  green/red convention.

## Components
- **Navigation**: the active nav link is a pill — translucent accent-blue
  background (`bg-blue-500/10` light, `bg-blue-400/10` dark), rounded-full,
  blue text, matching padding to inactive links so nothing shifts on
  navigate. Inactive links are plain gray text with no background.
  On the Overview page (`/`), the tabs (Holdings/Targets/Rebalancing/
  Prices) are hidden entirely — no portfolio is selected there yet, so
  pages that operate on a selected portfolio aren't meaningful from this
  page. Only the "Portfolio Tracker" brand link shows, which doubles as
  the way back to Overview from every other page — it gets a `cursor:
  pointer` and a blue hover tint (`hover:text-blue-600`/`dark:hover:
  text-blue-400`) everywhere, so it reads as clickable even without the
  surrounding tabs. There's no separate "Overview" tab — the brand link
  already goes there, and a second link to the same place would be
  redundant. The wordmark itself is `text-lg` (bigger than the nav tabs)
  with "Tracker" in accent blue and a permanent neon glow (text-shadow),
  "Portfolio" in the normal heading color — see Depth & elevation. The
  bar is `sticky top-0` with an opaque (not translucent) background, so
  it stays visible and legible while a page's content scrolls underneath
  it — `z-40`, below modal backdrops (`z-50`) and the confirm dialog
  (`z-[60]`)/toast (`z-[70]`) that can appear above them, so an open
  modal always correctly covers the nav rather than sitting behind it.
- **Modals & dialogs**: one reusable component for confirm/cancel prompts
  (`ConfirmDialog`) — a dark card (matches the existing modal treatment:
  `bg-white`/`dark:bg-gray-900`, 1px border, `shadow-lg`) over a
  dark/blurred backdrop (`bg-black/40` light, `bg-black/60` dark, plus
  `backdrop-blur-sm`). Confirm/Cancel buttons reuse the same button depth
  system as the rest of the app (soft shadow, hover-lift, press-down).
  Destructive confirms (delete) use a red confirm button — same
  destructive-action convention as the delete icon, not a P&L color.
  `window.confirm()`/`alert()` are not used anywhere; native browser
  dialogs don't match the app's visual language.
- **Badges/chips**: a rounded-full pill with a translucent tinted background
  (e.g. `bg-green-500/10 text-green-600`) — first real use is the % return
  badge on the Overview page's portfolio cards. Uses `pnlBadgeClass()`
  (same green/red/gray semantics as `pnlColor()`, just with a background
  tint added) so it's never a new color, just a new treatment of the
  existing P&L palette. Same translucent-pill visual language as the nav
  active state, applied to a different context.
- **Portfolio Overview cards**: one row per portfolio, sitting directly on
  the page background (no extra wrapping container) — icon in a translucent
  blue circle + name + holdings count on the left, total value (bold,
  tabular-nums) + return % badge + chevron on the right. Static
  border/shadow at rest; hover adds the standard lift + a faint blue border
  tint + `cursor: pointer` — the whole row is a `<Link>` to that portfolio's
  Holdings page, so it needs to read as clickable without being a "button."
- **Drift-threshold alerts**: amber/orange (`amber-500`/`amber-400`), never
  red — red stays reserved for P&L losses. Two presentations of the same
  underlying signal (`src/lib/drift.ts`): a compact translucent pill badge
  (`DriftBadge`, same visual language as the P&L `pnlBadgeClass()` pills,
  just amber) after the return % badge on Overview's portfolio cards, and
  a full-width bordered banner (warning icon + count + a link to
  Rebalancing) above the summary cards on Holdings. Both render nothing —
  not a dismissed/collapsed state, literally absent from the DOM — when
  there's nothing to flag: no targets configured, or every asset within
  threshold. No dismiss control and no auto-expiry (unlike `Toast`):
  this is an ambient, always-current status, not a one-time event.
- **Trend chart** (`TrendChart`, Holdings page): a line chart of portfolio
  value over time, built with `recharts` — the accent-blue line (not the
  library's default palette) gets the same permanent soft glow as the
  "Tracker" wordmark (see Depth & elevation), on a calm dark card matching
  every other card on the page. Axis labels are small and muted (not
  competing with the line), gridlines are a faint dashed horizontal-only
  line (no vertical clutter), and the hover tooltip is a custom dark card
  (not the library's default white tooltip) showing the exact date and
  money value. With fewer than 2 data points it shows a plain calm
  sentence instead of a chart — never a flat or single-dot line, which
  would misleadingly look like real (flat) history.
- **Toasts / success notifications**: a small `Toast` component, fixed
  top-right, dark card matching the modal treatment (`shadow-lg`, 1px
  border), a green checkmark icon, auto-dismisses on its own (~3s) — for
  transient success confirmations after a save/update/delete, not for
  errors. Errors stay inline (in the form/page that produced them) so they
  don't disappear before the user can read and act on them. Green here is a
  universal success convention, not a P&L value, and appears in a distinct
  floating corner position rather than inline next to a number — consistent
  with the "Secondary status colors" rule above.

## Responsive
- Must work on mobile. Tables should scroll or reflow sensibly on narrow
  screens, not break layout.
- Dense, many-column tables (e.g. Holdings) should fit the page's
  existing container width on desktop/laptop screens without needing a
  horizontal scroll — reserve that scroll for genuinely narrow (tablet/
  mobile) viewports where it's unavoidable. In practice this means: no
  hardcoded table `min-width` wider than the container can comfortably
  fit; dense numeric/tabular-nums cells can drop to `text-xs` (still
  legible, and consistent with "bold headline treatment is for hero
  numbers only, not every number in a dense table"); a composite value +
  its `%` render as two stacked lines rather than one long inline string,
  so neither forces the column wider than the value alone needs; and any
  text column whose content can occasionally run long (a fund name, an
  unusually long symbol) should be allowed to wrap rather than forced
  `whitespace-nowrap`, since wrapping is what actually keeps the table
  within its container.

## What to avoid
- No neon colors outside the intentionally-scoped accent glow described
  above (trend chart, accent badges, the "Tracker" wordmark). The glow is
  deliberate and narrow — don't let it spread to table rows, general text,
  or every card.
- No dense "spreadsheet-style" tables with tiny text — should feel premium.
- No stock illustration/emoji clutter. Icon buttons are small inline SVGs
  matching the palette, not emoji.
- Don't let bold headline typography bleed into dense data tables — tables
  stay legible and evenly weighted; boldness is reserved for hero numbers.