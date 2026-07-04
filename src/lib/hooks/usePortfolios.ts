"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Portfolio } from "@/lib/types";

export function usePortfolios() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        if (data && data.length > 0) setSelectedId(data[0].id);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { portfolios, selectedId, setSelectedId, loading, error };
}
