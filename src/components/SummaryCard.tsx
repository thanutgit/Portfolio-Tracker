export function SummaryCard({
  label,
  value,
  suffix,
  colorClass,
}: {
  label: string;
  value: string;
  suffix?: string;
  colorClass?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${colorClass ?? ""}`}>
        {value}
        {suffix && <span className="ml-2 text-base font-medium">({suffix})</span>}
      </p>
    </div>
  );
}
