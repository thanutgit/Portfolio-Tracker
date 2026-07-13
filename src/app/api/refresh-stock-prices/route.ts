import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isForeignStock } from "@/lib/finnhub";

export const dynamic = "force-dynamic";

interface SkipReason {
  symbol: string;
  reason: string;
}

// Safety cap — Finnhub's free tier is 60 calls/min, 300/day, and each held
// foreign stock costs one /quote call per refresh. Personal portfolios are
// nowhere near this in practice; this just stops a pathological case from
// burning the whole daily quota in one page load.
const MAX_SYMBOLS = 50;

export async function POST() {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "FINNHUB_API_KEY is not configured." }, { status: 500 });
  }

  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select("id, symbol, asset_type, market")
    .eq("asset_type", "stock");

  if (assetsError) {
    return NextResponse.json({ error: assetsError.message }, { status: 500 });
  }

  const eligible = (assets ?? []).filter(isForeignStock).slice(0, MAX_SYMBOLS);
  if (eligible.length === 0) {
    return NextResponse.json({ updated: [], skipped: [] });
  }

  const skipped: SkipReason[] = [];
  const updated: { symbol: string; price: number; as_of: string }[] = [];
  const rows: { asset_id: string; price: number; source: string; as_of: string }[] = [];
  const now = new Date().toISOString();

  // Finnhub's /quote endpoint takes one symbol at a time (no batch option,
  // unlike CoinGecko's /simple/price) — fetched in parallel since personal
  // portfolios hold at most a handful of foreign stocks.
  await Promise.all(
    eligible.map(async (asset) => {
      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(asset.symbol)}&token=${apiKey}`,
          { signal: AbortSignal.timeout(8_000) }
        );
        if (!res.ok) {
          skipped.push({ symbol: asset.symbol, reason: `Finnhub API returned ${res.status}` });
          return;
        }
        const quote = (await res.json()) as { c?: number };
        // Finnhub returns c: 0 for an unrecognized/delisted symbol, not an
        // HTTP error — treat that as "no price available", not a crash.
        if (!quote.c) {
          skipped.push({ symbol: asset.symbol, reason: "Finnhub didn't return a price" });
          return;
        }
        rows.push({ asset_id: asset.id, price: quote.c, source: "finnhub", as_of: now });
        updated.push({ symbol: asset.symbol, price: quote.c, as_of: now });
      } catch {
        skipped.push({ symbol: asset.symbol, reason: "Network error or timeout" });
      }
    })
  );

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("prices").insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ updated, skipped });
}
