"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CONTAINER_CLASS } from "@/lib/layout";

const LINKS = [
  { href: "/holdings", label: "Holdings", portfolioScoped: true },
  { href: "/targets", label: "Targets", portfolioScoped: true },
  { href: "/rebalancing", label: "Rebalancing", portfolioScoped: true },
  { href: "/prices", label: "Prices", portfolioScoped: true },
  { href: "/assets", label: "Assets", portfolioScoped: false },
  { href: "/settings", label: "Settings", portfolioScoped: false },
];

const INACTIVE_CLASS =
  "rounded-full px-3 py-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100";
const ACTIVE_CLASS =
  "rounded-full bg-blue-500/10 px-3 py-1.5 font-medium text-blue-600 dark:bg-blue-400/10 dark:text-blue-400";

export function NavBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    // No route protection yet (Phase 7 step 1 only) — every page still
    // works fully logged-out, so "/" is a safe, non-confusing landing
    // spot rather than forcing straight to /login.
    router.push("/");
  }

  // Overview ("/") has no portfolio selected yet, so the other tabs (which
  // all operate on a selected portfolio) don't mean anything there — just
  // the brand alone, no tabs beside it. Same reasoning applies to the auth
  // pages: no portfolio/user context yet either.
  const isOverview = pathname === "/";
  const isAuthPage = pathname === "/login" || pathname === "/signup";
  const portfolioId = searchParams.get("portfolio");

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
          !isAuthPage &&
          LINKS.map((link) => {
            const href =
              link.portfolioScoped && portfolioId
                ? `${link.href}?portfolio=${portfolioId}`
                : link.href;
            return (
              <Link
                key={link.href}
                href={href}
                className={pathname === link.href ? ACTIVE_CLASS : INACTIVE_CLASS}
              >
                {link.label}
              </Link>
            );
          })}

        <div className="ml-auto flex items-center gap-3">
          {email ? (
            <button
              onClick={handleLogout}
              className="cursor-pointer rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-gray-50 hover:shadow-md active:translate-y-0 active:shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Log out
            </button>
          ) : (
            !isAuthPage && (
              <Link
                href="/login"
                className="cursor-pointer text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                Log in
              </Link>
            )
          )}
        </div>
      </div>
    </nav>
  );
}
