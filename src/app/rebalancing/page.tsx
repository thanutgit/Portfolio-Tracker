"use client";

import { Suspense, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePortfolios } from "@/lib/hooks/usePortfolios";
import { PortfolioLabel } from "@/components/PortfolioLabel";
import { PageHeader } from "@/components/PageHeader";
import { RequireAuth } from "@/components/RequireAuth";
import { EmptyState } from "@/components/EmptyState";
import type { Holding } from "@/lib/types";
import { formatMoney, formatPercent, formatQuantity } from "@/lib/format";
import { CONTAINER_CLASS } from "@/lib/layout";
import { computeDrift, type DriftHolding, type DriftTarget } from "@/lib/drift";

interface TargetWithAsset {
  asset_id: string;
  target_pct: string;
  drift_threshold: string;
  assets: { symbol: string; name: string; currency: string } | null;
}

interface RebalanceRow {
  asset_id: string;
  symbol: string;
  name: string;
  currency: string;
  currentPct: number;
  targetPct: number;
  driftThreshold: number;
  drift: number;
  diffValue: number;
  lastPrice: number | null;
  diffUnits: number | null;
  outOfThreshold: boolean;
}

export default function RebalancingPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <RebalancingPageContent />
      </Suspense>
    </RequireAuth>
  );
}

function RebalancingPageContent() {
  const {
    portfolios,
    selectedId,
    loading: loadingPortfolios,
    error: portfoliosError,
  } = usePortfolios();
  const [rows, setRows] = useState<RebalanceRow[]>([]);
  const [totalMarketValue, setTotalMarketValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const [holdingsRes, targetsRes] = await Promise.all([
        supabase.from("holdings").select("*").eq("portfolio_id", selectedId),
        supabase
          .from("targets")
          .select("asset_id, target_pct, drift_threshold, assets(symbol, name, currency)")
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

      const holdings = (holdingsRes.data ?? []) as Holding[];
      const targets = (targetsRes.data ?? []) as unknown as TargetWithAsset[];

      const totalMV = holdings.reduce((sum, h) => sum + Number(h.market_value ?? 0), 0);

      const driftHoldings: DriftHolding[] = holdings.map((h) => ({
        asset_id: h.asset_id,
        market_value: Number(h.market_value ?? 0),
      }));
      const driftTargets: DriftTarget[] = targets.map((t) => ({
        asset_id: t.asset_id,
        target_pct: Number(t.target_pct),
        drift_threshold: Number(t.drift_threshold),
      }));
      const driftByAsset = new Map(
        computeDrift(driftHoldings, driftTargets).map((d) => [d.asset_id, d])
      );

      const holdingsMap = new Map(holdings.map((h) => [h.asset_id, h]));
      const targetsMap = new Map(targets.map((t) => [t.asset_id, t]));
      const assetIds = new Set([...holdingsMap.keys(), ...targetsMap.keys()]);

      const merged: RebalanceRow[] = Array.from(assetIds).map((assetId) => {
        const h = holdingsMap.get(assetId);
        const t = targetsMap.get(assetId);
        const d = driftByAsset.get(assetId)!;
        const marketValue = Number(h?.market_value ?? 0);
        const targetValue = (d.targetPct / 100) * totalMV;
        const diffValue = targetValue - marketValue;
        const lastPrice = h?.last_price != null ? Number(h.last_price) : null;
        const diffUnits = lastPrice && lastPrice !== 0 ? diffValue / lastPrice : null;

        return {
          asset_id: assetId,
          symbol: h?.symbol ?? t?.assets?.symbol ?? "—",
          name: h?.name ?? t?.assets?.name ?? "—",
          currency: h?.currency ?? t?.assets?.currency ?? "THB",
          currentPct: d.currentPct,
          targetPct: d.targetPct,
          driftThreshold: d.driftThreshold,
          drift: d.drift,
          diffValue,
          lastPrice,
          diffUnits,
          outOfThreshold: d.outOfThreshold,
        };
      });

      merged.sort((a, b) => b.currentPct - a.currentPct);

      setRows(merged);
      setTotalMarketValue(totalMV);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selectedPortfolio = portfolios.find((p) => p.id === selectedId);
  const baseCurrency = selectedPortfolio?.base_currency ?? "THB";
  const flaggedCount = rows.filter((r) => r.outOfThreshold).length;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <main className={`${CONTAINER_CLASS} py-10`}>
        <PageHeader
          title="Rebalancing"
          description="Current allocation vs. target, based on the holdings view and your saved targets."
        />

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
            <PortfolioLabel name={selectedPortfolio?.name ?? ""} />

            {loading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
            ) : rows.length === 0 ? (
              <EmptyState
                title="Nothing to rebalance yet"
                description="Hold some assets and set targets for them first, on the Targets page."
              />
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 text-sm dark:border-gray-800">
                  <span className="text-gray-500 dark:text-gray-400">
                    Total value:{" "}
                    <span className="font-mono tabular-nums text-gray-900 dark:text-gray-100">
                      {formatMoney(totalMarketValue, baseCurrency)}
                    </span>
                  </span>
                  <span
                    className={
                      flaggedCount > 0
                        ? "font-medium text-amber-600 dark:text-amber-400"
                        : "text-gray-500 dark:text-gray-400"
                    }
                  >
                    {flaggedCount > 0
                      ? `${flaggedCount} asset(s) need rebalancing`
                      : "All within threshold"}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                        <th className="px-4 py-3 font-medium">Symbol</th>
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 text-right font-medium">Current %</th>
                        <th className="px-4 py-3 text-right font-medium">Target %</th>
                        <th className="px-4 py-3 text-right font-medium">Drift</th>
                        <th className="px-4 py-3 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {rows.map((r) => (
                        <tr
                          key={r.asset_id}
                          className={r.outOfThreshold ? "bg-amber-50 dark:bg-amber-950/30" : ""}
                        >
                          <td className="px-4 py-3 font-medium">{r.symbol}</td>
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{r.name}</td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">
                            {r.currentPct.toFixed(2)}%
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">
                            {r.targetPct.toFixed(2)}%
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">
                            {formatPercent(r.drift)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {!r.outOfThreshold ? (
                              <span className="text-gray-400 dark:text-gray-500">
                                within threshold
                              </span>
                            ) : r.diffValue > 0 ? (
                              <span className="font-medium">
                                Buy {formatMoney(r.diffValue, r.currency)}
                                {r.diffUnits !== null &&
                                  ` (${formatQuantity(r.diffUnits)} units)`}
                              </span>
                            ) : r.diffValue < 0 ? (
                              <span className="font-medium">
                                Sell {formatMoney(Math.abs(r.diffValue), r.currency)}
                                {r.diffUnits !== null &&
                                  ` (${formatQuantity(Math.abs(r.diffUnits))} units)`}
                              </span>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500">on target</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
