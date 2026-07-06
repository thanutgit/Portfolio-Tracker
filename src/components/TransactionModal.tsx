"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useConfirm } from "@/lib/hooks/useConfirm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ASSET_TYPES, CURRENCIES, TAX_BUCKETS, createAsset } from "@/lib/assets";
import { formatMoney, formatQuantity } from "@/lib/format";
import type { Asset } from "@/lib/types";

interface Props {
  portfolioId: string;
  onClose: () => void;
  onSaved: () => void;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const INPUT_CLASS =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950";
const TEXT_INPUT_CLASS =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950";
const LABEL_CLASS = "mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300";

export function TransactionModal({ portfolioId, onClose, onSaved }: Props) {
  const [type, setType] = useState<"buy" | "sell">("buy");

  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetQuery, setAssetQuery] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [showAssetList, setShowAssetList] = useState(false);

  const [showNewAssetForm, setShowNewAssetForm] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [newName, setNewName] = useState("");
  const [newAssetType, setNewAssetType] = useState("stock");
  const [newCurrency, setNewCurrency] = useState("THB");
  const [newSector, setNewSector] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [newTaxBucket, setNewTaxBucket] = useState("normal");
  const [creatingAsset, setCreatingAsset] = useState(false);
  const [newAssetError, setNewAssetError] = useState<string | null>(null);

