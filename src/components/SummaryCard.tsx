export function SummaryCard({
  label,
  value,
  suffix,
  caption,
  colorClass,
  size = "default",
}: {
  label: string;
  value: string;
  suffix?: string;
  /** Short static explanatory line under the value — e.g. clarifying a
   *  figure computed differently from others nearby. Not a computed
   *  secondary value (that was the old, now-removed `subLine` prop). */
  caption?: string;
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
      {caption && <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">{caption}</p>}
    </div>
  );
}
