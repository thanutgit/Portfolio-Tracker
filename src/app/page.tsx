"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePortfolios } from "@/lib/hooks/usePortfolios";
import { PortfolioPicker } from "@/components/PortfolioPicker";
import { SummaryCard } from "@/components/SummaryCard";
import { EmptyState } from "@/components/EmptyState";
import type { Holding } from "@/lib/types";
import {
  formatMoney,
  formatPercent,
  formatQuantity,
  formatSigned,
  pnlColor,
} from "@/lib/format";

export default function Home() {
  const {
    portfolios,
    selectedId,
    setSelectedId,
    loading: loadingPortfolios,
    error: portfoliosError,
  } = usePortfolios();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingHoldings(true);
      setError(null);
      const { data, error } = await supabase
        .from("holdings")
        .select("*")
        .eq("portfolio_id", selectedId)
        .order("symbol");
      if (cancelled) return;
      if (error) {
        setError(error.message);
      } else {
        setHoldings(data ?? []);
      }
      setLoadingHoldings(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selectedPortfolio = portfolios.find((p) => p.id === selectedId);
  const baseCurrency = selectedPortfolio?.base_currency ?? "THB";

  const totalMarketValue = holdings.reduce(
    (sum, h) => sum + Number(h.market_value ?? 0),
    0
  );
  const totalCostBasis = holdings.reduce((sum, h) => sum + Number(h.cost_basis ?? 0), 0);
  const totalPnl = holdings.reduce((sum, h) => sum + Number(h.unrealized_pnl ?? 0), 0);
  const totalPnlPct = totalCostBasis !== 0 ? (totalPnl / totalCostBasis) * 100 : null;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Holdings</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Holdings and unrealized P&amp;L, computed live from your transactions.
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
          <EmptyState
            title="No portfolios yet"
            description="Create a portfolio (in the portfolios table) to get started."
          />
        ) : (
          <>
            <PortfolioPicker
              portfolios={portfolios}
              selectedId={selectedId}
              onChange={setSelectedId}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SummaryCard
                label="Total market value"
                value={loadingHoldings ? "—" : formatMoney(totalMarketValue, baseCurrency)}
              />
              <SummaryCard
                label="Unrealized P&L"
                value={loadingHoldings ? "—" : formatSigned(totalPnl, baseCurrency)}
                suffix={
                  !loadingHoldings && totalPnlPct !== null
                    ? formatPercent(totalPnlPct)
                    : undefined
                }
                colorClass={loadingHoldings ? undefined : pnlColor(totalPnl)}
              />
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              {loadingHoldings ? (
                <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
                  Loading holdings…
                </p>
              ) : holdings.length === 0 ? (
                <EmptyState
                  title="No holdings in this portfolio"
                  description="Record a buy transaction to see it appear here."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                        <th className="px-4 py-3 font-medium">Symbol</th>
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 text-right font-medium">Qty</th>
                        <th className="px-4 py-3 text-right font-medium">Avg Cost</th>
                        <th className="px-4 py-3 text-right font-medium">Last Price</th>
                        <th className="px-4 py-3 text-right font-medium">Market Value</th>
                        <th className="px-4 py-3 text-right font-medium">Unrealized P&amp;L</th>
                        <th className="px-4 py-3 text-right font-medium">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {holdings.map((h) => {
                        const pnl = Number(h.unrealized_pnl ?? 0);
                        const pct =
                          h.unrealized_pct === null ? null : Number(h.unrealized_pct);
                        return (
                          <tr
                            key={h.asset_id}
                            className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                          >
                            <td className="px-4 py-3 font-medium">{h.symbol}</td>
                            <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                              {h.name}
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">
                              {formatQuantity(Number(h.quantity))}
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">
                              {formatMoney(Number(h.avg_cost), h.currency)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">
                              {h.last_price === null
                                ? "—"
                                : formatMoney(Number(h.last_price), h.currency)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">
                              {h.market_value === null
                                ? "—"
                                : formatMoney(Number(h.market_value), h.currency)}
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-mono tabular-nums ${pnlColor(pnl)}`}
                            >
                              {formatSigned(pnl, h.currency)}
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-mono tabular-nums ${
                                pct === null ? "" : pnlColor(pct)
                              }`}
                            >
                              {pct === null ? "—" : formatPercent(pct)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
