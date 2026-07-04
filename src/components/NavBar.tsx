import Link from "next/link";

const LINK_CLASS =
  "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100";

export function NavBar() {
  return (
    <nav className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 text-sm sm:px-6 lg:px-8">
        <Link href="/" className="font-semibold text-gray-900 dark:text-gray-100">
          Portfolio Tracker
        </Link>
        <Link href="/" className={LINK_CLASS}>
          Holdings
        </Link>
        <Link href="/targets" className={LINK_CLASS}>
          Targets
        </Link>
        <Link href="/rebalancing" className={LINK_CLASS}>
          Rebalancing
        </Link>
      </div>
    </nav>
  );
}
