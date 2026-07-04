"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DividendTransaction } from "@/lib/types";
import { formatMoney } from "@/lib/format";

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
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [tax, setTax] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amountNum = Number(amount);
    const taxNum = Number(tax) || 0;
    if (!amountNum || amountNum <= 0) {
      setError("Enter a dividend amount greater than 0.");
      return;
    }

    const duplicates = history.filter((h) => h.trade_date === date);
    if (duplicates.length > 0) {
      const existing = duplicates
        .map((d) => formatMoney(Number(d.price), currency))
        .join(", ");
      const confirmed = window.confirm(
        `There's already a dividend entry on ${date} for ${symbol} (${existing}). Add another one anyway?`
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

    setAmount("");
    setTax("0");
    setSaving(false);
    await loadHistory();
    onSaved();
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
            <h2 className="text-lg font-semibold tracking-tight">Record dividend</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {symbol} — {name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
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
                    <tr key={h.id}>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                        {h.trade_date}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatMoney(Number(h.price), currency)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-gray-500 dark:text-gray-400">
                        tax {formatMoney(Number(h.tax), currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save dividend"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
