import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface FinnhubProfile {
  country?: string;
  currency?: string;
  exchange?: string;
  finnhubIndustry?: string;
}

// Called once, right after the user picks a result from finnhub-search —
// not on every keystroke — to auto-fill sector/country/currency/market in
// the "new asset" form. Finnhub returns `{}` (200 OK) for a symbol with no
// profile data, which isn't an error — the caller just falls back to
// leaving those fields blank for manual entry.
export async function GET(request: Request) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "FINNHUB_API_KEY is not configured." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.trim();
  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol." }, { status: 400 });
  }

  let body: FinnhubProfile;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`,
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

  return NextResponse.json({
    sector: body.finnhubIndustry ?? null,
    country: body.country ?? null,
    currency: body.currency ?? null,
    market: body.exchange ?? null,
  });
}
