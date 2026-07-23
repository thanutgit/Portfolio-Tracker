"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatPercent, formatUnitPrice } from "@/lib/format";
import { DIFF_WARNING_PCT } from "@/lib/constants";
import { useConfirm } from "@/lib/hooks/useConfirm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/PageHeader";
import { RequireAuth } from "@/components/RequireAuth";
import { CONTAINER_CLASS } from "@/lib/layout";
import { hasAutoFetch } from "@/lib/coingecko";
import { isForeignStock } from "@/lib/finnhub";

interface AssetLite {
  id: string;
  symbol: string;
  name: string;
  currency: string;
  asset_type: string;
  market: string | null;
  coingecko_id: string | null;
  price_source: string | null;
}

interface ParsedRow {
  rawSymbol: string;
  priceText: string;
  price: number | null;
  assetId: string | null;
  currency: string | null;
  oldPrice: number | null;
  diffPct: number | null;
  status: "ok" | "not_found" | "invalid_price";
}

interface PriceEntry {
  symbol: string;
  priceText: string;
  assetId?: string;
}

interface EntryRow {
  id: string;
  assetId: string | null;
  priceText: string;
}

function newEntryRow(): EntryRow {
  return { id: crypto.randomUUID(), assetId: null, priceText: "" };
}

function splitLine(line: string, delimiter: string) {
  const [symbolPart, pricePart = ""] = line.split(delimiter);
  return {
    symbol: (symbolPart ?? "").trim().replace(/^"|"$/g, ""),
    priceText: pricePart.trim().replace(/^"|"$/g, ""),
  };
}

// Accepts comma- or tab-separated "symbol,price" lines (one per asset), and
// drops a leading header row like "symbol,price" if present.
function parseInput(raw: string): { symbol: string; priceText: string }[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const delimiter = raw.includes("\t") ? "\t" : ",";
  const rows = lines.map((line) => splitLine(line, delimiter));

  const first = rows[0];
  if (first.priceText !== "" && Number.isNaN(Number(first.priceText))) {
    return rows.slice(1);
  }
  return rows;
}

const COMBOBOX_INPUT_CLASS =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950";

