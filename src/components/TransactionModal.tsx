"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useConfirm } from "@/lib/hooks/useConfirm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DatePicker } from "@/components/DatePicker";
import { ASSET_TYPES, CURRENCIES, TAX_BUCKETS, createAsset } from "@/lib/assets";
import { formatMoney, formatQuantity, formatUnitPrice } from "@/lib/format";
import { computeTaxHoldingStatus } from "@/lib/taxHolding";
import type { Asset } from "@/lib/types";

interface Props {
  portfolioId: string;
  onClose: () => void;
  onSaved: (count: number) => void;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const INPUT_CLASS =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950";
const TEXT_INPUT_CLASS =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950";
const LABEL_CLASS = "mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300";

// "Search asset" mode's single result list mixes two sources — Finnhub
// stock search and the small, hardcoded crypto entry list (CRYPTO_SEARCH_
// ENTRIES) — so each result carries which one it came from and only the
// fields that source can actually provide.
type SearchResult =
  | { type: "stock"; symbol: string; description: string; verified?: boolean }
  | { type: "crypto"; symbol: string; name: string; coingeckoId: string };

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 6h12M8 6V4.5A1.5 1.5 0 019.5 3h1A1.5 1.5 0 0112 4.5V6m-6.5 0l.6 10.2A1.5 1.5 0 007.6 17.7h4.8a1.5 1.5 0 001.5-1.5L14.5 6"
      />
    </svg>
  );
}

interface TxnRow {
  id: string;
  type: "buy" | "sell";
  assetId: string | null;
  tradeDate: string;
  quantity: string;
  price: string;
  fee: string;
}

function newTxnRow(): TxnRow {
  return {
    id: crypto.randomUUID(),
    type: "buy",
    assetId: null,
    tradeDate: today(),
    quantity: "",
    price: "",
    fee: "0",
  };
}

// Per-row asset combobox — each row picks independently (the same asset can
// legitimately appear in more than one row, e.g. a buy and a later sell of
// the same holding in one batch, so rows never exclude each other's pick).
function TxnAssetCombobox({
  options,
  selected,
  onSelect,
  onClear,
  onAddNew,
}: {
  options: Asset[];
  selected: Asset | null;
  onSelect: (asset: Asset) => void;
  onClear: () => void;
  onAddNew: (query: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 8);
    return options
      .filter((a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [options, query]);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
        <span>
          <span className="font-medium">{selected.symbol}</span>{" "}
          <span className="text-gray-500 dark:text-gray-400">{selected.name}</span>
        </span>
        <button
          type="button"
          onClick={onClear}
          className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search by symbol or name…"
        className={TEXT_INPUT_CLASS}
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <ul className="max-h-40 overflow-y-auto">
            {filtered.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(a);
                    setQuery("");
                    setOpen(false);
                  }}
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
            onClick={() => onAddNew(query)}
            className="block w-full cursor-pointer border-t border-gray-200 px-3 py-2 text-left text-sm font-medium text-blue-600 hover:bg-blue-50 dark:border-gray-700 dark:text-blue-400 dark:hover:bg-blue-950/40"
          >
            + Add new asset{query.trim() ? ` "${query.trim()}"` : ""}
          </button>
        </div>
      )}
    </div>
  );
}

