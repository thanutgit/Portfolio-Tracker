"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DividendTransaction } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { DIFF_WARNING_PCT } from "@/lib/constants";
import { useConfirm } from "@/lib/hooks/useConfirm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Toast } from "@/components/Toast";

interface Props {
  portfolioId: string;
  assetId: string;
  symbol: string;
  name: string;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}

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

export function DividendModal({
  portfolioId,
  assetId,
  symbol,
  name,
  currency,
  onClose,
  onSaved,
}: Props) {
  const [history, setHistory] = useState<DividendTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [tax, setTax] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  async function loadHistory() {
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from("transactions")
      .select("id, trade_date, price, tax, fee")
      .eq("portfolio_id", portfolioId)
      .eq("asset_id", assetId)
      .eq("type", "dividend")
      .order("trade_date", { ascending: false });
    if (error) {
      setError(error.message);
    } else {
      setHistory(data ?? []);
    }
    setLoadingHistory(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  function resetForm() {
    setEditingId(null);
    setDate(today());
    setAmount("");
    setTax("0");
    setError(null);
  }

  function handleEditClick(h: DividendTransaction) {
    setEditingId(h.id);
    setDate(h.trade_date);
    setAmount(String(h.price));
    setTax(String(h.tax));
    setError(null);
  }

  async function handleDeleteClick(h: DividendTransaction) {
    const confirmed = await confirm(
      `Delete the ${formatMoney(Number(h.price), currency)} dividend on ${h.trade_date}? This can't be undone.`,
      { title: "Delete dividend?", confirmLabel: "Delete", variant: "danger" }
    );
    if (!confirmed) return;

    setError(null);
    const { error } = await supabase.from("transactions").delete().eq("id", h.id);
    if (error) {
      setError(error.message);
      return;
    }
    if (editingId === h.id) resetForm();
    await loadHistory();
    onSaved();
    setToastMessage("Dividend deleted.");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amountNum = Number(amount);
    const taxNum = Number(tax) || 0;
    if (!amountNum || amountNum <= 0) {
      setError("Enter a dividend amount greater than 0.");
      return;
    }

    if (editingId) {
      const original = history.find((h) => h.id === editingId);
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

      setSaving(true);
      const { error } = await supabase
        .from("transactions")
        .update({ trade_date: date, price: amountNum, tax: taxNum })
        .eq("id", editingId);
      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
      setSaving(false);
      resetForm();
      await loadHistory();
      onSaved();
      setToastMessage("Dividend updated.");
      return;
    }

    const duplicates = history.filter((h) => h.trade_date === date);
    if (duplicates.length > 0) {
      const existing = duplicates
        .map((d) => formatMoney(Number(d.price), currency))
        .join(", ");
      const confirmed = await confirm(
        `There's already a dividend entry on ${date} for ${symbol} (${existing}). Add another one anyway?`,
        { title: "Duplicate date", confirmLabel: "Add anyway" }
      );
      if (!confirmed) return;
    }

    setSaving(true);
    const { error } = await supabase.from("transactions").insert({
      portfolio_id: portfolioId,
      asset_id: assetId,
      type: "dividend",
      trade_date: date,
      quantity: 1,
      price: amountNum,
      tax: taxNum,
      fee: 0,
    });
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    resetForm();
    await loadHistory();
    onSaved();
    setToastMessage("Dividend saved.");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-800 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {editingId ? "Edit dividend" : "Record dividend"}
            </h2>
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

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mb-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Previously recorded
          </p>
          {loadingHistory ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No dividends recorded yet for this asset.
            </p>
          ) : (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-800">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {history.map((h) => (
                    <tr
                      key={h.id}
                      className={editingId === h.id ? "bg-blue-50 dark:bg-blue-950/40" : ""}
                    >
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                        {h.trade_date}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatMoney(Number(h.price), currency)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-500 dark:text-gray-400">
                        tax {formatMoney(Number(h.tax), currency)}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditClick(h)}
                            aria-label="Edit dividend"
                            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-all duration-150 hover:-translate-y-px hover:bg-gray-100 hover:text-blue-600 hover:shadow-sm active:translate-y-0 active:shadow-none dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-blue-400"
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(h)}
                            aria-label="Delete dividend"
                            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-all duration-150 hover:-translate-y-px hover:bg-red-50 hover:text-red-600 hover:shadow-sm active:translate-y-0 active:shadow-none dark:text-gray-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
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
          )}
        </div>

        {editingId && (
          <div className="mb-3 flex items-center justify-between rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            <span>Editing the entry above</span>
            <button
              type="button"
              onClick={resetForm}
              className="cursor-pointer font-medium underline"
            >
              Cancel edit
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Amount received (gross)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="0.00"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Withholding tax (if any)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-gray-50 hover:shadow-md active:translate-y-0 active:shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-blue-700 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
            >
              {saving ? "Saving…" : editingId ? "Update dividend" : "Save dividend"}
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}
