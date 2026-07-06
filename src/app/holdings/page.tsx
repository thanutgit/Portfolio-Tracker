"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { usePortfolios } from "@/lib/hooks/usePortfolios";
import { PortfolioPicker } from "@/components/PortfolioPicker";
import { SummaryCard } from "@/components/SummaryCard";
import { EmptyState } from "@/components/EmptyState";
import { DividendModal } from "@/components/DividendModal";
import { TransactionModal } from "@/components/TransactionModal";
import { Toast } from "@/components/Toast";
import type { HoldingWithReturns } from "@/lib/types";
import {
  formatDateTime,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatSigned,
  pnlColor,
} from "@/lib/format";

interface RefreshCryptoResponse {
  updated: { symbol: string; price: number; as_of: string }[];
}

function CoinIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-4 w-4"
    >
      <circle cx="10" cy="10" r="6.5" />
      <path
        strokeLinecap="round"
        d="M10 6.75v6.5M12.25 8.25c0-.83-1.01-1.5-2.25-1.5s-2.25.67-2.25 1.5S8.76 9.75 10 9.75s2.25.67 2.25 1.5-1.01 1.5-2.25 1.5-2.25-.67-2.25-1.5"
      />
    </svg>
  );
}

export default function HoldingsPage() {
  return (
    <Suspense fallback={null}>
      <HoldingsPageContent />
    </Suspense>
  );
}

