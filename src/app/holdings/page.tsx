"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { usePortfolios } from "@/lib/hooks/usePortfolios";
import { PortfolioPicker } from "@/components/PortfolioPicker";
import { SummaryCard } from "@/components/SummaryCard";
import { EmptyState } from "@/components/EmptyState";
import { HistoryModal } from "@/components/HistoryModal";
import { TransactionModal } from "@/components/TransactionModal";
import { Toast } from "@/components/Toast";
import { AllocationDonut } from "@/components/AllocationDonut";
import type { DonutSegment } from "@/components/DonutChart";
import { TrendChart, type SnapshotPoint } from "@/components/TrendChart";
import { CHART_COLORS, UNCATEGORIZED_COLOR } from "@/lib/chartColors";
import { CONTAINER_CLASS } from "@/lib/layout";
import { xirr, type CashFlow } from "@/lib/xirr";
import { countDriftedAssets, type DriftHolding, type DriftTarget } from "@/lib/drift";
import { WarningIcon } from "@/components/DriftBadge";
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

interface AssetInfo {
  sector: string | null;
  country: string | null;
}

const UNCATEGORIZED = "Uncategorized";

function groupByDimension(
  holdings: HoldingWithReturns[],
  assetInfo: Map<string, AssetInfo>,
  dimension: "sector" | "country"
): DonutSegment[] {
  const totals = new Map<string, number>();
  for (const h of holdings) {
    const info = assetInfo.get(h.asset_id);
    const raw = info?.[dimension]?.trim();
    const label = raw ? raw : UNCATEGORIZED;
    const value = Number(h.market_value ?? 0);
    totals.set(label, (totals.get(label) ?? 0) + value);
  }

  const sorted = Array.from(totals.entries())
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);

  let colorIndex = 0;
  return sorted.map(([label, value]) => {
    if (label === UNCATEGORIZED) {
      return { label, value, color: UNCATEGORIZED_COLOR };
    }
    const color = CHART_COLORS[colorIndex % CHART_COLORS.length];
    colorIndex += 1;
    return { label, value, color };
  });
}

