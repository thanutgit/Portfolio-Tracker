import Link from "next/link";

interface Props {
  name: string;
}

// Replaces the old dropdown (`PortfolioPicker`) — the portfolio shown here
// is fixed by the URL, not switchable in place. Switching portfolios now
// happens exclusively from Overview (`/`), which is what "Switch
// portfolio" links to.
export function PortfolioLabel({ name }: Props) {
  return (
    <div className="mb-6 flex items-center gap-3 text-sm">
      <span className="text-gray-500 dark:text-gray-400">Portfolio</span>
      <span className="font-medium text-gray-900 dark:text-gray-100">{name}</span>
      <Link
        href="/"
        className="cursor-pointer text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
      >
        Switch portfolio
      </Link>
    </div>
  );
}
