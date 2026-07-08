"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { computeTaxHoldingStatus } from "@/lib/taxHolding";

interface Props {
  taxBucket: string;
  tradeDate: string;
  birthDate: string | null;
}

// Deliberately not green/red (DESIGN.md reserves that pair for P&L) — blue
// for "met" (same neutral-informational treatment as the Buy/Sell toggle,
// D43), amber for "not yet" (same family as the drift-threshold badge),
// gray for the "can't tell yet" (RMF, no birth date) case.
const MET_CLASS = "text-blue-600 dark:text-blue-400";
const PENDING_CLASS = "text-amber-600 dark:text-amber-400";
const UNKNOWN_CLASS = "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300";

function ClockIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <circle cx="10" cy="10" r="7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6.75V10l2.25 1.25" />
    </svg>
  );
}

// Exact calendar Y/M/D difference (not a days/365 approximation) — used
// only for the tooltip's human-readable "time left" text.
function calendarDiff(fromStr: string, toStr: string): { years: number; months: number; days: number } {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  let years = ty - fy;
  let months = tm - fm;
  let days = td - fd;
  if (days < 0) {
    months -= 1;
    days += new Date(Date.UTC(ty, tm - 1, 0)).getUTCDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
}

function formatRemaining(fromStr: string, toStr: string): string {
  const { years, months, days } = calendarDiff(fromStr, toStr);
  const parts: string[] = [];
  if (years > 0) parts.push(`${years}y`);
  if (months > 0) parts.push(`${months}m`);
  if (days > 0 || parts.length === 0) parts.push(`${days}d`);
  return parts.join(" ");
}

// The icon lives inside HistoryModal's Transactions list, which scrolls
// under `overflow-y-auto` — a CSS `position: absolute` tooltip gets
// silently clipped by that ancestor. Using `position: fixed`, anchored via
// the icon's own `getBoundingClientRect()` at hover time, escapes that
// clipping entirely (fixed positioning is relative to the viewport, not
// any scrollable ancestor).
function TooltipIcon({
  colorClass,
  tooltip,
  onClick,
}: {
  colorClass: string;
  tooltip: string;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function show() {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom, left: rect.right });
  }
  function hide() {
    setPos(null);
  }

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        onClick={onClick}
        className={`inline-flex ${onClick ? "cursor-pointer" : ""} ${colorClass}`}
        aria-label={`Tax holding-period status: ${tooltip}`}
      >
        <ClockIcon className="h-4 w-4" />
      </span>
      {pos && (
        <div
          className="fixed z-50 w-56 -translate-x-full rounded-lg border border-gray-200 bg-white p-2.5 text-left text-xs font-normal normal-case leading-snug text-gray-700 shadow-lg dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
          style={{ top: pos.top + 8, left: pos.left }}
        >
          {tooltip}
        </div>
      )}
    </>
  );
}

export function TaxHoldingBadge({ taxBucket, tradeDate, birthDate }: Props) {
  const router = useRouter();
  const result = computeTaxHoldingStatus({ taxBucket, tradeDate, birthDate });
  if (result.status === "no_condition") return null;

  const today = new Date().toISOString().slice(0, 10);

  // RMF with no birth date on file: the age condition genuinely can't be
  // evaluated — gray icon, clickable straight to Settings (a hover-only
  // tooltip isn't reliably clickable itself).
  if (result.ageRequired && result.ageConditionMet === null) {
    const holdingLine = result.holdingPeriodMet
      ? `Holding period met (since ${result.eligibleDate}).`
      : `Holding period: ${formatRemaining(today, result.eligibleDate as string)} left (eligible ${result.eligibleDate}).`;
    return (
      <TooltipIcon
        colorClass={UNKNOWN_CLASS}
        tooltip={`${holdingLine} Age condition unknown — click to enter your birth date on Settings.`}
        onClick={() => router.push("/settings")}
      />
    );
  }

  const isMet = result.status === "met";
  let tooltipText: string;
  if (isMet) {
    tooltipText = result.ageRequired
      ? `Eligible since ${result.eligibleDate} — holding period and age (55+) conditions both met.`
      : `Eligible since ${result.eligibleDate} — holding period met.`;
  } else if (result.holdingPeriodMet === false) {
    tooltipText = `Not yet eligible — ${formatRemaining(today, result.eligibleDate as string)} left (eligible ${result.eligibleDate}).`;
  } else {
    tooltipText = `Holding period met, but must be 55+ to sell without losing the tax benefit — ${formatRemaining(today, result.ageEligibleDate as string)} left (eligible ${result.ageEligibleDate}).`;
  }

  return <TooltipIcon colorClass={isMet ? MET_CLASS : PENDING_CLASS} tooltip={tooltipText} />;
}
