"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { formatMoney, symbolFor } from "@/lib/format";

export interface SnapshotPoint {
  snapshot_date: string; // "YYYY-MM-DD"
  total_value: number;
}

interface Props {
  snapshots: SnapshotPoint[];
  currency: string;
}

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Parsed manually (not `new Date(str)`) to sidestep any timezone-shift
// surprise from parsing a date-only string.
function formatAxisDate(dateStr: string) {
  const [, month, day] = dateStr.split("-").map(Number);
  return `${MONTH_ABBR[month - 1]} ${day}`;
}

// Dark-mode-appropriate colors, hardcoded: the app's `dark` class is
// unconditional right now (no reachable light-mode toggle — see
// ARCHITECTURE.md), and recharts' internal tick/grid elements don't
// reliably pick up Tailwind's `dark:` classes via `currentColor` the way
// a hand-written SVG element does, so explicit values are used instead.
const AXIS_TICK_COLOR = "#9ca3af"; // gray-400
const GRID_COLOR = "#1f2937"; // gray-800
const LINE_COLOR = "#60a5fa"; // blue-400 — same accent as the "Tracker" wordmark glow

interface TooltipPayloadEntry {
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  currency: string;
}

function CustomTooltip({ active, payload, label, currency }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0 || !label) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-gray-800 dark:bg-gray-900">
      <div className="text-gray-500 dark:text-gray-400">{formatAxisDate(label)}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
        {formatMoney(payload[0].value, currency)}
      </div>
    </div>
  );
}

export function TrendChart({ snapshots, currency }: Props) {
  if (snapshots.length < 2) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Not enough data yet for a trend chart. Your portfolio&apos;s value is
          recorded automatically every day — check back once a few days of
          history have built up.
        </p>
      </div>
    );
  }

  const symbol = symbolFor(currency);

  return (
    <div className="trend-chart rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-6">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Value over time
      </h2>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={snapshots} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="snapshot_date"
            tickFormatter={formatAxisDate}
            tick={{ fill: AXIS_TICK_COLOR, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(value: number) => `${symbol}${Math.round(value).toLocaleString("en-US")}`}
            tick={{ fill: AXIS_TICK_COLOR, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={80}
          />
          <Tooltip content={<CustomTooltip currency={currency} />} />
          <Line
            type="monotone"
            dataKey="total_value"
            stroke={LINE_COLOR}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: LINE_COLOR }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
