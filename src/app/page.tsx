"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { EmptyState } from "@/components/EmptyState";
import { NewPortfolioModal } from "@/components/NewPortfolioModal";
import { EditPortfolioModal } from "@/components/EditPortfolioModal";
import { Toast } from "@/components/Toast";
import type { HoldingWithReturns, Portfolio } from "@/lib/types";
import { formatCurrencyBreakdown, formatMoney, formatPercent, pnlBadgeClass } from "@/lib/format";
import { CONTAINER_CLASS } from "@/lib/layout";
import { countDriftedAssets, type DriftHolding, type DriftTarget } from "@/lib/drift";
import { getFxRatesForPairs, fxPairKey, nonBaseCurrencyTotals } from "@/lib/fx";
import { DriftBadge } from "@/components/DriftBadge";
import { PageHeader } from "@/components/PageHeader";
import { RequireAuth } from "@/components/RequireAuth";

function WalletIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-5 w-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 6.5A1.5 1.5 0 0 1 4.5 5h9A1.5 1.5 0 0 1 15 6.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 13.5v-7Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12.5 9.5H15a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-2.5a1.5 1.5 0 0 1 0-3Z"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="mt-1 h-5 w-5 flex-shrink-0 text-gray-400 transition-colors duration-150 group-hover:text-blue-500 dark:text-gray-600 dark:group-hover:text-blue-400"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 4.5l6 5.5-6 5.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-4 w-4"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 4v12M4 10h12" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 3.5l3 3L7 16l-4 1 1-4L13.5 3.5z" />
    </svg>
  );
}

interface PortfolioSummary {
  portfolio: Portfolio;
  holdingsCount: number;
  totalValue: number;
  totalReturn: number;
  totalReturnPct: number | null;
  driftedCount: number | null;
  // Count of this portfolio's holdings whose currency differs from the
  // portfolio's base_currency AND whose today's FX rate couldn't be
  // fetched — those holdings contribute 0 to totalValue/totalReturn
  // above rather than being converted, same "show what we can" approach
  // as Holdings' unpriced-holdings handling. See DECISIONS.md D127-D130.
  fxUnconvertedCount: number;
  // Raw (unconverted), per-currency totals for every non-base-currency
  // holding — disclosed alongside totalValue, independent of whether
  // fxUnconvertedCount is 0 (see D132).
  currencyBreakdown: { currency: string; amount: number }[];
}

