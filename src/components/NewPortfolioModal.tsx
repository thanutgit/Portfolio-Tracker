"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Portfolio } from "@/lib/types";

interface Props {
  onClose: () => void;
  onCreated: (portfolio: Portfolio) => void;
}

// Always offered, even if no asset in the system uses them yet — THB is
// the app's default/recommended currency and USD is the most common
// foreign one. Anything beyond these two only appears once a real asset
// with that currency exists (see loadCurrencyOptions below) — deliberately
// not a long hardcoded list of every world currency, since this app only
// needs to cover currencies actually in use.
const DEFAULT_CURRENCIES = ["THB", "USD"];

function sortCurrencies(currencies: Iterable<string>) {
  return Array.from(new Set(currencies)).sort((a, b) => {
    if (a === "THB") return -1;
    if (b === "THB") return 1;
    if (a === "USD") return -1;
    if (b === "USD") return 1;
    return a.localeCompare(b);
  });
}

export function NewPortfolioModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("THB");
  const [currencyOptions, setCurrencyOptions] = useState<string[]>(DEFAULT_CURRENCIES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCurrencyOptions() {
      const { data } = await supabase.from("assets").select("currency");
      setCurrencyOptions(
        sortCurrencies([...DEFAULT_CURRENCIES, ...(data ?? []).map((a) => a.currency)])
      );
    }
    loadCurrencyOptions();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a portfolio name.");
      return;
    }

    setSaving(true);
    setError(null);
    // Once RLS is on (Phase 7 step 2), a portfolio inserted without user_id
    // would violate the not-null constraint (or, if that weren't in place,
    // become invisible to everyone under RLS) — this page only renders
    // inside <RequireAuth>, so a session is guaranteed to exist here.
    const { data: sessionData } = await supabase.auth.getSession();
    const { data, error } = await supabase
      .from("portfolios")
      .insert({ name: trimmed, base_currency: currency, user_id: sessionData.session?.user.id })
      .select("id, name, base_currency")
      .single();
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onCreated(data);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm dark:bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-800 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          New portfolio
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Every asset added to this portfolio must be priced in the same
          currency. This can&apos;t be changed later — create a separate
          portfolio for a different currency.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Portfolio name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
              placeholder="e.g. Retirement"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950"
            >
              {currencyOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
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
              {saving ? "Creating…" : "Create portfolio"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
