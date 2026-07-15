import Link from "next/link";

function SwitchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-3.5 w-3.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.5h9m0 0-2.5-2.5M15 6.5 12.5 9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 13.5H5m0 0 2.5-2.5M5 13.5 7.5 16" />
    </svg>
  );
}

interface Props {
  name: string;
  currency: string;
}

// Replaces the old dropdown (`PortfolioPicker`) — the portfolio shown here
// is fixed by the URL, not switchable in place. Switching portfolios now
// happens exclusively from Overview (`/`), which is what "Switch
// portfolio" links to.
export function PortfolioLabel({ name, currency }: Props) {
  return (
    <div className="mb-6 flex items-center gap-3 text-sm">
      <span className="text-gray-500 dark:text-gray-400">Portfolio</span>
      <span className="font-medium text-gray-900 dark:text-gray-100">{name}</span>
      <span className="rounded-full bg-gray-500/10 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-400/10 dark:text-gray-400">
        {currency}
      </span>
      <Link
        href="/"
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-gray-50 hover:shadow-md active:translate-y-0 active:shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <SwitchIcon />
        Switch portfolio
      </Link>
    </div>
  );
}
