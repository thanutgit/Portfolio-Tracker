"use client";

interface Props {
  portfolios: { id: string; name: string }[];
  selectedId: string;
  onChange: (id: string) => void;
}

export function PortfolioPicker({ portfolios, selectedId, onChange }: Props) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <label
        htmlFor="portfolio"
        className="text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        Portfolio
      </label>
      <select
        id="portfolio"
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900"
      >
        {portfolios.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
