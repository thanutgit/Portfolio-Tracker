import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface CoinGeckoSearchCoin {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank: number | null;
}

// Server-side proxy for TransactionModal's "Search asset" crypto matches —
// mirrors /api/finnhub-search's shape and role for stocks. No API key
// needed (same keyless CoinGecko host /api/refresh-crypto-prices already
// calls), but kept server-side anyway for consistency and to avoid
// CORS/rate-limit issues tied to the browser's own IP (D22).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ results: [] });
  }

  let body: { coins?: CoinGeckoSearchCoin[] };
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`,
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

  // CoinGecko's search can return dozens of low-relevance matches (e.g.
  // "sol" also matches "Solstice", "Solayer", etc.) — sorted by
  // market_cap_rank (nulls last, since an unranked coin is obscure) so
  // the real, liquid coin surfaces first, then capped to 10 like the
  // Finnhub search route.
  const results = (body.coins ?? [])
    .slice()
    .sort((a, b) => (a.market_cap_rank ?? Infinity) - (b.market_cap_rank ?? Infinity))
    .slice(0, 10)
    .map((c) => ({ id: c.id, symbol: c.symbol.toUpperCase(), name: c.name }));

  return NextResponse.json({ results });
}
