export function SummaryCard({
  label,
  value,
  suffix,
  subLine,
  colorClass,
  size = "default",
}: {
  label: string;
  value: string;
  suffix?: string;
  // Optional second line BELOW the value (not inline like suffix) —
  // smaller and muted. First use: a non-base-currency composition
  // breakdown under "Total current value" (e.g. "15.00 HKD + 30.00
  // USD"), so the currency detail doesn't compete with the hero number.
  // The parens are added by this component, not the caller.
  subLine?: string;
  colorClass?: string;
  size?: "default" | "hero";
}) {
  const isHero = size === "hero";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p
        className={`mt-2 font-mono tabular-nums ${
          isHero ? "text-4xl font-bold" : "text-2xl font-semibold"
        } ${colorClass ?? ""}`}
      >
        {value}
        {suffix && (
          <span className={`ml-2 font-medium ${isHero ? "text-lg" : "text-base"}`}>
            ({suffix})
          </span>
        )}
      </p>
      {subLine && (
        <p className="mt-1 font-mono text-xs tabular-nums text-gray-400 dark:text-gray-500">
          ({subLine})
        </p>
      )}
    </div>
  );
}
