export const DEFAULT_DRIFT_THRESHOLD = 5;

export interface DriftHolding {
  asset_id: string;
  market_value: number;
}

export interface DriftTarget {
  asset_id: string;
  target_pct: number;
  drift_threshold: number;
}

export interface DriftRow {
  asset_id: string;
  currentPct: number;
  targetPct: number;
  driftThreshold: number;
  drift: number;
  outOfThreshold: boolean;
}

// Same formula the Rebalancing page has always used — extracted here so
// both it and the drift-alert badges/banners share one implementation
// instead of two copies that could quietly drift apart (no pun intended).
// An asset held with no target row at all is treated as an implicit
// target of 0% at `DEFAULT_DRIFT_THRESHOLD` — matching Rebalancing's
// existing behavior of surfacing "you hold this but never set a target
// for it" as an actionable row, not silently ignoring it.
export function computeDrift(holdings: DriftHolding[], targets: DriftTarget[]): DriftRow[] {
  const totalMarketValue = holdings.reduce((sum, h) => sum + h.market_value, 0);
  const holdingsMap = new Map(holdings.map((h) => [h.asset_id, h]));
  const targetsMap = new Map(targets.map((t) => [t.asset_id, t]));
  const assetIds = new Set([...holdingsMap.keys(), ...targetsMap.keys()]);

  return Array.from(assetIds).map((assetId) => {
    const h = holdingsMap.get(assetId);
    const t = targetsMap.get(assetId);
    const currentPct =
      totalMarketValue !== 0 ? ((h?.market_value ?? 0) / totalMarketValue) * 100 : 0;
    const targetPct = t?.target_pct ?? 0;
    const driftThreshold = t?.drift_threshold ?? DEFAULT_DRIFT_THRESHOLD;
    const drift = currentPct - targetPct;
    return {
      asset_id: assetId,
      currentPct,
      targetPct,
      driftThreshold,
      drift,
      outOfThreshold: Math.abs(drift) > driftThreshold,
    };
  });
}

// Returns null when the portfolio has no targets set at all (nothing to
// alert on — not an error, just "not configured yet"), otherwise the
// count of assets currently outside their drift threshold (may be 0).
export function countDriftedAssets(
  holdings: DriftHolding[],
  targets: DriftTarget[]
): number | null {
  if (targets.length === 0) return null;
  return computeDrift(holdings, targets).filter((r) => r.outOfThreshold).length;
}
