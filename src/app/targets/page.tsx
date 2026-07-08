"use client";

import { Suspense, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePortfolios } from "@/lib/hooks/usePortfolios";
import { PortfolioLabel } from "@/components/PortfolioLabel";
import { EmptyState } from "@/components/EmptyState";
import { CONTAINER_CLASS } from "@/lib/layout";

interface TargetRow {
  asset_id: string;
  symbol: string;
  name: string;
  target_pct: string;
  drift_threshold: string;
}

interface TargetRecord {
  asset_id: string;
  target_pct: string;
  drift_threshold: string;
}

export default function TargetsPage() {
  return (
    <Suspense fallback={null}>
      <TargetsPageContent />
    </Suspense>
  );
}

function TargetsPageContent() {
  const {
    portfolios,
    selectedId,
    loading: loadingPortfolios,
    error: portfoliosError,
  } = usePortfolios();
  const [rows, setRows] = useState<TargetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setSaveMessage(null);
      const [holdingsRes, targetsRes] = await Promise.all([
        supabase
          .from("holdings")
          .select("asset_id, symbol, name")
          .eq("portfolio_id", selectedId)
          .order("symbol"),
        supabase
          .from("targets")
          .select("asset_id, target_pct, drift_threshold")
          .eq("portfolio_id", selectedId),
      ]);
      if (cancelled) return;
      if (holdingsRes.error) {
        setError(holdingsRes.error.message);
        setLoading(false);
        return;
      }
      if (targetsRes.error) {
        setError(targetsRes.error.message);
        setLoading(false);
        return;
      }

      const holdingsData = holdingsRes.data ?? [];
      const targetsData = (targetsRes.data ?? []) as TargetRecord[];
      const targetMap = new Map(targetsData.map((t) => [t.asset_id, t]));

      setRows(
        holdingsData.map((h) => {
          const existing = targetMap.get(h.asset_id);
          return {
            asset_id: h.asset_id,
            symbol: h.symbol,
            name: h.name,
            target_pct: existing ? existing.target_pct : "0",
            drift_threshold: existing ? existing.drift_threshold : "5",
          };
        })
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  function updateRow(assetId: string, field: "target_pct" | "drift_threshold", value: string) {
    setRows((prev) => prev.map((r) => (r.asset_id === assetId ? { ...r, [field]: value } : r)));
    setSaveMessage(null);
  }

  const totalPct = rows.reduce((sum, r) => sum + (Number(r.target_pct) || 0), 0);
  const totalOffBy100 = rows.length > 0 && Math.abs(totalPct - 100) > 0.01;

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    const payload = rows.map((r) => ({
      portfolio_id: selectedId,
      asset_id: r.asset_id,
      target_pct: Number(r.target_pct) || 0,
      drift_threshold: Number(r.drift_threshold) || 5,
    }));
    const { error } = await supabase
      .from("targets")
      .upsert(payload, { onConflict: "portfolio_id,asset_id" });
    if (error) {
      setError(error.message);
    } else {
      setSaveMessage("Saved.");
    }
    setSaving(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <main className={`${CONTAINER_CLASS} py-10`}>
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Targets</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Set the target allocation (%) for each asset you currently hold. Used by the
            Rebalancing page.
          </p>
        </header>

        {(error || portfoliosError) && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error ?? portfoliosError}
          </div>
        )}

        {loadingPortfolios ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading portfolios…</p>
        ) : portfolios.length === 0 ? (
          <EmptyState title="No portfolios yet" description="Create a portfolio to get started." />
        ) : (
          <>
            <PortfolioLabel name={portfolios.find((p) => p.id === selectedId)?.name ?? ""} />

            {loading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading holdings…</p>
            ) : rows.length === 0 ? (
              <EmptyState
                title="No holdings in this portfolio"
                description="Targets can only be set for assets you currently hold."
              />
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                        <th className="px-4 py-3 font-medium">Symbol</th>
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 text-right font-medium">Target %</th>
                        <th className="px-4 py-3 text-right font-medium">Drift threshold %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {rows.map((r) => (
                        <tr key={r.asset_id}>
                          <td className="px-4 py-3 font-medium">{r.symbol}</td>
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{r.name}</td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={r.target_pct}
                              onChange={(e) => updateRow(r.asset_id, "target_pct", e.target.value)}
                              className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1 text-right font-mono tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={r.drift_threshold}
                              onChange={(e) =>
                                updateRow(r.asset_id, "drift_threshold", e.target.value)
                              }
                              className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1 text-right font-mono tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
                  <p
                    className={`text-sm font-medium ${
                      totalOffBy100
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    Total target: {totalPct.toFixed(2)}%
                    {totalOffBy100 && " — should add up to 100%"}
                  </p>
                  <div className="flex items-center gap-3">
                    {saveMessage && (
                      <span className="text-sm text-green-600 dark:text-green-400">
                        {saveMessage}
                      </span>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-blue-700 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
                    >
                      {saving ? "Saving…" : "Save targets"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
