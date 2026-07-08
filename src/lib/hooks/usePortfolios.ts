"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Portfolio } from "@/lib/types";

// The selected portfolio lives in the URL (`?portfolio=<id>`), not local
// component state — that's what lets it survive switching between
// Holdings/Targets/Rebalancing via the nav bar, instead of resetting to
// the first portfolio on every tab change. Callers using this hook must
// be rendered inside a <Suspense> boundary (useSearchParams() requires
// one) — see holdings/targets/rebalancing page.tsx for the pattern.
export function usePortfolios() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const urlPortfolioId = searchParams.get("portfolio");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("portfolios")
        .select("id, name, base_currency")
        .order("name");
      if (cancelled) return;
      if (error) {
        setError(error.message);
      } else {
        setPortfolios(data ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isValidIncoming = portfolios.some((p) => p.id === urlPortfolioId);

  // No portfolio id in the URL at all, or one that doesn't match a real
  // portfolio (e.g. a stale bookmark): fall back to the first portfolio,
  // same as before, and sync the URL to match — `replace`, not `push`, so
  // this doesn't add a back-button history entry.
  useEffect(() => {
    if (portfolios.length === 0 || isValidIncoming) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("portfolio", portfolios[0].id);
    router.replace(`${pathname}?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolios, isValidIncoming]);

  const selectedId = isValidIncoming ? (urlPortfolioId as string) : "";

  return { portfolios, selectedId, loading, error };
}
