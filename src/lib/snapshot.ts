import { supabase } from "@/lib/supabase";

// Single shared implementation of "write today's portfolio_snapshots row,
// overwriting whatever's already there" (originally D37's manual-button
// upsert shape). Called from Holdings (`holdings/page.tsx`) both right
// after a fresh holdings load and on a periodic interval while the page
// stays open (D151) — one place that defines what a snapshot's numbers
// mean, regardless of what triggered the write. Self-contained (fetches
// its own data by portfolio_id) rather than taking already-loaded
// holdings as a parameter, so any future caller can use it without first
// loading holdings state itself. See DECISIONS.md.
export async function upsertPortfolioSnapshot(
  portfolioId: string
): Promise<{ error: string | null }> {
  const { data: holdingsData, error: holdingsError } = await supabase
    .from("holdings_with_returns")
    .select("asset_id, market_value, cost_basis")
    .eq("portfolio_id", portfolioId);
  if (holdingsError) return { error: holdingsError.message };

  const holdings = holdingsData ?? [];
  const totalValue = holdings.reduce((sum, h) => sum + Number(h.market_value ?? 0), 0);
  const totalCost = holdings.reduce((sum, h) => sum + Number(h.cost_basis ?? 0), 0);

  // cash_value needs asset_type, which isn't on holdings_with_returns
  // (D35 precedent) — a separate lookup, only for the assets actually held.
  let cashValue = 0;
  const assetIds = holdings.map((h) => h.asset_id);
  if (assetIds.length > 0) {
    const { data: assetsData } = await supabase
      .from("assets")
      .select("id, asset_type")
      .in("id", assetIds);
    const cashAssetIds = new Set(
      (assetsData ?? []).filter((a) => a.asset_type === "cash").map((a) => a.id)
    );
    cashValue = holdings
      .filter((h) => cashAssetIds.has(h.asset_id))
      .reduce((sum, h) => sum + Number(h.market_value ?? 0), 0);
  }

  const payload = {
    portfolio_id: portfolioId,
    snapshot_date: new Date().toISOString().slice(0, 10),
    total_value: totalValue,
    total_cost: totalCost,
    cash_value: cashValue,
  };

  const { error } = await supabase
    .from("portfolio_snapshots")
    .upsert(payload, { onConflict: "portfolio_id,snapshot_date" });
  return { error: error?.message ?? null };
}
