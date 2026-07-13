"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: string; // ISO "YYYY-MM-DD", or "" if unset
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// ISO "YYYY-MM-DD" -> raw "DDMMYYYY" digit buffer (what the text input's
// auto-formatting logic works from). Empty/malformed input -> "".
function isoToRawDigits(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const [, yyyy, mm, dd] = m;
  return `${dd}${mm}${yyyy}`;
}

// Inserts "/" at the DD/MM boundary and MM/YYYY boundary as digits fill in —
// typing "29042024" progressively becomes "29/04/2024" without the user
// ever typing a slash themselves.
function formatDisplay(raw: string): string {
  const dd = raw.slice(0, 2);
  const mm = raw.slice(2, 4);
  const yyyy = raw.slice(4, 8);
  return [dd, mm, yyyy].filter(Boolean).join("/");
}

// Only accepts a real calendar date (rejects e.g. 32/13/2024) — returns the
// ISO string on success, null otherwise. `raw` must be exactly 8 digits.
function parseValidDate(raw: string): string | null {
  if (raw.length !== 8) return null;
  const dd = Number(raw.slice(0, 2));
  const mm = Number(raw.slice(2, 4));
  const yyyy = Number(raw.slice(4, 8));
  if (yyyy < 1000 || mm < 1 || mm > 12) return null;
  const daysInMonth = new Date(yyyy, mm, 0).getDate();
  if (dd < 1 || dd > daysInMonth) return null;
  return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// Parses "YYYY-MM-DD" into a local-time Date by hand, rather than
// `new Date(iso)` — the latter parses as UTC midnight, which can shift to
// the previous/next day once converted to the browser's local timezone
// (e.g. anywhere west of UTC). Every other date built in this file already
// uses local-time `Date` components, so this keeps that consistent.
function isoToLocalDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [, yyyy, mm, dd] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

interface CalendarCell {
  date: Date;
  inMonth: boolean;
}

// Always 42 cells (6 full weeks) so the dropdown's height doesn't jump as
// you navigate between months with different day counts.
function buildCalendarGrid(year: number, month: number): CalendarCell[] {
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: CalendarCell[] = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  let next = 1;
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, next), inMonth: false });
    next += 1;
  }
  return cells;
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
      <rect x="3" y="4.5" width="14" height="12" rx="1.5" />
      <path strokeLinecap="round" d="M3 8h14M7 3v3M13 3v3" />
    </svg>
  );
}

// Custom text-entry + calendar-dropdown date input, replacing native
// <input type="date"> everywhere in the app. Two problems with the native
// control drove this: it formats/parses in the browser's locale (often
// MM/DD/YYYY) rather than the DD/MM/YYYY order used in Thailand, and typing
// is rigid per-segment — e.g. typing "29/04/2024" straight through fails
// because "29" gets interpreted as a month first. This component always
// reads/writes an ISO "YYYY-MM-DD" string, same as the native input did, so
// no schema or submit-handler changes were needed at any call site — only
// the input/output shape (a plain string prop and callback, not a native
// DOM input) changed, which callers already used in that form.
export function DatePicker({ value, onChange, required, className }: Props) {
  const [rawDigits, setRawDigits] = useState(() => isoToRawDigits(value));
  const [dateError, setDateError] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());

  const containerRef = useRef<HTMLDivElement>(null);

  // Resync from an external value change (parent-driven reset, or a fresh
  // value picked from the calendar) — never fires mid-typing, since we only
  // call onChange once a full, valid date has been entered, so the `value`
  // prop is unchanged while a date is still partially typed.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRawDigits(isoToRawDigits(value));
  }, [value]);

  useEffect(() => {
    if (!calendarOpen) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCalendarOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", closeOnScroll, true);
    function closeOnScroll() {
      setCalendarOpen(false);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [calendarOpen]);

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    setRawDigits(digits);
    if (digits.length === 0) {
      setDateError(null);
      onChange("");
      return;
    }
    if (digits.length < 8) {
      setDateError(null); // still typing — don't flag a partial date as invalid
      return;
    }
    const iso = parseValidDate(digits);
    if (iso) {
      setDateError(null);
      onChange(iso);
    } else {
      setDateError("Enter a valid date.");
    }
  }

  function openCalendar() {
    if (calendarOpen) {
      setCalendarOpen(false);
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left });
    const base = isoToLocalDate(value) ?? new Date();
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setCalendarOpen(true);
  }

  function selectDate(date: Date) {
    const iso = toIso(date);
    setRawDigits(isoToRawDigits(iso));
    setDateError(null);
    onChange(iso);
    setCalendarOpen(false);
  }

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  const selectedIso = parseValidDate(rawDigits) ?? "";
  const todayIso = toIso(new Date());
  const grid = buildCalendarGrid(viewYear, viewMonth);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div className="flex items-center rounded-md border border-gray-300 bg-white pr-1 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 dark:border-gray-700 dark:bg-gray-950">
        <input
          type="text"
          inputMode="numeric"
          value={formatDisplay(rawDigits)}
          onChange={handleTextChange}
          placeholder="DD/MM/YYYY"
          required={required}
          className="w-full min-w-0 border-none bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-0"
        />
        <button
          type="button"
          onClick={openCalendar}
          aria-label="Open calendar"
          className="flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded text-gray-400 transition-colors duration-150 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400"
        >
          <CalendarIcon />
        </button>
      </div>

      {dateError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{dateError}</p>}

      {calendarOpen && pos && (
        <div
          className="fixed z-50 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-800 dark:bg-gray-900"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              ‹
            </button>
            <div className="flex items-center gap-1">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="cursor-pointer rounded-md border border-gray-300 bg-white px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-950"
              >
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value) || viewYear)}
                className="w-16 rounded-md border border-gray-300 bg-white px-1.5 py-1 text-xs font-mono tabular-nums dark:border-gray-700 dark:bg-gray-950"
              />
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              ›
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs text-gray-500 dark:text-gray-400">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {grid.map((cell, i) => {
              const iso = toIso(cell.date);
              const isSelected = cell.inMonth && iso === selectedIso;
              const isToday = cell.inMonth && iso === todayIso;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!cell.inMonth}
                  onClick={() => selectDate(cell.date)}
                  className={`h-8 w-8 rounded-md text-xs transition-colors duration-150 ${
                    !cell.inMonth
                      ? "cursor-default text-gray-300 dark:text-gray-700"
                      : isSelected
                        ? "cursor-pointer bg-blue-600 font-medium text-white"
                        : isToday
                          ? "cursor-pointer border border-blue-500/40 text-blue-600 hover:bg-blue-500/10 dark:text-blue-400"
                          : "cursor-pointer text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  }`}
                >
                  {cell.date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
