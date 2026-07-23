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
// the "new asset" form. Always returns 200 with whatever Finnhub actually
// gave us, defaulting every field to null when it didn't — never a 4xx/5xx
// for anything Finnhub-side. Finnhub returns `{}` (200 OK) for plenty of
// real, valid symbols with no profile data (ETFs on the free tier), but a
// symbol can also make Finnhub respond with a genuine non-2xx status — e.g.
// a secondary/regional cross-listing like "SCHD.MX" (Mexico's BMV listing
// of the real, US-listed SCHD), which /search can surface but /profile2
// apparently won't return fundamentals for on the free tier. Both cases
// mean the exact same thing to this route's caller — "no profile data for
// this symbol" — so both get the exact same graceful response instead of
// one silently degrading and the other surfacing as a 502. See
// GOTCHAS.md and DECISIONS.md.
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

  // Starts empty and only ever gets overwritten by a successful, parseable
  // 2xx response below — every other outcome (network error, timeout, a
  // non-2xx status, a 2xx with a body that fails to parse as JSON) just
  // leaves it at `{}`, falling through to the same all-null response.
  let body: FinnhubProfile = {};
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (res.ok) {
      body = await res.json();
    }
  } catch {
    // Quiet — same graceful-degradation philosophy as the rest of this
    // route; the caller doesn't distinguish why profile data is
    // unavailable, only that it is.
  }

  return NextResponse.json({
    sector: body.finnhubIndustry ?? null,
    country: body.country ?? null,
    currency: body.currency ?? null,
    market: body.exchange ?? null,
  });
}