export default function OverviewPage() {
  const [summaries, setSummaries] = useState<PortfolioSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewPortfolio, setShowNewPortfolio] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  async function loadSummaries() {
    setLoading(true);
    setError(null);
    const [portfoliosRes, holdingsRes, targetsRes] = await Promise.all([
      supabase.from("portfolios").select("id, name, base_currency").order("name"),
      supabase.from("holdings_with_returns").select("*"),
      supabase.from("targets").select("portfolio_id, asset_id, target_pct, drift_threshold"),
    ]);
    if (portfoliosRes.error) {
      setError(portfoliosRes.error.message);
      setLoading(false);
      return;
    }
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

    const holdingsByPortfolio = new Map<string, HoldingWithReturns[]>();
    for (const h of (holdingsRes.data ?? []) as HoldingWithReturns[]) {
      const list = holdingsByPortfolio.get(h.portfolio_id) ?? [];
      list.push(h);
      holdingsByPortfolio.set(h.portfolio_id, list);
    }

    interface TargetRow {
      portfolio_id: string;
      asset_id: string;
      target_pct: string;
      drift_threshold: string;
    }
    const targetsByPortfolio = new Map<string, DriftTarget[]>();
    for (const t of (targetsRes.data ?? []) as TargetRow[]) {
      const list = targetsByPortfolio.get(t.portfolio_id) ?? [];
      list.push({
        asset_id: t.asset_id,
        target_pct: Number(t.target_pct),
        drift_threshold: Number(t.drift_threshold),
      });
      targetsByPortfolio.set(t.portfolio_id, list);
    }

    // Each portfolio's totals need every holding converted into THAT
    // portfolio's own base_currency, using today's rate (not each
    // transaction's trade_date rate — see DECISIONS.md D127). Collected
    // across all portfolios up front so getFxRatesForPairs can dedupe:
    // two portfolios both holding USD against a THB base only cost one
    // Frankfurter lookup, not two.
    const fxPairs: { from: string; to: string }[] = [];
    for (const portfolio of portfoliosRes.data ?? []) {
      const holdings = holdingsByPortfolio.get(portfolio.id) ?? [];
      for (const h of holdings) {
        if (h.currency !== portfolio.base_currency) {
          fxPairs.push({ from: h.currency, to: portfolio.base_currency });
        }
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    const { rates: fxRates, failed: fxFailed } =
      fxPairs.length > 0
        ? await getFxRatesForPairs(fxPairs, today)
        : { rates: new Map<string, number>(), failed: [] as { from: string; to: string }[] };
    const fxFailedKeys = new Set(fxFailed.map((p) => fxPairKey(p.from, p.to)));

    // null (not 0) when the currency doesn't match base AND has no rate —
    // callers below add `?? 0` explicitly at the point they sum, so the
    // "couldn't convert" case stays visible as a count rather than
    // silently vanishing into the total (see GOTCHAS.md #6).
    function convertToBase(value: number, currency: string, baseCurrency: string): number | null {
      if (currency === baseCurrency) return value;
      const rate = fxRates.get(fxPairKey(currency, baseCurrency));
      return rate === undefined ? null : value * rate;
    }

    const result: PortfolioSummary[] = (portfoliosRes.data ?? []).map((portfolio) => {
      const holdings = holdingsByPortfolio.get(portfolio.id) ?? [];
      const totalValue = holdings.reduce((sum, h) => {
        const converted = convertToBase(Number(h.market_value ?? 0), h.currency, portfolio.base_currency);
        return sum + (converted ?? 0);
      }, 0);
      const totalCostBasis = holdings.reduce((sum, h) => {
        const converted = convertToBase(Number(h.cost_basis ?? 0), h.currency, portfolio.base_currency);
        return sum + (converted ?? 0);
      }, 0);
      const totalReturn = holdings.reduce((sum, h) => {
        const raw = h.total_return === null ? 0 : Number(h.total_return);
        const converted = convertToBase(raw, h.currency, portfolio.base_currency);
        return sum + (converted ?? 0);
      }, 0);
      const totalReturnPct = totalCostBasis !== 0 ? (totalReturn / totalCostBasis) * 100 : null;
      const fxUnconvertedCount = holdings.filter(
        (h) => h.currency !== portfolio.base_currency && fxFailedKeys.has(fxPairKey(h.currency, portfolio.base_currency))
      ).length;
      const currencyBreakdown = nonBaseCurrencyTotals(holdings, portfolio.base_currency);
      const driftHoldings: DriftHolding[] = holdings.map((h) => ({
        asset_id: h.asset_id,
        market_value: Number(h.market_value ?? 0),
      }));
      const driftedCount = countDriftedAssets(
        driftHoldings,
        targetsByPortfolio.get(portfolio.id) ?? []
      );
      return {
        portfolio,
        holdingsCount: holdings.length,
        totalValue,
        totalReturn,
        totalReturnPct,
        driftedCount,
        fxUnconvertedCount,
        currencyBreakdown,
      };
    });

    setSummaries(result);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSummaries();
  }, []);

  async function handlePortfolioCreated() {
    setShowNewPortfolio(false);
    setToastMessage("Portfolio created.");
    await loadSummaries();
  }

  async function handlePortfolioRenamed() {
    setEditingPortfolio(null);
    setToastMessage("Portfolio renamed.");
    await loadSummaries();
  }

  return (
    <RequireAuth>
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <main className={`${CONTAINER_CLASS} py-10`}>
        <PageHeader
          title="Overview"
          description="All your portfolios at a glance — pick one to see its holdings."
        />

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading portfolios…</p>
        ) : !summaries || summaries.length === 0 ? (
          <div className="space-y-3">
            <EmptyState
              title="No portfolios yet"
              description="Create one below to get started."
            />
            <button
              onClick={() => setShowNewPortfolio(true)}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white p-5 text-sm font-medium text-gray-500 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-blue-500/50 hover:text-blue-600 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-blue-400/50 dark:hover:text-blue-400"
            >
              <PlusIcon />
              New portfolio
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {summaries.map(
              ({
                portfolio,
                holdingsCount,
                totalValue,
                totalReturn,
                totalReturnPct,
                driftedCount,
                fxUnconvertedCount,
                currencyBreakdown,
              }) => {
                const showPercentBadge = holdingsCount > 0 && totalReturnPct !== null;
                return (
              <Link
                key={portfolio.id}
                href={`/holdings?portfolio=${portfolio.id}`}
                className="group flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-blue-500/40 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-400/40"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400">
                    <WalletIcon />
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                        {portfolio.name}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          // Stop the click from also triggering the
                          // surrounding <Link>'s navigation to Holdings —
                          // this button intentionally sits inside a whole-
                          // card link.
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingPortfolio(portfolio);
                        }}
                        aria-label="Rename portfolio"
                        className="inline-flex h-6 w-6 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-all duration-150 hover:-translate-y-px hover:bg-gray-100 hover:text-blue-600 hover:shadow-sm active:translate-y-0 active:shadow-none dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-blue-400"
                      >
                        <PencilIcon />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {holdingsCount} holding{holdingsCount === 1 ? "" : "s"}
                      {fxUnconvertedCount > 0 &&
                        ` · FX rate unavailable for ${fxUnconvertedCount}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end gap-1.5">
                    <p className="whitespace-nowrap font-mono text-xl font-medium tabular-nums text-gray-900 dark:text-gray-100">
                      {formatMoney(totalValue, portfolio.base_currency)}
                    </p>
                    {currencyBreakdown.length > 0 && (
                      <p className="whitespace-nowrap font-mono text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
                        ({formatCurrencyBreakdown(currencyBreakdown)})
                      </p>
                    )}
                    {(showPercentBadge || !!driftedCount) && (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {showPercentBadge && (
                          <span
                            className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${pnlBadgeClass(totalReturn)}`}
                          >
                            {formatPercent(totalReturnPct as number)}
                          </span>
                        )}
                        <DriftBadge count={driftedCount} />
                      </div>
                    )}
                  </div>
                  <ChevronRightIcon />
                </div>
              </Link>
                );
              }
            )}

            <button
              onClick={() => setShowNewPortfolio(true)}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white p-5 text-sm font-medium text-gray-500 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-blue-500/50 hover:text-blue-600 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-blue-400/50 dark:hover:text-blue-400"
            >
              <PlusIcon />
              New portfolio
            </button>
          </div>
        )}
      </main>

      {showNewPortfolio && (
        <NewPortfolioModal
          onClose={() => setShowNewPortfolio(false)}
          onCreated={handlePortfolioCreated}
        />
      )}

      {editingPortfolio && (
        <EditPortfolioModal
          portfolio={editingPortfolio}
          onClose={() => setEditingPortfolio(null)}
          onSaved={handlePortfolioRenamed}
        />
      )}

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
    </RequireAuth>
  );
}