export function TransactionModal({ portfolioId, onClose, onSaved }: Props) {
  const [rows, setRows] = useState<TxnRow[]>([newTxnRow()]);
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map());

  const [assets, setAssets] = useState<Asset[]>([]);

  // "New asset" is a single shared sub-form (not one per row) — opened by
  // whichever row's "+ Add new asset" was clicked, tracked by
  // newAssetForRowId. Keeping only one instance avoids showing N copies of
  // the whole Finnhub search flow at once.
  const [newAssetForRowId, setNewAssetForRowId] = useState<string | null>(null);
  const [newAssetMode, setNewAssetMode] = useState<"manual" | "search">("manual");
  const [newSymbol, setNewSymbol] = useState("");
  const [newName, setNewName] = useState("");
  const [newAssetType, setNewAssetType] = useState("stock");
  const [newCurrency, setNewCurrency] = useState("THB");
  const [newSector, setNewSector] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [newMarket, setNewMarket] = useState<string | null>(null);
  const [newCoingeckoId, setNewCoingeckoId] = useState<string | null>(null);
  const [newTaxBucket, setNewTaxBucket] = useState("normal");
  const [creatingAsset, setCreatingAsset] = useState(false);
  const [newAssetError, setNewAssetError] = useState<string | null>(null);

  // Finnhub search mode (foreign stocks only) — see src/lib/finnhub.ts and
  // the two server routes it calls (finnhub-search, finnhub-profile).
  const [stockSearchQuery, setStockSearchQuery] = useState("");
  const [stockSearchResults, setStockSearchResults] = useState<SearchResult[]>([]);
  const [searchingStocks, setSearchingStocks] = useState(false);
  const [stockSearchError, setStockSearchError] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileMissingSectorCountry, setProfileMissingSectorCountry] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmState, handleConfirm, handleCancel } = useConfirm();

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

  function updateRow(id: string, patch: Partial<TxnRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setRowErrors((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }
  function addRow() {
    setRows((prev) => [...prev, newTxnRow()]);
  }
  function removeRow(id: string) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.id !== id)));
    setRowErrors((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  function openNewAssetForm(rowId: string, prefill: string) {
    setNewSymbol(prefill.trim());
    setNewName("");
    setNewAssetType("stock");
    setNewCurrency("THB");
    setNewSector("");
    setNewCountry("");
    setNewMarket(null);
    setNewCoingeckoId(null);
    setNewTaxBucket("normal");
    setNewAssetError(null);
    setNewAssetMode("manual");
    setStockSearchQuery("");
    setStockSearchResults([]);
    setStockSearchError(null);
    setProfileMissingSectorCountry(false);
    setNewAssetForRowId(rowId);
  }

  // "Search asset" mixes two sources, both hit in parallel (not one after
  // the other) after ~400ms of no typing: Finnhub's /search for stocks and
  // CoinGecko's /search for any coin (not limited to a fixed list —
  // supersedes the old hardcoded { BTC, ETH } approach, D20). If one side
  // errors, the other's results still show — only if BOTH come back empty
  // does the error text appear, so a CoinGecko hiccup doesn't hide valid
  // stock matches (or vice versa).
  useEffect(() => {
    const query = stockSearchQuery.trim();
    if (newAssetMode !== "search" || !query) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStockSearchResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearchingStocks(true);
      setStockSearchError(null);
      try {
        const [stockRes, cryptoRes] = await Promise.all([
          fetch(`/api/finnhub-search?q=${encodeURIComponent(query)}`),
          fetch(`/api/coingecko-search?q=${encodeURIComponent(query)}`),
        ]);
        const [stockJson, cryptoJson] = await Promise.all([stockRes.json(), cryptoRes.json()]);

        const errors: string[] = [];
        let stockResults: SearchResult[] = [];
        let cryptoResults: SearchResult[] = [];

        if (!stockRes.ok) {
          errors.push(stockJson.error ?? "Stock search failed.");
        } else {
          stockResults = (stockJson.results ?? []).map(
            (r: { symbol: string; description: string; verified?: boolean }) => ({
              type: "stock" as const,
              ...r,
            })
          );
        }

        if (!cryptoRes.ok) {
          errors.push(cryptoJson.error ?? "Crypto search failed.");
        } else {
          cryptoResults = (cryptoJson.results ?? []).map(
            (c: { id: string; symbol: string; name: string }) => ({
              type: "crypto" as const,
              symbol: c.symbol,
              name: c.name,
              coingeckoId: c.id,
            })
          );
        }

        setStockSearchResults([...cryptoResults, ...stockResults]);
        if (errors.length > 0 && stockResults.length === 0 && cryptoResults.length === 0) {
          setStockSearchError(errors.join(" "));
        }
      } catch {
        setStockSearchError("Couldn't reach the search service.");
        setStockSearchResults([]);
      } finally {
        setSearchingStocks(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [stockSearchQuery, newAssetMode]);

  // Selecting a search result auto-fills symbol/name immediately, then
  // fetches a profile (sector/country/currency/market for stocks; sector
  // only for crypto, since country/currency are fixed — see below) once,
  // not per search keystroke. Every auto-filled field stays a normal,
  // editable input afterward; a missing/empty profile just leaves those
  // blank for manual entry instead of erroring.
  async function selectSearchResult(result: SearchResult) {
    setNewSymbol(result.symbol);
    setStockSearchQuery("");
    setStockSearchResults([]);
    setProfileMissingSectorCountry(false);
    // Reset here (not just on open) so switching from a crypto pick to a
    // stock pick in the same session can't leave a stale coingecko_id
    // attached to what's about to become a stock asset.
    setNewCoingeckoId(null);
    setLoadingProfile(true);

    if (result.type === "crypto") {
      // Crypto has no registered country and this app prices it directly
      // in THB (see /api/refresh-crypto-prices) — only Sector is worth
      // fetching, Country/Currency are fixed rather than looked up.
      setNewName(result.name);
      setNewAssetType("crypto");
      setNewCountry("Global");
      setNewCurrency("THB");
      setNewCoingeckoId(result.coingeckoId);
      try {
        const res = await fetch(
          `/api/coingecko-profile?id=${encodeURIComponent(result.coingeckoId)}`
        );
        const json = await res.json();
        if (res.ok && json.sector) setNewSector(json.sector);
      } catch {
        // Ignore — sector just stays unfilled for manual entry.
      } finally {
        setLoadingProfile(false);
      }
      return;
    }

    // The "verified via direct lookup" fallback has no real company name —
    // that description is a UI label, not data, so leave Name blank for
    // manual entry instead of writing the label into it.
    setNewName(result.verified ? "" : result.description);
    setNewAssetType("stock");
    try {
      const res = await fetch(`/api/finnhub-profile?symbol=${encodeURIComponent(result.symbol)}`);
      const json = await res.json();
      if (res.ok) {
        if (json.sector) setNewSector(json.sector);
        if (json.country) setNewCountry(json.country);
        if (json.currency && CURRENCIES.includes(json.currency)) setNewCurrency(json.currency);
        setNewMarket(json.market ?? null);
        // Finnhub's profile endpoint has no fundamentals for ETFs/funds
        // (e.g. SCHD, SPY) — both come back null together in that case,
        // as opposed to a single missing field, which is worth telling the
        // user about instead of leaving the fields silently blank.
        if (!json.sector && !json.country) setProfileMissingSectorCountry(true);
      }
    } catch {
      // Ignore — sector/country/currency/market just stay unfilled and the
      // user can enter them manually; the asset can still be created.
    } finally {
      setLoadingProfile(false);
    }
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
      market: newMarket,
      coingecko_id: newCoingeckoId,
    });
    if (error || !data) {
      setNewAssetError(error ?? "Failed to create asset.");
      setCreatingAsset(false);
      return;
    }
    setAssets((prev) => [...prev, data].sort((a, b) => a.symbol.localeCompare(b.symbol)));
    if (newAssetForRowId) {
      updateRow(newAssetForRowId, { assetId: data.id });
    }
    setNewAssetForRowId(null);
    setCreatingAsset(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Per-row validation: a fully blank row (no asset, no quantity, no
    // price) is silently skipped, not an error — it's just a spare row the
    // user added and didn't fill in. A partially-filled row is a per-row
    // error that blocks Save until fixed; other, already-correct rows are
    // never blocked by it.
    const nextRowErrors = new Map<string, string>();
    const valid: (TxnRow & { asset: Asset })[] = [];
    for (const row of rows) {
      const isBlank = !row.assetId && !row.quantity.trim() && !row.price.trim();
      if (isBlank) continue;

      const asset = row.assetId ? (assets.find((a) => a.id === row.assetId) ?? null) : null;
      if (!asset) {
        nextRowErrors.set(row.id, "Choose an asset.");
        continue;
      }
      const quantityNum = Number(row.quantity);
      if (!quantityNum || quantityNum <= 0) {
        nextRowErrors.set(row.id, "Enter a quantity greater than 0.");
        continue;
      }
      const priceNum = Number(row.price);
      if (!priceNum || priceNum <= 0) {
        nextRowErrors.set(row.id, "Enter a price per unit greater than 0.");
        continue;
      }
      valid.push({ ...row, asset });
    }

    if (nextRowErrors.size > 0) {
      setRowErrors(nextRowErrors);
      setError("Fix the highlighted row(s) before saving.");
      return;
    }
    if (valid.length === 0) {
      setError("Add at least one transaction first.");
      return;
    }

    // Oversell + tax-holding warnings need a running total across THIS
    // batch, not just today's DB state — e.g. buying an asset in row 1 and
    // selling some of it in row 2 must be checked against row 1's effect,
    // not just what's already in the database.
    const uniqueAssetIds = [...new Set(valid.map((r) => r.asset.id))];
    const { data: holdingsData, error: holdingsError } = await supabase
      .from("holdings")
      .select("asset_id, quantity")
      .eq("portfolio_id", portfolioId)
      .in("asset_id", uniqueAssetIds);
    if (holdingsError) {
      setError(holdingsError.message);
      return;
    }
    const runningQty = new Map<string, number>(
      (holdingsData ?? []).map((h) => [h.asset_id, Number(h.quantity)])
    );

    const taxBucketAssetIds = [
      ...new Set(valid.filter((r) => r.asset.tax_bucket !== "normal").map((r) => r.asset.id)),
    ];
    const existingBuyLotsByAsset = new Map<string, { trade_date: string }[]>();
    let birthDate: string | null = null;
    if (taxBucketAssetIds.length > 0) {
      const [{ data: buyLots }, { data: settingsRow }] = await Promise.all([
        supabase
          .from("transactions")
          .select("asset_id, trade_date")
          .eq("portfolio_id", portfolioId)
          .eq("type", "buy")
          .in("asset_id", taxBucketAssetIds),
        supabase.from("user_settings").select("birth_date").limit(1).maybeSingle(),
      ]);
      birthDate = settingsRow?.birth_date ?? null;
      for (const lot of buyLots ?? []) {
        const list = existingBuyLotsByAsset.get(lot.asset_id) ?? [];
        list.push({ trade_date: lot.trade_date });
        existingBuyLotsByAsset.set(lot.asset_id, list);
      }
    }
    // Buy lots added earlier in this same batch — a sell later in the batch
    // needs to see these too, not just what's already saved in the DB.
    const batchBuyLotsByAsset = new Map<string, { trade_date: string }[]>();

    const rowMessages: string[] = [];
    const warningLines: string[] = [];

    valid.forEach((row, index) => {
      const qty = Number(row.quantity);
      const priceNum = Number(row.price);
      const feeNum = Number(row.fee) || 0;
      const total = qty * priceNum + feeNum;
      const verb = row.type === "buy" ? "Buy" : "Sell";
      rowMessages.push(
        `${index + 1}. ${verb} ${formatQuantity(qty)} unit${qty === 1 ? "" : "s"} of ${row.asset.symbol} at ${formatUnitPrice(priceNum, row.asset.currency)} per unit — total ${formatMoney(total, row.asset.currency)} (incl. fee).`
      );

      const currentQty = runningQty.get(row.asset.id) ?? 0;

      if (row.type === "sell") {
        if (qty > currentQty) {
          warningLines.push(
            `⚠ Row ${index + 1} (${row.asset.symbol}): you'd hold ${formatQuantity(currentQty)} unit${currentQty === 1 ? "" : "s"} at this point in the batch — this sells more than that.`
          );
        }
        if (row.asset.tax_bucket !== "normal") {
          const lots = [
            ...(existingBuyLotsByAsset.get(row.asset.id) ?? []),
            ...(batchBuyLotsByAsset.get(row.asset.id) ?? []),
          ];
          const notYetEligible = lots
            .map((lot) =>
              computeTaxHoldingStatus({
                taxBucket: row.asset.tax_bucket,
                tradeDate: lot.trade_date,
                birthDate,
              })
            )
            .filter((r) => r.status !== "met");
          if (notYetEligible.length > 0) {
            const latestDate = notYetEligible
              .map((r) => r.ageEligibleDate ?? r.eligibleDate ?? "")
              .reduce((max, d) => (d > max ? d : max), "");
            const lotWord = notYetEligible.length === 1 ? "lot" : "lots";
            warningLines.push(
              `⚠ Row ${index + 1} (${row.asset.symbol}): ${notYetEligible.length} ${row.asset.tax_bucket} ${lotWord} ${notYetEligible.length === 1 ? "hasn't" : "haven't"} met the holding-period condition yet (not eligible until ${latestDate}). Selling now may require repaying the tax benefit already claimed.`
            );
          }
        }
        runningQty.set(row.asset.id, currentQty - qty);
      } else {
        runningQty.set(row.asset.id, currentQty + qty);
        if (row.asset.tax_bucket !== "normal") {
          const list = batchBuyLotsByAsset.get(row.asset.id) ?? [];
          list.push({ trade_date: row.tradeDate });
          batchBuyLotsByAsset.set(row.asset.id, list);
        }
      }
    });

    const message = `You're about to save ${valid.length} transaction${valid.length === 1 ? "" : "s"}:\n\n${rowMessages.join("\n")}${warningLines.length > 0 ? `\n\n${warningLines.join("\n")}` : ""}`;

    const confirmed = await confirm(message, {
      title: "Confirm transactions",
      confirmLabel: `Confirm ${valid.length} transaction${valid.length === 1 ? "" : "s"}`,
      variant: warningLines.length > 0 ? "danger" : "default",
    });
    if (!confirmed) return;

    setSaving(true);
    // A single multi-row insert is one SQL statement — Postgres commits or
    // rejects it as a whole, so a bad row can never partially land while
    // others succeed (see GOTCHAS.md #1, which this directly guards against).
    const insertRows = valid.map((row) => ({
      portfolio_id: portfolioId,
      asset_id: row.asset.id,
      type: row.type,
      trade_date: row.tradeDate,
      quantity: Number(row.quantity),
      price: Number(row.price),
      fee: Number(row.fee) || 0,
    }));
    const { error: insertError } = await supabase.from("transactions").insert(insertRows);
    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setRows([newTxnRow()]);
    onSaved(valid.length);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm dark:bg-black/60"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-800 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          Add transaction(s)
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Recorded as new rows in the transaction ledger — average cost and holdings recompute
          automatically. Add more than one below to save several at once.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {rows.map((row, rowIndex) => {
            const selectedAsset = row.assetId
              ? (assets.find((a) => a.id === row.assetId) ?? null)
              : null;
            const rowError = rowErrors.get(row.id);
            return (
              <div
                key={row.id}
                className={`space-y-3 rounded-lg border p-3 ${
                  rowError
                    ? "border-red-300 dark:border-red-800"
                    : "border-gray-200 dark:border-gray-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="grid flex-1 grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => updateRow(row.id, { type: "buy" })}
                      className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-150 ${
                        row.type === "buy"
                          ? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:border-blue-400/40 dark:bg-blue-400/10 dark:text-blue-400"
                          : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400 dark:hover:bg-gray-800"
                      }`}
                    >
                      Buy
                    </button>
                    <button
                      type="button"
                      onClick={() => updateRow(row.id, { type: "sell" })}
                      className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-150 ${
                        row.type === "sell"
                          ? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:border-blue-400/40 dark:bg-blue-400/10 dark:text-blue-400"
                          : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400 dark:hover:bg-gray-800"
                      }`}
                    >
                      Sell
                    </button>
                  </div>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      aria-label="Remove row"
                      className="inline-flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-all duration-150 hover:-translate-y-px hover:bg-red-50 hover:text-red-600 hover:shadow-sm active:translate-y-0 active:shadow-none dark:text-gray-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>

                <div>
                  <label className={LABEL_CLASS}>Asset</label>
                  <TxnAssetCombobox
                    options={assets}
                    selected={selectedAsset}
                    onSelect={(a) => updateRow(row.id, { assetId: a.id })}
                    onClear={() => updateRow(row.id, { assetId: null })}
                    onAddNew={(query) => openNewAssetForm(row.id, query)}
                  />
                </div>

                {/* Inline "add new asset" expansion — shared sub-form,
                    targeted at whichever row's "+ Add new asset" was clicked */}
                {newAssetForRowId === row.id && (
                  <div className="space-y-3 rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-700">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      New asset
                    </p>

                    {newAssetError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                        {newAssetError}
                      </div>
                    )}

                    {/* Manual entry (Thai funds etc.) vs. Search asset
                        (Finnhub stocks + the small hardcoded BTC/ETH crypto
                        list) — same neutral-blue toggle treatment as
                        Buy/Sell, not colored green/red. */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setNewAssetMode("manual")}
                        className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-150 ${
                          newAssetMode === "manual"
                            ? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:border-blue-400/40 dark:bg-blue-400/10 dark:text-blue-400"
                            : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400 dark:hover:bg-gray-800"
                        }`}
                      >
                        Manual entry
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewAssetMode("search")}
                        className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-150 ${
                          newAssetMode === "search"
                            ? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:border-blue-400/40 dark:bg-blue-400/10 dark:text-blue-400"
                            : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400 dark:hover:bg-gray-800"
                        }`}
                      >
                        Search asset
                      </button>
                    </div>

                    {newAssetMode === "search" && (
                      <div className="relative">
                        <label className={LABEL_CLASS}>Search by name or ticker</label>
                        <input
                          type="text"
                          value={stockSearchQuery}
                          onChange={(e) => setStockSearchQuery(e.target.value)}
                          placeholder="e.g. Apple, AAPL, or Bitcoin"
                          className={TEXT_INPUT_CLASS}
                        />
                        {searchingStocks && (
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Searching…
                          </p>
                        )}
                        {stockSearchError && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                            {stockSearchError}
                          </p>
                        )}
                        {stockSearchResults.length > 0 && (
                          <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                            {stockSearchResults.map((r) => (
                              <li key={`${r.type}-${r.symbol}`}>
                                <button
                                  type="button"
                                  onClick={() => selectSearchResult(r)}
                                  className="block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                  <span className="font-medium">{r.symbol}</span>{" "}
                                  <span className="text-gray-500 dark:text-gray-400">
                                    {r.type === "crypto" ? `${r.name} — Crypto` : r.description}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {loadingProfile && (
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Loading company details…
                          </p>
                        )}
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
                      {newAssetMode === "manual" && (
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
                      )}
                      <div className={newAssetMode === "search" ? "col-span-2" : ""}>
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

                    {profileMissingSectorCountry && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Sector/country not available for this symbol (likely an ETF/fund) —
                        please fill in manually.
                      </p>
                    )}
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
                        onClick={() => setNewAssetForRowId(null)}
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

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className={LABEL_CLASS}>Trade date</label>
                    <DatePicker
                      value={row.tradeDate}
                      onChange={(v) => updateRow(row.id, { tradeDate: v })}
                      required
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Quantity</label>
                    <input
                      type="number"
                      step="0.000001"
                      min="0"
                      value={row.quantity}
                      onChange={(e) => updateRow(row.id, { quantity: e.target.value })}
                      placeholder="0.00"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>
                      Price{selectedAsset ? ` (${selectedAsset.currency})` : ""}
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      min="0"
                      value={row.price}
                      onChange={(e) => updateRow(row.id, { price: e.target.value })}
                      placeholder="0.00"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Fee</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.fee}
                      onChange={(e) => updateRow(row.id, { fee: e.target.value })}
                      placeholder="0.00"
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>

                {rowError && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    Row {rowIndex + 1}: {rowError}
                  </p>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={addRow}
            className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            + Add another row
          </button>

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
              {saving ? "Saving…" : "Save transaction(s)"}
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  );
}
