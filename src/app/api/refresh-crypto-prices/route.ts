import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { COINGECKO_IDS, hasAutoFetch } from "@/lib/coingecko";

export const dynamic = "force-dynamic";

interface SkipReason {
  symbol: string;
  reason: string;
}

export async function POST() {
  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select("id, symbol")
    .eq("asset_type", "crypto");

  if (assetsError) {
    return NextResponse.json({ error: assetsError.message }, { status: 500 });
  }
  if (!assets || assets.length === 0) {
    return NextResponse.json({ updated: [], skipped: [] });
  }

  const skipped: SkipReason[] = [];
  const priceable = assets.filter((a) => {
    if (hasAutoFetch(a.symbol)) return true;
    skipped.push({ symbol: a.symbol, reason: "No CoinGecko mapping for this symbol" });
    return false;
  });

  if (priceable.length === 0) {
    return NextResponse.json({ updated: [], skipped });
  }

  const ids = [...new Set(priceable.map((a) => COINGECKO_IDS[a.symbol.toUpperCase()]))].join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=thb`;

  let body: Record<string, { thb?: number }>;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      const status = res.status === 429 ? 429 : 502;
      return NextResponse.json(
        {
          error:
            res.status === 429
              ? "CoinGecko rate limit hit — try again in a bit."
              : `CoinGecko API returned ${res.status}.`,
        },
        { status }
      );
    }
    body = await res.json();
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach CoinGecko (network error or timeout)." },
      { status: 502 }
    );
  }

  const now = new Date().toISOString();
  const rows: { asset_id: string; price: number; source: string; as_of: string }[] = [];
  const updated: { symbol: string; price: number; as_of: string }[] = [];

  for (const asset of priceable) {
    const coinId = COINGECKO_IDS[asset.symbol.toUpperCase()];
    const price = body[coinId]?.thb;
    if (price == null) {
      skipped.push({ symbol: asset.symbol, reason: "CoinGecko didn't return a THB price" });
      continue;
    }
    rows.push({ asset_id: asset.id, price, source: "api", as_of: now });
    updated.push({ symbol: asset.symbol, price, as_of: now });
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("prices").insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ updated, skipped });
}