// Same search-then-pick pattern as TransactionModal's asset combobox, minus
// the "add new asset" affordance — Prices only sets prices for assets that
// already exist.
function AssetRowCombobox({
  options,
  selected,
  onSelect,
  onClear,
}: {
  options: AssetLite[];
  selected: AssetLite | null;
  onSelect: (asset: AssetLite) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Same fix as TransactionModal's TxnAssetCombobox — see its comment
    // and DECISIONS.md/GOTCHAS.md for why an 8-item empty-query cap was a
    // real bug, not a deliberate choice.
    if (!q) return options.slice(0, 50);
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
        className={COMBOBOX_INPUT_CLASS}
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <ul className="max-h-40 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                No matching assets
              </li>
            ) : (
              filtered.map((a) => (
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
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

type Mode = "select" | "paste";

export default function PricesPage() {
  const [mode, setMode] = useState<Mode>("select");
  const [assets, setAssets] = useState<AssetLite[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);

  const [entryRows, setEntryRows] = useState<EntryRow[]>([newEntryRow()]);
  const [rawText, setRawText] = useState("");

  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const {
    confirm,
    confirmState,
    handleConfirm: respondConfirm,
    handleCancel: respondCancel,
  } = useConfirm();

  useEffect(() => {
    (async () => {
      setLoadingAssets(true);
      const { data, error } = await supabase
        .from("assets")
        .select("id, symbol, name, currency, asset_type, market, coingecko_id, price_source");
      if (error) {
        setError(error.message);
      } else {
        setAssets(data ?? []);
      }
      setLoadingAssets(false);
    })();
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setParsedRows(null);
    setError(null);
    setSaveMessage(null);
  }

  // Assets with their own auto-refresh — crypto via CoinGecko and foreign
  // stocks via Finnhub, both driven by `price_source` (migrations/0015,
  // DECISIONS.md D154) — are left out of the picker entirely, since a
  // manual price here would just be redundant with (and could conflict
  // with) the automated one. Equivalent to `price_source IS NULL` (only
  // `null` means "no auto-fetch"), written as two named predicates for
  // clarity at the call site.
  const selectableAssets = useMemo(
    () => assets.filter((a) => !hasAutoFetch(a) && !isForeignStock(a)),
    [assets]
  );

  function optionsForRow(rowId: string) {
    const takenElsewhere = new Set(
      entryRows.filter((r) => r.id !== rowId && r.assetId).map((r) => r.assetId as string)
    );
    return selectableAssets.filter((a) => !takenElsewhere.has(a.id));
  }

  function updateRow(id: string, patch: Partial<EntryRow>) {
    setEntryRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setEntryRows((prev) => [...prev, newEntryRow()]);
  }
  function removeRow(id: string) {
    setEntryRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.id !== id)));
  }

  async function runPreview(entries: PriceEntry[], emptyMessage: string) {
    setError(null);
    setSaveMessage(null);
    setParsedRows(null);

    if (entries.length === 0) {
      setError(emptyMessage);
      return;
    }

    setPreviewing(true);

    const bySymbol = new Map(assets.map((a) => [a.symbol.toUpperCase(), a]));
    const byId = new Map(assets.map((a) => [a.id, a]));
    const matchedAssetIds = entries
      .map((e) => (e.assetId ? byId.get(e.assetId)?.id : bySymbol.get(e.symbol.toUpperCase())?.id))
      .filter((id): id is string => Boolean(id));

    let oldPriceByAssetId = new Map<string, number>();
    if (matchedAssetIds.length > 0) {
      const { data: latest, error: latestError } = await supabase
        .from("latest_prices")
        .select("asset_id, price")
        .in("asset_id", matchedAssetIds);
      if (latestError) {
        setError(latestError.message);
        setPreviewing(false);
        return;
      }
      oldPriceByAssetId = new Map((latest ?? []).map((p) => [p.asset_id, Number(p.price)]));
    }

    const rows: ParsedRow[] = entries.map((e) => {
      // Prefer the exact asset id (known for real when picked from the
      // dropdown) over a symbol-text match, which could in principle match
      // the wrong asset if two assets happen to share a symbol on different
      // markets.
      const asset = e.assetId ? byId.get(e.assetId) : bySymbol.get(e.symbol.toUpperCase());
      const parsedPrice = e.priceText === "" ? NaN : Number(e.priceText);

      if (!asset) {
        return {
          rawSymbol: e.symbol,
          priceText: e.priceText,
          price: Number.isFinite(parsedPrice) ? parsedPrice : null,
          assetId: null,
          currency: null,
          oldPrice: null,
          diffPct: null,
          status: "not_found",
        };
      }

      const oldPrice = oldPriceByAssetId.get(asset.id) ?? null;

      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        return {
          rawSymbol: e.symbol,
          priceText: e.priceText,
          price: null,
          assetId: asset.id,
          currency: asset.currency,
          oldPrice,
          diffPct: null,
          status: "invalid_price",
        };
      }

      const diffPct = oldPrice && oldPrice !== 0 ? ((parsedPrice - oldPrice) / oldPrice) * 100 : null;
      return {
        rawSymbol: asset.symbol,
        priceText: e.priceText,
        price: parsedPrice,
        assetId: asset.id,
        currency: asset.currency,
        oldPrice,
        diffPct,
        status: "ok",
      };
    });

    setParsedRows(rows);
    setPreviewing(false);
  }

  function handlePreviewPaste() {
    runPreview(parseInput(rawText), 'Paste at least one "symbol,price" line first.');
  }

  function handlePreviewSelect() {
    const entries: PriceEntry[] = entryRows
      .filter((r) => r.assetId && r.priceText.trim() !== "")
      .map((r) => {
        const asset = assets.find((a) => a.id === r.assetId)!;
        return { symbol: asset.symbol, priceText: r.priceText, assetId: asset.id };
      });
    runPreview(entries, "Pick an asset and enter a price for at least one row first.");
  }

  async function handleConfirm() {
    if (!parsedRows) return;
    const okRows = parsedRows.filter((r) => r.status === "ok");
    if (okRows.length === 0) return;

    const suspicious = okRows.filter(
      (r) => r.diffPct !== null && Math.abs(r.diffPct) > DIFF_WARNING_PCT
    );
    if (suspicious.length > 0) {
      const summary = suspicious
        .map((r) => `${r.rawSymbol}: ${formatPercent(r.diffPct as number)}`)
        .join(", ");
      const confirmed = await confirm(
        `These moved more than ${DIFF_WARNING_PCT}% from the last known price — double-check for a typo or misplaced decimal:\n${summary}\n\nSave anyway?`,
        { title: "Unusual price change", confirmLabel: "Save anyway" }
      );
      if (!confirmed) return;
    }

    setSaving(true);
    setError(null);
    const payload = okRows.map((r) => ({
      asset_id: r.assetId,
      price: r.price,
      source: mode === "select" ? "manual" : "csv",
    }));
    const { error } = await supabase.from("prices").insert(payload);
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    setSaveMessage(`Saved ${okRows.length} price${okRows.length === 1 ? "" : "s"}.`);
    if (mode === "paste") {
      setRawText("");
    } else {
      setEntryRows([newEntryRow()]);
    }
    setParsedRows(null);
    setSaving(false);
  }

  const notFoundRows = parsedRows?.filter((r) => r.status === "not_found") ?? [];
  const invalidRows = parsedRows?.filter((r) => r.status === "invalid_price") ?? [];
  const okRows = parsedRows?.filter((r) => r.status === "ok") ?? [];

  const hasCompleteSelectRow = entryRows.some(
    (r) => r.assetId && r.priceText.trim() !== ""
  );

  function tabButtonClass(active: boolean) {
    return `cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
      active
        ? "bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400"
        : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
    }`;
  }

  return (
    <RequireAuth>
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <main className={`${CONTAINER_CLASS} py-10`}>
        <PageHeader
          title="Prices"
          description={
            <>
              Set prices for assets without a price API (e.g. Thai funds) — pick from the list,
              or paste <code>symbol,price</code>{" "}
              lines for quick bulk entry. Crypto has its own auto-refresh and doesn&apos;t need
              this.
            </>
          }
        />

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}
        {saveMessage && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
            {saveMessage}
          </div>
        )}

        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => switchMode("select")}
            className={tabButtonClass(mode === "select")}
          >
            Select from list
          </button>
          <button
            type="button"
            onClick={() => switchMode("paste")}
            className={tabButtonClass(mode === "paste")}
          >
            Paste CSV
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {mode === "select" ? (
            <>
              <p className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                Pick an asset and enter its price — add more rows for several at once.
              </p>
              <div className="space-y-3">
                {entryRows.map((row) => {
                  const selected = row.assetId
                    ? assets.find((a) => a.id === row.assetId) ?? null
                    : null;
                  return (
                    <div key={row.id} className="flex items-start gap-3">
                      <div className="flex-1">
                        <AssetRowCombobox
                          options={optionsForRow(row.id)}
                          selected={selected}
                          onSelect={(a) => updateRow(row.id, { assetId: a.id })}
                          onClear={() => updateRow(row.id, { assetId: null })}
                        />
                      </div>
                      <div className="w-36">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.priceText}
                          onChange={(e) => updateRow(row.id, { priceText: e.target.value })}
                          placeholder="Price"
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950"
                        />
                      </div>
                      {entryRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          aria-label="Remove row"
                          className="inline-flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-all duration-150 hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={addRow}
                className="mt-3 cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              >
                + Add another asset
              </button>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={handlePreviewSelect}
                  disabled={loadingAssets || previewing || !hasCompleteSelectRow}
                  className="cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-gray-50 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {previewing ? "Checking…" : "Preview"}
                </button>
                {loadingAssets && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">Loading assets…</span>
                )}
              </div>
            </>
          ) : (
            <>
              <label
                htmlFor="price-paste"
                className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Paste CSV or tab-separated (symbol, price)
              </label>
              <textarea
                id="price-paste"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={8}
                placeholder={"SCBS&P500E,43.56\nSCBGOLDE,22.77\nSCBCHAE,11.14"}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950"
              />
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={handlePreviewPaste}
                  disabled={loadingAssets || previewing || rawText.trim() === ""}
                  className="cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-gray-50 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {previewing ? "Parsing…" : "Preview"}
                </button>
                {loadingAssets && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">Loading assets…</span>
                )}
              </div>
            </>
          )}
        </div>

        {parsedRows && (
          <div className="mt-6 space-y-6">
            {notFoundRows.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                <p className="mb-1 font-medium">
                  No matching asset — nothing will be saved for these:
                </p>
                <ul className="list-inside list-disc">
                  {notFoundRows.map((r, i) => (
                    <li key={i}>
                      &quot;{r.rawSymbol}&quot; ({r.priceText || "no price"})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {invalidRows.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                <p className="mb-1 font-medium">
                  Matched an asset but the price isn&apos;t a valid number — nothing will be
                  saved for these:
                </p>
                <ul className="list-inside list-disc">
                  {invalidRows.map((r, i) => (
                    <li key={i}>
                      {r.rawSymbol}: &quot;{r.priceText}&quot;
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              {okRows.length === 0 ? (
                <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
                  Nothing valid to save.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                          <th className="px-4 py-3 font-medium">Symbol</th>
                          <th className="px-4 py-3 text-right font-medium">Old Price</th>
                          <th className="px-4 py-3 text-right font-medium">New Price</th>
                          <th className="px-4 py-3 text-right font-medium">Diff</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {okRows.map((r, i) => {
                          const suspicious =
                            r.diffPct !== null && Math.abs(r.diffPct) > DIFF_WARNING_PCT;
                          return (
                            <tr
                              key={i}
                              className={suspicious ? "bg-amber-50 dark:bg-amber-950/30" : ""}
                            >
                              <td className="px-4 py-3 font-medium">{r.rawSymbol}</td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums">
                                {r.oldPrice === null
                                  ? "—"
                                  : formatUnitPrice(r.oldPrice, r.currency ?? "THB")}
                              </td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums">
                                {formatUnitPrice(r.price as number, r.currency ?? "THB")}
                              </td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums">
                                {r.diffPct === null ? "—" : formatPercent(r.diffPct)}
                                {suspicious && (
                                  <span className="ml-1 text-amber-600 dark:text-amber-400">
                                    ⚠
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
                    <button
                      onClick={handleConfirm}
                      disabled={saving}
                      className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-blue-700 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
                    >
                      {saving ? "Saving…" : `Confirm & save ${okRows.length}`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      <ConfirmDialog state={confirmState} onConfirm={respondConfirm} onCancel={respondCancel} />
    </div>
    </RequireAuth>
  );
}
