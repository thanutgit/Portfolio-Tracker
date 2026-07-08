"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DividendTransaction, AssetTransaction } from "@/lib/types";
import { formatMoney, formatQuantity } from "@/lib/format";
import { DIFF_WARNING_PCT } from "@/lib/constants";
import { wouldCauseNegativeHolding } from "@/lib/transactions";
import { useConfirm } from "@/lib/hooks/useConfirm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Toast } from "@/components/Toast";
import { TaxHoldingBadge } from "@/components/TaxHoldingBadge";

interface Props {
  portfolioId: string;
  assetId: string;
  symbol: string;
  name: string;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}

const PAGE_SIZE = 10;

function today() {
  return new Date().toISOString().slice(0, 10);
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

function TrashIcon() {
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
        d="M4 6h12M8 6V4.5A1.5 1.5 0 019.5 3h1A1.5 1.5 0 0112 4.5V6m-6.5 0l.6 10.2A1.5 1.5 0 007.6 17.7h4.8a1.5 1.5 0 001.5-1.5L14.5 6"
      />
    </svg>
  );
}

const INPUT_CLASS =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950";
const TEXT_INPUT_CLASS =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950";
const LABEL_CLASS = "mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300";
const ICON_BTN_CLASS =
  "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-all duration-150 hover:-translate-y-px hover:bg-gray-100 hover:text-blue-600 hover:shadow-sm active:translate-y-0 active:shadow-none dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-blue-400";
const DELETE_BTN_CLASS =
  "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-all duration-150 hover:-translate-y-px hover:bg-red-50 hover:text-red-600 hover:shadow-sm active:translate-y-0 active:shadow-none dark:text-gray-500 dark:hover:bg-red-950/40 dark:hover:text-red-400";

