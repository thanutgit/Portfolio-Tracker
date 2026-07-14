"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { RequireAuth } from "@/components/RequireAuth";
import { EditAssetModal } from "@/components/EditAssetModal";
import { Toast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useConfirm } from "@/lib/hooks/useConfirm";
import { CONTAINER_CLASS } from "@/lib/layout";
import type { Asset } from "@/lib/types";

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

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  async function loadAssets() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("assets")
      .select(
        "id, symbol, name, asset_type, currency, sector, country, tax_bucket, market, coingecko_id"
      )
      .order("symbol");
    if (error) {
      setError(error.message);
    } else {
      setAssets(data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAssets();
  }, []);

  async function handleAssetUpdated() {
    setEditingAsset(null);
    setToastMessage("Asset updated.");
    await loadAssets();
  }

  async function handleDeleteClick(a: Asset) {
    const { count, error: countError } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("asset_id", a.id);
    if (countError) {
      setError(countError.message);
      return;
    }

    if (count && count > 0) {
      await confirm(
        `"${a.symbol}" has ${count} transaction${count === 1 ? "" : "s"} linked to it. Delete ${count === 1 ? "that transaction" : "those transactions"} first before you can delete this asset.`,
        { title: "Can't delete this asset", confirmLabel: "OK", hideCancel: true }
      );
      return;
    }

    const confirmed = await confirm(
      `Delete "${a.symbol}" — ${a.name}? This can't be undone.`,
      { title: "Delete asset?", confirmLabel: "Delete", variant: "danger" }
    );
    if (!confirmed) return;

    const { error: deleteError } = await supabase.from("assets").delete().eq("id", a.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setToastMessage("Asset deleted.");
    await loadAssets();
  }

  return (
    <RequireAuth>
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <main className={`${CONTAINER_CLASS} py-10`}>
        <PageHeader
          title="Assets"
          description="The shared asset list used across all portfolios. New assets are added from the transaction form on the Holdings page."
        />

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading assets…</p>
        ) : assets.length === 0 ? (
          <EmptyState
            title="No assets yet"
            description='Add one from the "+ Add transaction" form on the Holdings page.'
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    <th className="px-4 py-3 font-medium">Symbol</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Currency</th>
                    <th className="px-4 py-3 font-medium">Sector</th>
                    <th className="px-4 py-3 font-medium">Country</th>
                    <th className="px-4 py-3 font-medium">Tax bucket</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {assets.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3 font-medium">{a.symbol}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{a.name}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {a.asset_type}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {a.currency}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {a.sector ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {a.country ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {a.tax_bucket}
                      </td>
                      <td className="px-2 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingAsset(a)}
                            aria-label="Edit asset"
                            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-all duration-150 hover:-translate-y-px hover:bg-gray-100 hover:text-blue-600 hover:shadow-sm active:translate-y-0 active:shadow-none dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-blue-400"
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(a)}
                            aria-label="Delete asset"
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
          </div>
        )}
      </main>

      {editingAsset && (
        <EditAssetModal
          asset={editingAsset}
          onClose={() => setEditingAsset(null)}
          onSaved={handleAssetUpdated}
        />
      )}

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
    </RequireAuth>
  );
}
