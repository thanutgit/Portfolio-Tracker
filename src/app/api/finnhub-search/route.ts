import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface FinnhubSearchResult {
  symbol: string;
  description: string;
  type: string;
}

interface FinnhubQuote {
  c?: number; // current price; 0/missing means "no such symbol"
}

// Server-side proxy so FINNHUB_API_KEY never reaches the browser. Called
// on every debounced keystroke from TransactionModal's "Search stock"
// mode, so this stays a lightweight passthrough — no DB access here.
//
// /search alone misses some real tickers (Finnhub's search index doesn't
// always match a symbol the user already knows exactly). When /search
// comes back empty, fall back to a direct /quote lookup on the raw input —
// a live price (c > 0) confirms it's a real, tradeable symbol even though
// search didn't find it. The /quote call is fired in parallel with
// /search (not after it fails) whenever the input is ticker-shaped, so a
// real ticker doesn't pay for two sequential round-trips.
export async function GET(request: Request) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "FINNHUB_API_KEY is not configured." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ results: [] });
  }

  // Only a bare-ticker-shaped query (no spaces, short) is worth a /quote
  // lookup — a multi-word company name query could never be a real symbol.
  const looksLikeTicker = !/\s/.test(q) && q.length <= 5;

  const searchPromise = fetch(
    `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${apiKey}`,
    { signal: AbortSignal.timeout(8_000) }
  );
  // Never allowed to reject — a failed fallback should just mean "no
  // fallback result," not blow up the request alongside /search.
  const quotePromise = looksLikeTicker
    ? fetch(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(q.toUpperCase())}&token=${apiKey}`,
        { signal: AbortSignal.timeout(8_000) }
      ).catch(() => null)
    : Promise.resolve(null);

  let searchRes: Response;
  try {
    searchRes = await searchPromise;
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach Finnhub (network error or timeout)." },
      { status: 502 }
    );
  }
  if (!searchRes.ok) {
    const status = searchRes.status === 429 ? 429 : 502;
    return NextResponse.json(
      {
        error:
          searchRes.status === 429
            ? "Finnhub rate limit hit — try again in a bit."
            : `Finnhub API returned ${searchRes.status}.`,
      },
      { status }
    );
  }
  const searchBody: { result?: FinnhubSearchResult[] } = await searchRes.json();

  // Finnhub's search also returns ETPs, mutual funds, etc. — filtered down
  // to "Common Stock" since this feature is scoped to foreign stocks
  // specifically (asset_type is hardcoded to 'stock' at creation time).
  const results = (searchBody.result ?? [])
    .filter((r) => r.type === "Common Stock")
    .slice(0, 10)
    .map((r) => ({ symbol: r.symbol, description: r.description }));

  if (results.length > 0) {
    return NextResponse.json({ results });
  }

  // /search found nothing — see if the /quote fallback (already in flight)
  // confirms this is a real symbol Finnhub just didn't index under this
  // query text.
  const quoteRes = await quotePromise;
  if (quoteRes?.ok) {
    const quote: FinnhubQuote = await quoteRes.json();
    if (quote.c && quote.c > 0) {
      const symbol = q.toUpperCase();
      return NextResponse.json({
        results: [{ symbol, description: "— verified via direct lookup", verified: true }],
      });
    }
  }

  return NextResponse.json({ results: [] });
}
