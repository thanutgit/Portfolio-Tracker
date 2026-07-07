// Warning-triangle icon — amber/orange, deliberately distinct from the
// green/red P&L palette (DESIGN.md: red is reserved for losses, not
// general warning states).
export function WarningIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.68 3.5c.57-1 2.07-1 2.64 0l6.16 10.75c.57 1-.15 2.25-1.32 2.25H3.84c-1.17 0-1.89-1.25-1.32-2.25L8.68 3.5Z"
      />
      <path strokeLinecap="round" d="M10 8v3.5" />
      <circle cx="10" cy="14" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

interface Props {
  count: number | null;
}

// Renders nothing when there's nothing to say: no targets set at all
// (`count === null`) or every asset within threshold (`count === 0`) —
// this is a quiet, always-visible indicator, never an "everything's
// fine" green checkmark shown by default.
export function DriftBadge({ count }: Props) {
  if (!count) return null;
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:bg-amber-400/10 dark:text-amber-400">
      <WarningIcon />
      {count} asset{count === 1 ? "" : "s"} off target
    </span>
  );
}
