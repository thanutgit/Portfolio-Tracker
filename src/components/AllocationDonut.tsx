import { DonutChart, type DonutSegment } from "@/components/DonutChart";

interface Props {
  title: string;
  segments: DonutSegment[];
}

export function AllocationDonut({ title, segments }: Props) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h2>
      {total === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No holdings with a current value yet.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <DonutChart segments={segments} />
          <ul className="w-full min-w-0 space-y-2">
            {segments.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-gray-700 dark:text-gray-300">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="truncate">{s.label}</span>
                </span>
                <span className="shrink-0 font-mono tabular-nums text-gray-500 dark:text-gray-400">
                  {((s.value / total) * 100).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