// One slice per holding (not merged by sector) — labeled "Symbol (sector)"
// so each slice is identifiable by the asset it represents, not just the
// sector text (which in this data is often a fund-specific description
// rather than a short, shared category name).
function groupBySymbolWithSector(
  holdings: HoldingWithReturns[],
  assetInfo: Map<string, AssetInfo>
): DonutSegment[] {
  const rows = holdings
    .map((h) => {
      const rawSector = assetInfo.get(h.asset_id)?.sector?.trim();
      return {
        label: `${h.symbol} (${rawSector ? rawSector : UNCATEGORIZED})`,
        isUncategorized: !rawSector,
        value: Number(h.market_value ?? 0),
      };
    })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  let colorIndex = 0;
  return rows.map((r) => {
    if (r.isUncategorized) {
      return { label: r.label, value: r.value, color: UNCATEGORIZED_COLOR };
    }
    const color = CHART_COLORS[colorIndex % CHART_COLORS.length];
    colorIndex += 1;
    return { label: r.label, value: r.value, color };
  });
}

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-4 w-4"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 3.5l3 3L7 16l-4 1 1-4L13.5 3.5z"
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
  const [assetInfo, setAssetInfo] = useState<Map<string, AssetInfo>>(new Map());
  const [snapshots, setSnapshots] = useState<SnapshotPoint[]>([]);
  const [xirrRate, setXirrRate] = useState<number | null>(null);
  const [loadingXirr, setLoadingXirr] = useState(false);
  const [driftedCount, setDriftedCount] = useState<number | null>(null);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyTarget, setHistoryTarget] = useState<HoldingWithReturns | null>(null);
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
      if (!silent) {
        autoSnapshotIfMissing(selectedId, data ?? []);
        loadAssetInfo(data ?? []);
        loadSnapshots(selectedId);
        const totalMV = (data ?? []).reduce((sum, h) => sum + Number(h.market_value ?? 0), 0);
        loadXirr(selectedId, totalMV);
        loadDrift(selectedId, data ?? []);
      }
    }
    if (!silent) setLoadingHoldings(false);
  }

  // Money-weighted annualized return (XIRR): every buy/sell/dividend for
  // the whole portfolio becomes a cash flow (buy = money out, sell/
  // dividend = money in), plus one final "as if sold today" inflow of the
  // current total market value. Only recomputed on non-silent loads (same
  // reasoning as auto-snapshot/asset-info: no need to redo this on every
  // 60s crypto-price tick).
  async function loadXirr(portfolioId: string, totalMarketValue: number) {
    setLoadingXirr(true);
    const { data, error } = await supabase
      .from("transactions")
      .select("type, trade_date, quantity, price, fee, tax")
      .eq("portfolio_id", portfolioId)
      .in("type", ["buy", "sell", "dividend"]);
    if (error || !data) {
      setXirrRate(null);
      setLoadingXirr(false);
      return;
    }

    const flows: CashFlow[] = data.map((t) => {
      const qty = Number(t.quantity);
      const price = Number(t.price);
      const fee = Number(t.fee);
      let amount: number;
      if (t.type === "buy") {
        amount = -(qty * price + fee);
      } else if (t.type === "sell") {
        amount = qty * price - fee;
      } else {
        amount = qty * price - Number(t.tax) - fee; // dividend
      }
      return { date: t.trade_date, amount };
    });
    flows.push({ date: new Date().toISOString().slice(0, 10), amount: totalMarketValue });

    setXirrRate(xirr(flows));
    setLoadingXirr(false);
  }

  // Drift-threshold alert: same formula as the Rebalancing page
  // (src/lib/drift.ts), reused rather than reimplemented. `null` = no
  // targets set for this portfolio at all (nothing to alert on); `0` =
  // has targets, all within threshold (banner stays hidden either way).
  async function loadDrift(portfolioId: string, holdingsData: HoldingWithReturns[]) {
    const { data, error } = await supabase
      .from("targets")
      .select("asset_id, target_pct, drift_threshold")
      .eq("portfolio_id", portfolioId);
    if (error || !data) {
      setDriftedCount(null);
      return;
    }
    const driftHoldings: DriftHolding[] = holdingsData.map((h) => ({
      asset_id: h.asset_id,
      market_value: Number(h.market_value ?? 0),
    }));
    const driftTargets: DriftTarget[] = data.map((t) => ({
      asset_id: t.asset_id,
      target_pct: Number(t.target_pct),
      drift_threshold: Number(t.drift_threshold),
    }));
    setDriftedCount(countDriftedAssets(driftHoldings, driftTargets));
  }

  // Trend chart data — independent of the autoSnapshotIfMissing/
  // handleSaveSnapshot writes below, so it always reflects whatever
  // history already exists even before this load's own snapshot write (if
  // any) finishes; those two call it again afterward to pick up a
  // brand-new point immediately.
  async function loadSnapshots(portfolioId: string) {
    const { data, error } = await supabase
      .from("portfolio_snapshots")
      .select("snapshot_date, total_value")
      .eq("portfolio_id", portfolioId)
      .order("snapshot_date", { ascending: true });
    if (!error) {
      setSnapshots((data ?? []).map((s) => ({ ...s, total_value: Number(s.total_value) })));
    }
  }

  // sector/country aren't on the `holdings`/`holdings_with_returns` views
  // (D35 precedent: fetched separately, only when actually needed, rather
  // than extending either view for this one chart). Skipped on silent
  // (60s crypto-refresh) reloads — sector/country only change via an asset
  // edit, not a price tick.
  async function loadAssetInfo(holdingsData: HoldingWithReturns[]) {
    const assetIds = holdingsData.map((h) => h.asset_id);
    if (assetIds.length === 0) {
      setAssetInfo(new Map());
      return;
    }
    const { data } = await supabase.from("assets").select("id, sector, country").in("id", assetIds);
    setAssetInfo(
      new Map((data ?? []).map((a) => [a.id, { sector: a.sector, country: a.country }]))
    );
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
      await loadSnapshots(portfolioId);
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
      await loadSnapshots(selectedId);
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

  const bySector = groupBySymbolWithSector(holdings, assetInfo);
  const byCountry = groupByDimension(holdings, assetInfo, "country");

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <main className={`${CONTAINER_CLASS} py-10`}>
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

            {!!driftedCount && (
              <Link
                href="/rebalancing"
                className="mb-6 flex cursor-pointer items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 transition-all duration-150 hover:-translate-y-px hover:shadow-sm dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400"
              >
                <WarningIcon className="h-4 w-4 flex-shrink-0" />
                <span>
                  {driftedCount} asset{driftedCount === 1 ? "" : "s"} drifted from their target
                  allocation.
                </span>
                <span className="font-medium underline underline-offset-2">
                  View Rebalancing →
                </span>
              </Link>
            )}

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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <SummaryCard
                label="Annualized Return (XIRR)"
                value={
                  loadingHoldings || loadingXirr
                    ? "—"
                    : xirrRate === null
                      ? "Not enough data yet"
                      : formatPercent(xirrRate * 100)
                }
                colorClass={
                  loadingHoldings || loadingXirr || xirrRate === null
                    ? undefined
                    : pnlColor(xirrRate)
                }
              />
            </div>

            {!loadingHoldings && holdings.length > 0 && (
              <div className="mt-6">
                <TrendChart snapshots={snapshots} currency={baseCurrency} />
              </div>
            )}

            {!loadingHoldings && holdings.length > 0 && (
              <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <AllocationDonut title="By sector" segments={bySector} />
                <AllocationDonut title="By country" segments={byCountry} />
              </div>
            )}

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
                        <th className="px-3 py-3 font-medium">Symbol</th>
                        <th className="px-3 py-3 font-medium">Name</th>
                        <th className="px-3 py-3 text-right font-medium">Qty</th>
                        <th className="px-3 py-3 text-right font-medium">Avg Cost</th>
                        <th className="px-3 py-3 text-right font-medium">Last Price</th>
                        <th className="px-3 py-3 text-right font-medium">Market Value</th>
                        <th className="px-3 py-3 text-right font-medium">
                          Unrealized P&amp;L
                          <div className="text-[10px] font-normal normal-case text-gray-400 dark:text-gray-500">
                            price only
                          </div>
                        </th>
                        <th className="px-3 py-3 text-right font-medium">
                          Dividends
                          <div className="text-[10px] font-normal normal-case text-gray-400 dark:text-gray-500">
                            net of tax
                          </div>
                        </th>
                        <th className="px-3 py-3 text-right font-medium">
                          Total Return
                          <div className="text-[10px] font-normal normal-case text-gray-400 dark:text-gray-500">
                            P&amp;L + dividends
                          </div>
                        </th>
                        <th className="px-2 py-3 text-right font-medium"></th>
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
                            <td className="px-3 py-3 text-xs font-medium">{h.symbol}</td>
                            <td className="px-3 py-3 text-gray-500 dark:text-gray-400">
                              {h.name}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs tabular-nums">
                              {formatQuantity(Number(h.quantity))}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs tabular-nums">
                              {formatMoney(Number(h.avg_cost), h.currency)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs tabular-nums">
                              {h.last_price === null
                                ? "—"
                                : formatMoney(Number(h.last_price), h.currency)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs tabular-nums">
                              {h.market_value === null
                                ? "—"
                                : formatMoney(Number(h.market_value), h.currency)}
                            </td>
                            <td
                              className={`px-3 py-3 text-right font-mono text-xs tabular-nums ${pnlColor(pnl)}`}
                            >
                              <div className="whitespace-nowrap">{formatSigned(pnl, h.currency)}</div>
                              {pct !== null && (
                                <div className="text-[10px]">{`(${formatPercent(pct)})`}</div>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs tabular-nums text-gray-700 dark:text-gray-300">
                              {formatMoney(netDividends, h.currency)}
                            </td>
                            <td
                              className={`px-3 py-3 text-right font-mono text-xs tabular-nums ${pnlColor(totalRet)}`}
                            >
                              <div className="whitespace-nowrap">
                                {formatSigned(totalRet, h.currency)}
                              </div>
                              {totalRetPct !== null && (
                                <div className="text-[10px]">{`(${formatPercent(totalRetPct)})`}</div>
                              )}
                            </td>
                            <td className="px-2 py-3 text-right">
                              <button
                                onClick={() => setHistoryTarget(h)}
                                aria-label="View history"
                                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-all duration-150 hover:-translate-y-px hover:bg-gray-100 hover:text-blue-600 hover:shadow-sm active:translate-y-0 active:shadow-none dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-blue-400"
                              >
                                <PencilIcon />
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

      {historyTarget && (
        <HistoryModal
          portfolioId={historyTarget.portfolio_id}
          assetId={historyTarget.asset_id}
          symbol={historyTarget.symbol}
          name={historyTarget.name}
          currency={historyTarget.currency}
          onClose={() => setHistoryTarget(null)}
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
