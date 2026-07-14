import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface CoinGeckoCoin {
  categories?: (string | null)[];
}

// CoinGecko's `categories` array isn't ranked by relevance and mixes real
// asset-class tags (e.g. "Layer 1 (L1)") with noise that describes who
// holds the coin, not what it is — fund/index/portfolio names. Filtered
// out before picking the first remaining category as "sector". Confirmed
// against real data: BTC's raw list starts with "Smart Contract Platform"
// (misleading for Bitcoin) and includes junk like "FTX Holdings",
// "GMCI 30 Index", "Coinbase 50 Index" — this pattern strips all of that.
const NOISY_CATEGORY_PATTERN = /portfolio|index|holdings|ecosystem|fund/i;

// Server-side proxy so the CoinGecko fetch (and any future API key) stays
// off the client, matching the existing /api/refresh-crypto-prices
// pattern (D22). Called once, right after a crypto search result is
// picked, to auto-fill Sector — Country stays hardcoded "Global"
// client-side since crypto has no registered country, and Currency stays
// the form's THB default, so neither needs data from here.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  let body: CoinGeckoCoin;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`,
      { signal: AbortSignal.timeout(8_000) }
    );
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

  const sector =
    (body.categories ?? []).find((c): c is string => !!c && !NOISY_CATEGORY_PATTERN.test(c)) ??
    null;

  return NextResponse.json({ sector });
}
