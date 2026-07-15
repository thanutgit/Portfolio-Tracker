"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Portfolio } from "@/lib/types";

interface Props {
  portfolio: Portfolio;
  onClose: () => void;
  onDeleted: (portfolio: Portfolio) => void;
}

interface Counts {
  transactions: number;
  dividends: number;
  targets: number;
  snapshots: number;
}

// All four child tables (transactions, targets, portfolio_snapshots — plus
// dividends, which are just transactions with type = 'dividend', not a
// separate table) have `portfolio_id ... on delete cascade` since
// 0001_init.sql/0002_add_targets.sql/0005_add_portfolio_snapshots.sql, and
// RLS's `for all` policies (0010_enable_rls.sql) cover DELETE the same as
// every other operation — so a single `delete from portfolios` is enough;
// no per-table deletes and no new migration needed. See DECISIONS.md.
export function DeletePortfolioModal({ portfolio, onClose, onDeleted }: Props) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [countError, setCountError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCounts() {
      const [txRes, divRes, targetRes, snapRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("portfolio_id", portfolio.id)
          .neq("type", "dividend"),
        supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("portfolio_id", portfolio.id)
          .eq("type", "dividend"),
        supabase
          .from("targets")
          .select("id", { count: "exact", head: true })
          .eq("portfolio_id", portfolio.id),
        supabase
          .from("portfolio_snapshots")
          .select("id", { count: "exact", head: true })
          .eq("portfolio_id", portfolio.id),
      ]);
      const firstError = txRes.error ?? divRes.error ?? targetRes.error ?? snapRes.error;
      if (firstError) {
        setCountError(firstError.message);
        return;
      }
      setCounts({
        transactions: txRes.count ?? 0,
        dividends: divRes.count ?? 0,
        targets: targetRes.count ?? 0,
        snapshots: snapRes.count ?? 0,
      });
    }
    loadCounts();
  }, [portfolio.id]);

  const nameMatches = confirmText === portfolio.name;

  async function handleDelete() {
    if (!nameMatches) return;
    setDeleting(true);
    setDeleteError(null);
    const { error } = await supabase.from("portfolios").delete().eq("id", portfolio.id);
    if (error) {
      setDeleteError(error.message);
      setDeleting(false);
      return;
    }
    onDeleted(portfolio);
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
          Delete portfolio
        </h2>

        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {countError ? (
            <p>{countError}</p>
          ) : !counts ? (
            <p>Checking what will be deleted…</p>
          ) : (
            <p>
              This will permanently delete <strong>&quot;{portfolio.name}&quot;</strong> and all{" "}
              {counts.transactions} transaction{counts.transactions === 1 ? "" : "s"},{" "}
              {counts.dividends} dividend{counts.dividends === 1 ? "" : "s"}, {counts.targets}{" "}
              target allocation{counts.targets === 1 ? "" : "s"}, and {counts.snapshots} day
              {counts.snapshots === 1 ? "" : "s"} of value history within it. This cannot be
              undone.
            </p>
          )}
        </div>

        {deleteError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {deleteError}
          </div>
        )}

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
            Type <span className="font-mono">{portfolio.name}</span> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-gray-700 dark:bg-gray-950"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-gray-50 hover:shadow-md active:translate-y-0 active:shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!nameMatches || deleting || !counts}
            className="cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-red-700 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
          >
            {deleting ? "Deleting…" : "Delete this portfolio"}
          </button>
        </div>
      </div>
    </div>
  );
}
