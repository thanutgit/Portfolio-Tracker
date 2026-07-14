"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { ASSET_TYPES, CURRENCIES, TAX_BUCKETS, isSymbolTaken } from "@/lib/assets";
import { useConfirm } from "@/lib/hooks/useConfirm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Asset } from "@/lib/types";

interface Props {
  asset: Asset;
  onClose: () => void;
  onSaved: () => void;
}

const INPUT_CLASS =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950";
const LABEL_CLASS = "mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300";

export function EditAssetModal({ asset, onClose, onSaved }: Props) {
  const [symbol, setSymbol] = useState(asset.symbol);
  const [name, setName] = useState(asset.name);
  const [assetType, setAssetType] = useState(asset.asset_type);
  const [currency, setCurrency] = useState(asset.currency);
  const [sector, setSector] = useState(asset.sector ?? "");
  const [country, setCountry] = useState(asset.country ?? "");
  const [taxBucket, setTaxBucket] = useState(asset.tax_bucket);
  const [coingeckoId, setCoingeckoId] = useState(asset.coingecko_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedSymbol = symbol.trim();
    const trimmedName = name.trim();
    if (!trimmedSymbol) {
      setError("Symbol is required.");
      return;
    }
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    const symbolChanged = trimmedSymbol !== asset.symbol;
    if (symbolChanged) {
      const { taken, error: lookupError } = await isSymbolTaken(trimmedSymbol, asset.id);
      if (lookupError) {
        setError(lookupError);
        return;
      }
      if (taken) {
        setError(`An asset with symbol "${trimmedSymbol}" already exists.`);
        return;
      }

      const confirmed = await confirm(
        `Changing the symbol from "${asset.symbol}" to "${trimmedSymbol}" won't affect this asset's existing transaction history — transactions reference it by internal ID, not by symbol.`,
        { title: "Change symbol?", confirmLabel: "Continue" }
      );
      if (!confirmed) return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("assets")
      .update({
        symbol: trimmedSymbol,
        name: trimmedName,
        asset_type: assetType,
        currency,
        sector: sector.trim() || null,
        country: country.trim() || null,
        tax_bucket: taxBucket,
        coingecko_id: coingeckoId.trim() || null,
      })
      .eq("id", asset.id);
    if (error) {
      if (error.code === "23505" || /duplicate key/i.test(error.message)) {
        if (/coingecko_id/i.test(error.message)) {
          setError("Another asset is already linked to this CoinGecko coin.");
        } else {
          setError(`An asset with symbol "${trimmedSymbol}" already exists.`);
        }
      } else {
        setError(error.message);
      }
      setSaving(false);
      return;
    }

    setSaving(false);
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm dark:bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-800 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          Edit asset
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Changing the symbol is fine — transactions reference this asset by
          internal ID, not by symbol.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>Symbol</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                required
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>Asset type</label>
              <select
                value={assetType}
                onChange={(e) => setAssetType(e.target.value)}
                className={`cursor-pointer ${INPUT_CLASS}`}
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={`cursor-pointer ${INPUT_CLASS}`}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>Sector (optional)</label>
              <input
                type="text"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                placeholder="e.g. Technology"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Country (optional)</label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. US"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {assetType === "crypto" && (
            <div>
              <label className={LABEL_CLASS}>CoinGecko ID (optional)</label>
              <input
                type="text"
                value={coingeckoId}
                onChange={(e) => setCoingeckoId(e.target.value)}
                placeholder="e.g. bitcoin"
                className={INPUT_CLASS}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Needed for auto price-refresh. Assets added via &quot;Search
                asset&quot; already have this filled in — set it here to
                backfill an older or manually-entered crypto asset.
              </p>
            </div>
          )}

          <div>
            <label className={LABEL_CLASS}>Tax bucket</label>
            <select
              value={taxBucket}
              onChange={(e) => setTaxBucket(e.target.value)}
              className={`w-full cursor-pointer sm:w-1/2 ${INPUT_CLASS}`}
            >
              {TAX_BUCKETS.map((t) => (
                <option key={t} value={t}>
                  {t}
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
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  );
}