export function HistoryModal({
  portfolioId,
  assetId,
  symbol,
  name,
  currency,
  onClose,
  onSaved,
}: Props) {
  const [tab, setTab] = useState<"transactions" | "dividends">("transactions");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  // For the per-row RMF/SSF/ThaiESG holding-period badge. Both fetches
  // fail soft (badge/row info just doesn't show) — this is a supplementary
  // detail, not core to viewing/editing transaction history, and
  // `user_settings` may not exist yet on a database that hasn't run
  // migrations/0006_add_user_settings.sql.
  const [taxBucket, setTaxBucket] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("assets").select("tax_bucket").eq("id", assetId).maybeSingle();
      setTaxBucket(data?.tax_bucket ?? null);
    })();
    (async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("birth_date")
        .limit(1)
        .maybeSingle();
      setBirthDate(data?.birth_date ?? null);
    })();
  }, [assetId]);

  // ---- Transactions tab ----
  const [txns, setTxns] = useState<AssetTransaction[]>([]);
  const [txnsTotalCount, setTxnsTotalCount] = useState(0);
  const [txnVisibleCount, setTxnVisibleCount] = useState(PAGE_SIZE);
  const [loadingTxns, setLoadingTxns] = useState(true);
  const [txnError, setTxnError] = useState<string | null>(null);
  const [editingTxn, setEditingTxn] = useState<AssetTransaction | null>(null);
  const [txnType, setTxnType] = useState<"buy" | "sell">("buy");
  const [txnDate, setTxnDate] = useState(today());
  const [txnQuantity, setTxnQuantity] = useState("");
  const [txnPrice, setTxnPrice] = useState("");
  const [txnFee, setTxnFee] = useState("0");
  const [savingTxn, setSavingTxn] = useState(false);

  async function loadTxns(count = txnVisibleCount) {
    setLoadingTxns(true);
    const { data, error, count: total } = await supabase
      .from("transactions")
      .select("id, type, trade_date, quantity, price, fee", { count: "exact" })
      .eq("portfolio_id", portfolioId)
      .eq("asset_id", assetId)
      .in("type", ["buy", "sell"])
      .order("trade_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(0, count - 1);
    if (error) {
      setTxnError(error.message);
    } else {
      setTxns(data ?? []);
      setTxnsTotalCount(total ?? 0);
    }
    setLoadingTxns(false);
  }

  function handleLoadMoreTxns() {
    const next = txnVisibleCount + PAGE_SIZE;
    setTxnVisibleCount(next);
    loadTxns(next);
  }

  // Every buy/sell for this asset, unpaginated — needed to replay the full
  // timeline for the negative-holding check regardless of what page is
  // currently visible in the UI.
  async function fetchAllBuySell() {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, type, trade_date, quantity")
      .eq("portfolio_id", portfolioId)
      .eq("asset_id", assetId)
      .in("type", ["buy", "sell"]);
    if (error) return { data: null, error: error.message };
    return {
      data: (data ?? []).map((t) => ({ ...t, quantity: Number(t.quantity) })),
      error: null as string | null,
    };
  }

  function resetTxnForm() {
    setEditingTxn(null);
    setTxnError(null);
  }

  function handleEditTxnClick(t: AssetTransaction) {
    setEditingTxn(t);
    setTxnType(t.type);
    setTxnDate(t.trade_date);
    setTxnQuantity(String(t.quantity));
    setTxnPrice(String(t.price));
    setTxnFee(String(t.fee));
    setTxnError(null);
  }

  async function handleTxnSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTxn) return;
    setTxnError(null);

    const quantityNum = Number(txnQuantity);
    const priceNum = Number(txnPrice);
    const feeNum = Number(txnFee) || 0;
    if (!quantityNum || quantityNum <= 0) {
      setTxnError("Enter a quantity greater than 0.");
      return;
    }
    if (!priceNum || priceNum <= 0) {
      setTxnError("Enter a price per unit greater than 0.");
      return;
    }

    const { data: allTxns, error: fetchError } = await fetchAllBuySell();
    if (fetchError || !allTxns) {
      setTxnError(fetchError ?? "Could not verify transaction history.");
      return;
    }
    const wouldGoNegative = wouldCauseNegativeHolding(allTxns, editingTxn.id, {
      type: txnType,
      trade_date: txnDate,
      quantity: quantityNum,
    });

    const total = quantityNum * priceNum + feeNum;
    const verb = txnType === "buy" ? "buy" : "sell";
    const warningLine = wouldGoNegative
      ? `\n\n⚠ This change would make your held quantity of ${symbol} go negative at some point in the transaction timeline — double check before continuing.`
      : "";
    const message =
      `Update this transaction to: ${verb} ${formatQuantity(quantityNum)} unit${quantityNum === 1 ? "" : "s"} of ` +
      `${symbol} at ${formatMoney(priceNum, currency)} per unit on ${txnDate} — ` +
      `total ${formatMoney(total, currency)} (incl. fee).${warningLine}`;

    const confirmed = await confirm(message, {
      title: "Confirm changes",
      confirmLabel: "Save changes",
      variant: wouldGoNegative ? "danger" : "default",
    });
    if (!confirmed) return;

    setSavingTxn(true);
    const { error } = await supabase
      .from("transactions")
      .update({
        type: txnType,
        trade_date: txnDate,
        quantity: quantityNum,
        price: priceNum,
        fee: feeNum,
      })
      .eq("id", editingTxn.id);
    if (error) {
      setTxnError(error.message);
      setSavingTxn(false);
      return;
    }

    setSavingTxn(false);
    resetTxnForm();
    await loadTxns();
    onSaved();
    setToastMessage("Transaction updated.");
  }

  async function handleDeleteTxnClick(t: AssetTransaction) {
    const { data: allTxns, error: fetchError } = await fetchAllBuySell();
    if (fetchError || !allTxns) {
      setTxnError(fetchError ?? "Could not verify transaction history.");
      return;
    }
    const wouldGoNegative = wouldCauseNegativeHolding(allTxns, t.id, null);
    const warningLine = wouldGoNegative
      ? `\n\n⚠ Deleting this would make your held quantity of ${symbol} go negative at some point in the transaction timeline — double check before continuing.`
      : "";
    const verb = t.type === "buy" ? "buy" : "sell";
    const qtyNum = Number(t.quantity);
    const confirmed = await confirm(
      `Delete this ${verb} of ${formatQuantity(qtyNum)} unit${qtyNum === 1 ? "" : "s"} at ${formatMoney(Number(t.price), currency)} per unit on ${t.trade_date}? This can't be undone.${warningLine}`,
      { title: "Delete transaction?", confirmLabel: "Delete", variant: "danger" }
    );
    if (!confirmed) return;

    const { error } = await supabase.from("transactions").delete().eq("id", t.id);
    if (error) {
      setTxnError(error.message);
      return;
    }
    if (editingTxn?.id === t.id) resetTxnForm();
    await loadTxns();
    onSaved();
    setToastMessage("Transaction deleted.");
  }

  // ---- Dividends tab ----
  const [dividends, setDividends] = useState<DividendTransaction[]>([]);
  const [dividendsTotalCount, setDividendsTotalCount] = useState(0);
  const [dividendVisibleCount, setDividendVisibleCount] = useState(PAGE_SIZE);
  const [loadingDividends, setLoadingDividends] = useState(true);
  const [dividendError, setDividendError] = useState<string | null>(null);
  const [editingDividendId, setEditingDividendId] = useState<string | null>(null);
  const [divDate, setDivDate] = useState(today());
  const [divAmount, setDivAmount] = useState("");
  const [divTax, setDivTax] = useState("0");
  const [savingDividend, setSavingDividend] = useState(false);

  async function loadDividends(count = dividendVisibleCount) {
    setLoadingDividends(true);
    const { data, error, count: total } = await supabase
      .from("transactions")
      .select("id, trade_date, price, tax, fee", { count: "exact" })
      .eq("portfolio_id", portfolioId)
      .eq("asset_id", assetId)
      .eq("type", "dividend")
      .order("trade_date", { ascending: false })
      .range(0, count - 1);
    if (error) {
      setDividendError(error.message);
    } else {
      setDividends(data ?? []);
      setDividendsTotalCount(total ?? 0);
    }
    setLoadingDividends(false);
  }

  function handleLoadMoreDividends() {
    const next = dividendVisibleCount + PAGE_SIZE;
    setDividendVisibleCount(next);
    loadDividends(next);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTxns(PAGE_SIZE);
    loadDividends(PAGE_SIZE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  function resetDividendForm() {
    setEditingDividendId(null);
    setDivDate(today());
    setDivAmount("");
    setDivTax("0");
    setDividendError(null);
  }

  function handleEditDividendClick(d: DividendTransaction) {
    setEditingDividendId(d.id);
    setDivDate(d.trade_date);
    setDivAmount(String(d.price));
    setDivTax(String(d.tax));
    setDividendError(null);
  }

  async function handleDeleteDividendClick(d: DividendTransaction) {
    const confirmed = await confirm(
      `Delete the ${formatMoney(Number(d.price), currency)} dividend on ${d.trade_date}? This can't be undone.`,
      { title: "Delete dividend?", confirmLabel: "Delete", variant: "danger" }
    );
    if (!confirmed) return;

    setDividendError(null);
    const { error } = await supabase.from("transactions").delete().eq("id", d.id);
    if (error) {
      setDividendError(error.message);
      return;
    }
    if (editingDividendId === d.id) resetDividendForm();
    await loadDividends();
    onSaved();
    setToastMessage("Dividend deleted.");
  }

  async function handleDividendSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDividendError(null);

    const amountNum = Number(divAmount);
    const taxNum = Number(divTax) || 0;
    if (!amountNum || amountNum <= 0) {
      setDividendError("Enter a dividend amount greater than 0.");
      return;
    }

    if (editingDividendId) {
      const original = dividends.find((d) => d.id === editingDividendId);
      if (original) {
        const originalAmount = Number(original.price);
        const diffPct =
          originalAmount !== 0
            ? Math.abs(((amountNum - originalAmount) / originalAmount) * 100)
            : 0;
        if (diffPct > DIFF_WARNING_PCT) {
          const confirmed = await confirm(
            `You're changing the amount from ${formatMoney(originalAmount, currency)} to ${formatMoney(amountNum, currency)} (${diffPct.toFixed(0)}% difference). Continue?`,
            { title: "Large change detected", confirmLabel: "Continue" }
          );
          if (!confirmed) return;
        }
      }

      setSavingDividend(true);
      const { error } = await supabase
        .from("transactions")
        .update({ trade_date: divDate, price: amountNum, tax: taxNum })
        .eq("id", editingDividendId);
      if (error) {
        setDividendError(error.message);
        setSavingDividend(false);
        return;
      }
      setSavingDividend(false);
      resetDividendForm();
      await loadDividends();
      onSaved();
      setToastMessage("Dividend updated.");
      return;
    }

    const { data: dupRows, error: dupError } = await supabase
      .from("transactions")
      .select("id, price")
      .eq("portfolio_id", portfolioId)
      .eq("asset_id", assetId)
      .eq("type", "dividend")
      .eq("trade_date", divDate);
    if (dupError) {
      setDividendError(dupError.message);
      return;
    }
    if (dupRows && dupRows.length > 0) {
      const existing = dupRows.map((d) => formatMoney(Number(d.price), currency)).join(", ");
      const confirmed = await confirm(
        `There's already a dividend entry on ${divDate} for ${symbol} (${existing}). Add another one anyway?`,
        { title: "Duplicate date", confirmLabel: "Add anyway" }
      );
      if (!confirmed) return;
    }

    setSavingDividend(true);
    const { error } = await supabase.from("transactions").insert({
      portfolio_id: portfolioId,
      asset_id: assetId,
      type: "dividend",
      trade_date: divDate,
      quantity: 1,
      price: amountNum,
      tax: taxNum,
      fee: 0,
    });
    if (error) {
      setDividendError(error.message);
      setSavingDividend(false);
      return;
    }

    setSavingDividend(false);
    resetDividendForm();
    await loadDividends();
    onSaved();
    setToastMessage("Dividend saved.");
  }

  function tabButtonClass(active: boolean) {
    return `cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
      active
        ? "bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400"
        : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
    }`;
  }

  function typeToggleClass(active: boolean) {
    return `cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium transition-all duration-150 ${
      active
        ? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:border-blue-400/40 dark:bg-blue-400/10 dark:text-blue-400"
        : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400 dark:hover:bg-gray-800"
    }`;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm dark:bg-black/60"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-800 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">History</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {symbol} — {name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-all duration-150 hover:-translate-y-px hover:bg-gray-100 hover:text-gray-600 hover:shadow-sm active:translate-y-0 active:shadow-none dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("transactions")}
            className={tabButtonClass(tab === "transactions")}
          >
            Transactions
          </button>
          <button
            type="button"
            onClick={() => setTab("dividends")}
            className={tabButtonClass(tab === "dividends")}
          >
            Dividends
          </button>
        </div>

        {tab === "transactions" && (
          <div>
            {txnError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {txnError}
              </div>
            )}

            {loadingTxns ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
            ) : txns.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No buy/sell transactions recorded yet for this asset.
              </p>
            ) : (
              <>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-800">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {txns.map((t) => (
                        <tr
                          key={t.id}
                          className={
                            editingTxn?.id === t.id ? "bg-blue-50 dark:bg-blue-950/40" : ""
                          }
                        >
                          <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                            {t.trade_date}
                          </td>
                          <td className="px-3 py-2 font-medium capitalize">{t.type}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {formatQuantity(Number(t.quantity))}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {formatMoney(Number(t.price), currency)}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center justify-end gap-2">
                              {t.type === "buy" && taxBucket && taxBucket !== "normal" && (
                                <TaxHoldingBadge
                                  taxBucket={taxBucket}
                                  tradeDate={t.trade_date}
                                  birthDate={birthDate}
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => handleEditTxnClick(t)}
                                aria-label="Edit transaction"
                                className={ICON_BTN_CLASS}
                              >
                                <PencilIcon />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTxnClick(t)}
                                aria-label="Delete transaction"
                                className={DELETE_BTN_CLASS}
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {txnsTotalCount > txns.length && (
                  <button
                    type="button"
                    onClick={handleLoadMoreTxns}
                    className="mt-2 cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Load more ({txnsTotalCount - txns.length} more)
                  </button>
                )}
              </>
            )}

            {editingTxn && (
              <form
                onSubmit={handleTxnSubmit}
                className="mt-4 space-y-3 rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-700"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Edit transaction
                </p>

                <div>
                  <label className={LABEL_CLASS}>Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTxnType("buy")}
                      className={typeToggleClass(txnType === "buy")}
                    >
                      Buy
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxnType("sell")}
                      className={typeToggleClass(txnType === "sell")}
                    >
                      Sell
                    </button>
                  </div>
                </div>

                <div>
                  <label className={LABEL_CLASS}>Trade date</label>
                  <input
                    type="date"
                    value={txnDate}
                    onChange={(e) => setTxnDate(e.target.value)}
                    required
                    className={TEXT_INPUT_CLASS}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLASS}>Quantity (units/shares)</label>
                    <input
                      type="number"
                      step="0.000001"
                      min="0"
                      value={txnQuantity}
                      onChange={(e) => setTxnQuantity(e.target.value)}
                      required
                      placeholder="0.00"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Price per unit ({currency})</label>
                    <input
                      type="number"
                      step="0.000001"
                      min="0"
                      value={txnPrice}
                      onChange={(e) => setTxnPrice(e.target.value)}
                      required
                      placeholder="0.00"
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>

                <div>
                  <label className={LABEL_CLASS}>Fee (optional)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={txnFee}
                    onChange={(e) => setTxnFee(e.target.value)}
                    placeholder="0.00"
                    className={`sm:w-1/2 ${INPUT_CLASS}`}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={resetTxnForm}
                    className="cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-gray-50 hover:shadow-md active:translate-y-0 active:shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingTxn}
                    className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-blue-700 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
                  >
                    {savingTxn ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {tab === "dividends" && (
          <div>
            {dividendError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {dividendError}
              </div>
            )}

            <div className="mb-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Previously recorded
              </p>
              {loadingDividends ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
              ) : dividends.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No dividends recorded yet for this asset.
                </p>
              ) : (
                <>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-800">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {dividends.map((d) => (
                          <tr
                            key={d.id}
                            className={
                              editingDividendId === d.id ? "bg-blue-50 dark:bg-blue-950/40" : ""
                            }
                          >
                            <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                              {d.trade_date}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">
                              {formatMoney(Number(d.price), currency)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-500 dark:text-gray-400">
                              tax {formatMoney(Number(d.tax), currency)}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleEditDividendClick(d)}
                                  aria-label="Edit dividend"
                                  className={ICON_BTN_CLASS}
                                >
                                  <PencilIcon />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDividendClick(d)}
                                  aria-label="Delete dividend"
                                  className={DELETE_BTN_CLASS}
                                >
                                  <TrashIcon />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {dividendsTotalCount > dividends.length && (
                    <button
                      type="button"
                      onClick={handleLoadMoreDividends}
                      className="mt-2 cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Load more ({dividendsTotalCount - dividends.length} more)
                    </button>
                  )}
                </>
              )}
            </div>

            {editingDividendId && (
              <div className="mb-3 flex items-center justify-between rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <span>Editing the entry above</span>
                <button
                  type="button"
                  onClick={resetDividendForm}
                  className="cursor-pointer font-medium underline"
                >
                  Cancel edit
                </button>
              </div>
            )}

            <form onSubmit={handleDividendSubmit} className="space-y-3">
              <div>
                <label className={LABEL_CLASS}>Date</label>
                <input
                  type="date"
                  value={divDate}
                  onChange={(e) => setDivDate(e.target.value)}
                  required
                  className={TEXT_INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Amount received (gross)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={divAmount}
                  onChange={(e) => setDivAmount(e.target.value)}
                  required
                  placeholder="0.00"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Withholding tax (if any)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={divTax}
                  onChange={(e) => setDivTax(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingDividend}
                  className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-blue-700 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
                >
                  {savingDividend ? "Saving…" : editingDividendId ? "Update dividend" : "Save dividend"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}
