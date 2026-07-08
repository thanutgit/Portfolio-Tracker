"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CONTAINER_CLASS } from "@/lib/layout";

const LINKS = [
  { href: "/holdings", label: "Holdings" },
  { href: "/targets", label: "Targets" },
  { href: "/rebalancing", label: "Rebalancing" },
  { href: "/prices", label: "Prices" },
  { href: "/assets", label: "Assets" },
  { href: "/settings", label: "Settings" },
];

const INACTIVE_CLASS =
  "rounded-full px-3 py-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100";
const ACTIVE_CLASS =
  "rounded-full bg-blue-500/10 px-3 py-1.5 font-medium text-blue-600 dark:bg-blue-400/10 dark:text-blue-400";

export function NavBar() {
  const pathname = usePathname();
  // Overview ("/") has no portfolio selected yet, so the other tabs (which
  // all operate on a selected portfolio) don't mean anything there — just
  // the brand alone, no tabs beside it.
  const isOverview = pathname === "/";

  return (
    <nav className="sticky top-0 z-40 border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className={`${CONTAINER_CLASS} flex items-center gap-6 py-3 text-sm`}>
        <Link
          href="/"
          className="cursor-pointer text-lg font-semibold text-gray-900 transition-colors duration-150 hover:text-blue-600 dark:text-gray-100 dark:hover:text-blue-400"
        >
          Portfolio{" "}
          <span className="text-blue-500 [text-shadow:0_0_8px_rgba(59,130,246,0.9),0_0_18px_rgba(59,130,246,0.55)] dark:text-blue-400 dark:[text-shadow:0_0_8px_rgba(96,165,250,0.9),0_0_18px_rgba(96,165,250,0.55)]">
            Tracker
          </span>
        </Link>
        {!isOverview &&
          LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname === link.href ? ACTIVE_CLASS : INACTIVE_CLASS}
            >
              {link.label}
            </Link>
          ))}
      </div>
    </nav>
  );
}
