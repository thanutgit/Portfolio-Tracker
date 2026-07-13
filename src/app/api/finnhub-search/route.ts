import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface FinnhubSearchResult {
  symbol: string;
  description: string;
  type: string;
}

// Server-side proxy so FINNHUB_API_KEY never reaches the browser. Called
// on every debounced keystroke from TransactionModal's "Search stock"
// mode, so this stays a lightweight passthrough — no DB access here.
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

  let body: { result?: FinnhubSearchResult[] };
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${apiKey}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) {
      const status = res.status === 429 ? 429 : 502;
      return NextResponse.json(
        {
          error:
            res.status === 429
              ? "Finnhub rate limit hit — try again in a bit."
              : `Finnhub API returned ${res.status}.`,
        },
        { status }
      );
    }
    body = await res.json();
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach Finnhub (network error or timeout)." },
      { status: 502 }
    );
  }

  // Finnhub's search also returns ETPs, mutual funds, etc. — filtered down
  // to "Common Stock" since this feature is scoped to foreign stocks
  // specifically (asset_type is hardcoded to 'stock' at creation time).
  const results = (body.result ?? [])
    .filter((r) => r.type === "Common Stock")
    .slice(0, 10)
    .map((r) => ({ symbol: r.symbol, description: r.description }));

  return NextResponse.json({ results });
}
