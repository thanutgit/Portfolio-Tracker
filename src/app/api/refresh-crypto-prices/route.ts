import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface SkipReason {
  symbol: string;
  reason: string;
}

export async function POST() {
  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select("id, symbol, coingecko_id, price_source")
    .eq("asset_type", "crypto");

  if (assetsError) {
    return NextResponse.json({ error: assetsError.message }, { status: 500 });
  }
  if (!assets || assets.length === 0) {
    return NextResponse.json({ updated: [], skipped: [] });
  }

  const skipped: SkipReason[] = [];
  // Eligibility is `price_source === 'coingecko'` (migrations/0015,
  // DECISIONS.md D154) — a dedicated column set at asset-creation time,
  // not derived from `coingecko_id` (supersedes the coingecko_id-as-flag
  // approach, which itself superseded D20's original hardcoded
  // { BTC, ETH } map). `coingecko_id` is still required to actually call
  // the API — checked separately below, since an inconsistent row
  // (price_source set without a coingecko_id, possible via
  // EditAssetModal's manual price_source dropdown) is a different
  // failure than "not eligible at all" and deserves its own reason.
  const priceable = assets.filter(
    (a): a is typeof a & { coingecko_id: string } => {
      if (a.price_source !== "coingecko") return false;
      if (a.coingecko_id) return true;
      skipped.push({
        symbol: a.symbol,
        reason: "price_source is 'coingecko' but no coingecko_id is set for this asset",
      });
      return false;
    }
  );

  if (priceable.length === 0) {
    return NextResponse.json({ updated: [], skipped });
  }

  const ids = [...new Set(priceable.map((a) => a.coingecko_id))].join(",");
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
    const price = body[asset.coingecko_id]?.thb;
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
