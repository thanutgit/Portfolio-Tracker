import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Server-side proxy to Frankfurter (frankfurter.dev) — free, no API key,
// ECB reference rates back to 1999. Kept server-side (never called
// directly from the client) to match the existing Finnhub routes'
// pattern (see src/app/api/finnhub-search/route.ts) and leave room for
// caching/rate-limiting later without touching every call site, even
// though Frankfurter itself needs no secret. Called via src/lib/fx.ts.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from")?.trim().toUpperCase();
  const to = searchParams.get("to")?.trim().toUpperCase();
  const date = searchParams.get("date")?.trim();

  if (!from || !to || !date) {
    return NextResponse.json({ error: "from, to, and date are all required." }, { status: 400 });
  }

  // Mirrors the same-currency short-circuit in src/lib/fx.ts — kept here
  // too since this route could be called directly.
  if (from === to) {
    return NextResponse.json({ rate: 1 });
  }

  let res: Response;
  try {
    res = await fetch(
      `https://api.frankfurter.dev/v1/${encodeURIComponent(date)}?base=${from}&symbols=${to}`,
      { signal: AbortSignal.timeout(8_000) }
    );
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach Frankfurter (network error or timeout)." },
      { status: 502 }
    );
  }

  if (!res.ok) {
    return NextResponse.json({ error: `Frankfurter API returned ${res.status}.` }, { status: 502 });
  }

  const body: { rates?: Record<string, number> } = await res.json();
  const rate = body.rates?.[to];
  if (typeof rate !== "number") {
    return NextResponse.json(
      { error: `No rate found for ${from} -> ${to} on ${date}.` },
      { status: 502 }
    );
  }

  return NextResponse.json({ rate });
}