  const [tradeDate, setTradeDate] = useState(today());
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("id, symbol, name, asset_type, currency, sector, country, tax_bucket")
        .order("symbol");
      if (error) {
        setError(error.message);
      } else {
        setAssets(data ?? []);
      }
    })();
  }, []);

  const filteredAssets = useMemo(() => {
    const q = assetQuery.trim().toLowerCase();
    if (!q) return assets.slice(0, 8);
    return assets
      .filter((a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [assets, assetQuery]);

  function selectAsset(asset: Asset) {
    setSelectedAsset(asset);
    setAssetQuery("");
    setShowAssetList(false);
  }

  function openNewAssetForm() {
    setNewSymbol(assetQuery.trim());
    setNewName("");
    setNewAssetType("stock");
    setNewCurrency("THB");
    setNewSector("");
    setNewCountry("");
    setNewTaxBucket("normal");
    setNewAssetError(null);
    setShowNewAssetForm(true);
    setShowAssetList(false);
  }

  async function handleCreateAsset() {
    setCreatingAsset(true);
    setNewAssetError(null);
    const { data, error } = await createAsset({
      symbol: newSymbol,
      name: newName,
      asset_type: newAssetType,
      currency: newCurrency,
      sector: newSector,
      country: newCountry,
      tax_bucket: newTaxBucket,
    });
    if (error || !data) {
      setNewAssetError(error ?? "Failed to create asset.");
      setCreatingAsset(false);
      return;
    }
    setAssets((prev) => [...prev, data].sort((a, b) => a.symbol.localeCompare(b.symbol)));
    setSelectedAsset(data);
    setShowNewAssetForm(false);
    setCreatingAsset(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedAsset) {
      setError("Choose an asset first.");
      return;
    }
    const quantityNum = Number(quantity);
    const priceNum = Number(price);
    const feeNum = Number(fee) || 0;
    if (!quantityNum || quantityNum <= 0) {
      setError("Enter a quantity greater than 0.");
      return;
    }
    if (!priceNum || priceNum <= 0) {
      setError("Enter a price per unit greater than 0.");
      return;
    }

    let warningLine = "";
    if (type === "sell") {
      const { data: holding, error: holdingError } = await supabase
        .from("holdings")
        .select("quantity")
        .eq("portfolio_id", portfolioId)
        .eq("asset_id", selectedAsset.id)
        .maybeSingle();
      if (holdingError) {
        setError(holdingError.message);
        return;
      }
      const currentQty = holding ? Number(holding.quantity) : 0;
      if (quantityNum > currentQty) {
        warningLine = `\n\n⚠ You currently hold ${formatQuantity(currentQty)} unit${currentQty === 1 ? "" : "s"} of ${selectedAsset.symbol} — this sells more than you have.`;
      }
    }

    const total = quantityNum * priceNum + feeNum;
    const verb = type === "buy" ? "buy" : "sell";
    const message =
      `You're about to ${verb} ${formatQuantity(quantityNum)} unit${quantityNum === 1 ? "" : "s"} of ` +
      `${selectedAsset.symbol} at ${formatMoney(priceNum, selectedAsset.currency)} per unit — ` +
      `total ${formatMoney(total, selectedAsset.currency)} (incl. fee).${warningLine}`;

    const confirmed = await confirm(message, {
      title: "Confirm transaction",
      confirmLabel: type === "buy" ? "Confirm buy" : "Confirm sell",
      variant: warningLine ? "danger" : "default",
    });
    if (!confirmed) return;

    setSaving(true);
    const { error: insertError } = await supabase.from("transactions").insert({
      portfolio_id: portfolioId,
      asset_id: selectedAsset.id,
      type,
      trade_date: tradeDate,
      quantity: quantityNum,
      price: priceNum,
      fee: feeNum,
    });
    if (insertError) {
      setError(insertError.message);
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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-800 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          Add transaction
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Recorded as a new row in the transaction ledger — average cost and holdings recompute
          automatically.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Type: two big buttons, not a dropdown — hard to misclick */}
          <div>
            <label className={LABEL_CLASS}>Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("buy")}
                className={`cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium transition-all duration-150 ${
                  type === "buy"
                    ? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:border-blue-400/40 dark:bg-blue-400/10 dark:text-blue-400"
                    : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400 dark:hover:bg-gray-800"
                }`}
              >
                Buy
              </button>
              <button
                type="button"
                onClick={() => setType("sell")}
                className={`cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium transition-all duration-150 ${
                  type === "sell"
                    ? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:border-blue-400/40 dark:bg-blue-400/10 dark:text-blue-400"
                    : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400 dark:hover:bg-gray-800"
                }`}
              >
                Sell
              </button>
            </div>
          </div>

          {/* Asset combobox */}
          <div>
            <label className={LABEL_CLASS}>Asset</label>
            {selectedAsset ? (
              <div className="flex items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
                <span>
                  <span className="font-medium">{selectedAsset.symbol}</span>{" "}
                  <span className="text-gray-500 dark:text-gray-400">{selectedAsset.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedAsset(null)}
                  className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={assetQuery}
                  onChange={(e) => setAssetQuery(e.target.value)}
                  onFocus={() => setShowAssetList(true)}
                  onBlur={() => setTimeout(() => setShowAssetList(false), 150)}
                  placeholder="Search by symbol or name…"
                  className={TEXT_INPUT_CLASS}
                />
                {showAssetList && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                    <ul className="max-h-40 overflow-y-auto">
                      {filteredAssets.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => selectAsset(a)}
                            className="block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            <span className="font-medium">{a.symbol}</span>{" "}
                            <span className="text-gray-500 dark:text-gray-400">{a.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={openNewAssetForm}
                      className="block w-full cursor-pointer border-t border-gray-200 px-3 py-2 text-left text-sm font-medium text-blue-600 hover:bg-blue-50 dark:border-gray-700 dark:text-blue-400 dark:hover:bg-blue-950/40"
                    >
                      + Add new asset{assetQuery.trim() ? ` "${assetQuery.trim()}"` : ""}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Inline "add new asset" expansion */}
          {showNewAssetForm && (
            <div className="space-y-3 rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-700">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                New asset
              </p>

              {newAssetError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                  {newAssetError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLASS}>Symbol</label>
                  <input
                    type="text"
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value)}
                    placeholder="e.g. AAPL"
                    className={TEXT_INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Apple Inc."
                    className={TEXT_INPUT_CLASS}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLASS}>Asset type</label>
                  <select
                    value={newAssetType}
                    onChange={(e) => setNewAssetType(e.target.value)}
                    className={`cursor-pointer ${TEXT_INPUT_CLASS}`}
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
                    value={newCurrency}
                    onChange={(e) => setNewCurrency(e.target.value)}
                    className={`cursor-pointer ${TEXT_INPUT_CLASS}`}
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
                    value={newSector}
                    onChange={(e) => setNewSector(e.target.value)}
                    placeholder="e.g. Technology"
                    className={TEXT_INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Country (optional)</label>
                  <input
                    type="text"
                    value={newCountry}
                    onChange={(e) => setNewCountry(e.target.value)}
                    placeholder="e.g. US"
                    className={TEXT_INPUT_CLASS}
                  />
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>Tax bucket</label>
                <select
                  value={newTaxBucket}
                  onChange={(e) => setNewTaxBucket(e.target.value)}
                  className={`w-full cursor-pointer sm:w-1/2 ${TEXT_INPUT_CLASS}`}
                >
                  {TAX_BUCKETS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewAssetForm(false)}
                  className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-gray-50 hover:shadow-md active:translate-y-0 active:shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateAsset}
                  disabled={creatingAsset}
                  className="cursor-pointer rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-blue-700 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creatingAsset ? "Creating…" : "Create & use this asset"}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className={LABEL_CLASS}>Trade date</label>
            <input
              type="date"
              value={tradeDate}
              onChange={(e) => setTradeDate(e.target.value)}
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
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                placeholder="0.00"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>
                Price per unit{selectedAsset ? ` (${selectedAsset.currency})` : ""}
              </label>
              <input
                type="number"
                step="0.000001"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
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
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0.00"
              className={`sm:w-1/2 ${INPUT_CLASS}`}
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
              {saving ? "Saving…" : "Save transaction"}
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  );
}
