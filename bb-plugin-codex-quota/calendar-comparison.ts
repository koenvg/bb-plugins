// Conservative capability: no existing evidence certifies complete active collection.
export const comparisonMetrics = ["tokens", "entities", "per-entity", "cost", "cost-per-entity"] as const;
export type ComparisonMetric = typeof comparisonMetrics[number];
export const comparisonReasonCodes = ["prior-unavailable", "attribution-excluded", "collection-unproved", "pricing-unavailable", "denominator-unavailable", "zero-baseline"] as const;
export type ComparisonReason = typeof comparisonReasonCodes[number];
type Range = { state: string; summary: { excludedTokens: number } };
export function comparisonReasons(current: Range, prior: Range | { state: "unavailable" }): Record<ComparisonMetric, ComparisonReason> {
  const common: ComparisonReason = prior.state === "unavailable" ? "prior-unavailable"
    : current.summary.excludedTokens || ("summary" in prior && prior.summary.excludedTokens) ? "attribution-excluded" : "collection-unproved";
  // Only genuine readCoverage.zero dates can yield observed-inactivity. Pricing is independent.
  if (current.state === "observed-inactivity" && prior.state === "observed-inactivity") return {
    tokens: "zero-baseline", entities: "zero-baseline", "per-entity": "denominator-unavailable",
    cost: "pricing-unavailable", "cost-per-entity": "pricing-unavailable",
  };
  return Object.fromEntries(comparisonMetrics.map(metric => [metric, common])) as Record<ComparisonMetric, ComparisonReason>;
}
export const comparisonExplanation: Record<ComparisonReason, string> = {
  "prior-unavailable": "The prior range is unavailable. Current known subtotals remain separate.",
  "attribution-excluded": "Attribution exclusions prevent a complete same-scope comparison. Known accepted subtotals remain separate.",
  "collection-unproved": "Complete collection is unproved for one or both ranges. Active-period percentages are unavailable under the current evidence contract.",
  "pricing-unavailable": "No eligible captured price is available. Missing prices do not mean zero cost.",
  "denominator-unavailable": "The active-entity denominator is zero. A per-entity comparison is unavailable.",
  "zero-baseline": "The prior baseline is zero. No percentage is calculated.",
};
