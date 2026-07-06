export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface Props {
  segments: DonutSegment[];
  size?: number;
}

// Plain SVG stroke-based donut — no charting library. Each segment is a
// circle stroke arc sized by its share of the circumference; the shared <g>
// rotation starts every segment at 12 o'clock instead of 3 o'clock.
export function DonutChart({ segments, size = 160 }: Props) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const strokeWidth = 22;
  const radius = size / 2 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;

  let cumulative = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-100 dark:text-gray-800"
        />
        {total > 0 &&
          segments.map((s, i) => {
            const length = (s.value / total) * circumference;
            const dashoffset = -cumulative;
            cumulative += length;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={dashoffset}
              />
            );
          })}
      </g>
    </svg>
  );
}
