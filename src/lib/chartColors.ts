// A curated, blue-led palette for chart segments — not a chart library's
// default rainbow. Stays in the app's cool/blue accent family (DESIGN.md:
// "Accent color: BLUE... used for... the portfolio trend chart line").
// Mid-lightness hex values are legible on both the light and dark surface
// colors, so no separate dark-mode variant is needed here.
export const CHART_COLORS = [
  "#3b82f6", // blue-500 (primary accent)
  "#38bdf8", // sky-400
  "#818cf8", // indigo-400
  "#2dd4bf", // teal-400
  "#60a5fa", // blue-400
  "#a78bfa", // violet-400
  "#22d3ee", // cyan-400
  "#0ea5e9", // sky-500
];

// Deliberately outside the accent palette — a neutral gray flags "missing
// data" rather than looking like just another category.
export const UNCATEGORIZED_COLOR = "#9ca3af"; // gray-400
