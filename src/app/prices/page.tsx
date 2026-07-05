"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatMoney, formatPercent } from "@/lib/format";
import { DIFF_WARNING_PCT } from "@/lib/constants";

interface AssetLite {
  id: string;
  symbol: string;
  currency: string;
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

export default function PricesPage() {
  const [assets, setAssets] = useState<AssetLite[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [rawText, setRawText] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingAssets(true);
      const { data, error } = await supabase.from("assets").select("id, symbol, currency");
      if (error) {
        setError(error.message);
      } else {
        setAssets(data ?? []);
      }
      setLoadingAssets(false);
    })();
  }, []);

  async function handlePreview() {
    setError(null);
    setSaveMessage(null);
    setParsedRows(null);

    const entries = parseInput(rawText);
    if (entries.length === 0) {
      setError("Paste at least one \"symbol,price\" line first.");
      return;
    }

    setPreviewing(true);

    const bySymbol = new Map(assets.map((a) => [a.symbol.toUpperCase(), a]));
    const matchedAssetIds = entries
      .map((e) => bySymbol.get(e.symbol.toUpperCase())?.id)
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
      const asset = bySymbol.get(e.symbol.toUpperCase());
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
        rawSymbol: e.symbol,
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
      const confirmed = window.confirm(
        `These moved more than ${DIFF_WARNING_PCT}% from the last known price — double-check for a typo or misplaced decimal:\n${summary}\n\nSave anyway?`
      );
      if (!confirmed) return;
    }

    setSaving(true);
    setError(null);
    const payload = okRows.map((r) => ({
      asset_id: r.assetId,
      price: r.price,
      source: "csv",
    }));
    const { error } = await supabase.from("prices").insert(payload);
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    setSaveMessage(`Saved ${okRows.length} price${okRows.length === 1 ? "" : "s"}.`);
    setRawText("");
    setParsedRows(null);
    setSaving(false);
  }

  const notFoundRows = parsedRows?.filter((r) => r.status === "not_found") ?? [];
  const invalidRows = parsedRows?.filter((r) => r.status === "invalid_price") ?? [];
  const okRows = parsedRows?.filter((r) => r.status === "ok") ?? [];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Prices</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Paste prices for assets without a price API (e.g. Thai funds) — one{" "}
            <code>symbol,price</code> pair per line. Crypto has its own auto-refresh and
            doesn&apos;t need this.
          </p>
        </header>

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

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
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
              onClick={handlePreview}
              disabled={loadingAssets || previewing || rawText.trim() === ""}
              className="cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-gray-50 hover:shadow-md active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {previewing ? "Parsing…" : "Preview"}
            </button>
            {loadingAssets && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Loading assets…
              </span>
            )}
          </div>
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
                                  : formatMoney(r.oldPrice, r.currency ?? "THB")}
                              </td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums">
                                {formatMoney(r.price as number, r.currency ?? "THB")}
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
    </div>
  );
}