function HoldingsPageContent() {
  const searchParams = useSearchParams();
  const {
    portfolios,
    selectedId,
    setSelectedId,
    loading: loadingPortfolios,
    error: portfoliosError,
  } = usePortfolios();
  const [holdings, setHoldings] = useState<HoldingWithReturns[]>([]);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dividendTarget, setDividendTarget] = useState<HoldingWithReturns | null>(null);
  const [cryptoLastUpdated, setCryptoLastUpdated] = useState<string | null>(null);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showAddTransaction, setShowAddTransaction] = useState(false);

  // Honors an incoming ?portfolio=<id> (e.g. from the Overview page's
  // portfolio cards) as the initial selection, without changing the
  // dropdown itself — once loaded, switching portfolios still works exactly
  // as before via usePortfolios()'s own selectedId/setSelectedId.
  const requestedPortfolioId = searchParams.get("portfolio");
  useEffect(() => {
    if (!requestedPortfolioId) return;
    if (portfolios.some((p) => p.id === requestedPortfolioId)) {
      setSelectedId(requestedPortfolioId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedPortfolioId, portfolios]);

  async function loadHoldings(signal?: { cancelled: boolean }, silent = false) {
    if (!selectedId) return;
    if (!silent) {
      setLoadingHoldings(true);
      setError(null);
    }
    // holdings_with_returns = holdings view + net_dividends/total_return (migrations/0004)
    const { data, error } = await supabase
      .from("holdings_with_returns")
      .select("*")
      .eq("portfolio_id", selectedId)
      .order("symbol");
    if (signal?.cancelled) return;
    if (error) {
      if (!silent) setError(error.message);
    } else {
      setHoldings(data ?? []);
      // Auto-snapshot only on non-silent loads (initial mount / portfolio
      // switch) — not on every 60s silent crypto-refresh reload. Quiet, like
      // crypto auto-refresh: no loading state, errors swallowed.
      if (!silent) autoSnapshotIfMissing(selectedId, data ?? []);
    }
    if (!silent) setLoadingHoldings(false);
  }

  // portfolio_snapshots = daily total_value/total_cost/cash_value per
  // portfolio (migrations/0005) — data for a future growth chart, no chart yet.
  async function computeSnapshotPayload(portfolioId: string, holdingsData: HoldingWithReturns[]) {
    const totalValue = holdingsData.reduce((sum, h) => sum + Number(h.market_value ?? 0), 0);
    const totalCost = holdingsData.reduce((sum, h) => sum + Number(h.cost_basis ?? 0), 0);

    let cashValue = 0;
    const assetIds = holdingsData.map((h) => h.asset_id);
    if (assetIds.length > 0) {
      const { data: assetsData } = await supabase
        .from("assets")
        .select("id, asset_type")
        .in("id", assetIds);
      const cashAssetIds = new Set(
        (assetsData ?? []).filter((a) => a.asset_type === "cash").map((a) => a.id)
      );
      cashValue = holdingsData
        .filter((h) => cashAssetIds.has(h.asset_id))
        .reduce((sum, h) => sum + Number(h.market_value ?? 0), 0);
    }

    return {
      portfolio_id: portfolioId,
      snapshot_date: new Date().toISOString().slice(0, 10),
      total_value: totalValue,
      total_cost: totalCost,
      cash_value: cashValue,
    };
  }

  async function autoSnapshotIfMissing(portfolioId: string, holdingsData: HoldingWithReturns[]) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: existing } = await supabase
        .from("portfolio_snapshots")
        .select("id")
        .eq("portfolio_id", portfolioId)
        .eq("snapshot_date", today)
        .maybeSingle();
      if (existing) return;
      const payload = await computeSnapshotPayload(portfolioId, holdingsData);
      await supabase
        .from("portfolio_snapshots")
        .upsert(payload, { onConflict: "portfolio_id,snapshot_date" });
    } catch {
      // quiet — same philosophy as crypto auto-refresh, just try again next load
    }
  }

  async function handleSaveSnapshot() {
    if (!selectedId) return;
    setSavingSnapshot(true);
    setError(null);
    const payload = await computeSnapshotPayload(selectedId, holdings);
    const { error } = await supabase
      .from("portfolio_snapshots")
      .upsert(payload, { onConflict: "portfolio_id,snapshot_date" });
    if (error) {
      setError(error.message);
    } else {
      setToastMessage("Saved today's value.");
    }
    setSavingSnapshot(false);
  }

  async function handleTransactionSaved() {
    setShowAddTransaction(false);
    setToastMessage("Transaction saved.");
    await loadHoldings();
  }

  useEffect(() => {
    if (!selectedId) return;
    const signal = { cancelled: false };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHoldings(signal);
    return () => {
      signal.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function loadCryptoLastUpdated() {
    const { data: cryptoAssets } = await supabase
      .from("assets")
      .select("id")
      .eq("asset_type", "crypto");
    const ids = (cryptoAssets ?? []).map((a) => a.id);
    if (ids.length === 0) return;
    const { data: latest } = await supabase
      .from("prices")
      .select("as_of")
      .in("asset_id", ids)
      .eq("source", "api")
      .order("as_of", { ascending: false })
      .limit(1);
    if (latest && latest.length > 0) setCryptoLastUpdated(latest[0].as_of);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCryptoLastUpdated();
  }, []);

  // Always silent: no loading state, no banner. Errors are swallowed — a
  // failed poll just tries again on the next tick.
  async function refreshCryptoPrices() {
    try {
      const res = await fetch("/api/refresh-crypto-prices", { method: "POST" });
      if (!res.ok) return;
      const json: RefreshCryptoResponse = await res.json();
      if (json.updated.length > 0) {
        setCryptoLastUpdated(json.updated[0].as_of);
        await loadHoldings(undefined, true);
      }
    } catch {
      // ignore — next tick will retry
    }
  }

  // Fire once immediately on mount (so an F5 refresh gets live prices right
  // away instead of waiting up to 60s), then every 60s after that. Effect is
  // keyed on selectedId so it restarts (simplest way to avoid a stale-closure
  // bug) when the user switches portfolios; stops automatically on navigating
  // away from this page.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshCryptoPrices();
    const interval = setInterval(() => {
      refreshCryptoPrices();
    }, 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const totalReturn = holdings.reduce((sum, h) => sum + Number(h.total_return ?? 0), 0);
  const totalReturnPct = totalCostBasis !== 0 ? (totalReturn / totalCostBasis) * 100 : null;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Holdings</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Holdings, unrealized P&amp;L, and total return (incl. dividends), computed live
            from your transactions.
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

            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {cryptoLastUpdated
                  ? `Crypto prices last updated: ${formatDateTime(cryptoLastUpdated)}`
                  : "Crypto prices not yet fetched"}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddTransaction(true)}
                  className="cursor-pointer rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-blue-700 hover:shadow-md active:translate-y-0 active:shadow-sm"
                >
                  + Add transaction
                </button>
                <button
                  onClick={handleSaveSnapshot}
                  disabled={savingSnapshot || holdings.length === 0}
                  className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-gray-50 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {savingSnapshot ? "Saving…" : "Save today's value"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <SummaryCard
                label="Total market value"
                value={loadingHoldings ? "—" : formatMoney(totalMarketValue, baseCurrency)}
                size="hero"
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
              <SummaryCard
                label="Total return (incl. dividends)"
                value={loadingHoldings ? "—" : formatSigned(totalReturn, baseCurrency)}
                suffix={
                  !loadingHoldings && totalReturnPct !== null
                    ? formatPercent(totalReturnPct)
                    : undefined
                }
                colorClass={loadingHoldings ? undefined : pnlColor(totalReturn)}
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
                  <table className="w-full min-w-[1040px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                        <th className="px-4 py-3 font-medium">Symbol</th>
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 text-right font-medium">Qty</th>
                        <th className="px-4 py-3 text-right font-medium">Avg Cost</th>
                        <th className="px-4 py-3 text-right font-medium">Last Price</th>
                        <th className="px-4 py-3 text-right font-medium">Market Value</th>
                        <th className="px-4 py-3 text-right font-medium">
                          Unrealized P&amp;L
                          <div className="text-[10px] font-normal normal-case text-gray-400 dark:text-gray-500">
                            price only
                          </div>
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          Dividends
                          <div className="text-[10px] font-normal normal-case text-gray-400 dark:text-gray-500">
                            net of tax
                          </div>
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          Total Return
                          <div className="text-[10px] font-normal normal-case text-gray-400 dark:text-gray-500">
                            P&amp;L + dividends
                          </div>
                        </th>
                        <th className="px-4 py-3 text-right font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {holdings.map((h) => {
                        const pnl = Number(h.unrealized_pnl ?? 0);
                        const pct =
                          h.unrealized_pct === null ? null : Number(h.unrealized_pct);
                        const netDividends = Number(h.net_dividends ?? 0);
                        const totalRet = Number(h.total_return ?? 0);
                        const totalRetPct =
                          h.total_return_pct === null ? null : Number(h.total_return_pct);
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
                              <span className="ml-1 text-xs">
                                {pct === null ? "" : `(${formatPercent(pct)})`}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-700 dark:text-gray-300">
                              {formatMoney(netDividends, h.currency)}
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-mono tabular-nums ${pnlColor(totalRet)}`}
                            >
                              {formatSigned(totalRet, h.currency)}
                              <span className="ml-1 text-xs">
                                {totalRetPct === null ? "" : `(${formatPercent(totalRetPct)})`}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => setDividendTarget(h)}
                                aria-label="Record dividend"
                                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-all duration-150 hover:-translate-y-px hover:bg-gray-100 hover:text-blue-600 hover:shadow-sm active:translate-y-0 active:shadow-none dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-blue-400"
                              >
                                <CoinIcon />
                              </button>
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

      {dividendTarget && (
        <DividendModal
          portfolioId={dividendTarget.portfolio_id}
          assetId={dividendTarget.asset_id}
          symbol={dividendTarget.symbol}
          name={dividendTarget.name}
          currency={dividendTarget.currency}
          onClose={() => setDividendTarget(null)}
          onSaved={loadHoldings}
        />
      )}

      {showAddTransaction && selectedId && (
        <TransactionModal
          portfolioId={selectedId}
          onClose={() => setShowAddTransaction(false)}
          onSaved={handleTransactionSaved}
        />
      )}

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}
