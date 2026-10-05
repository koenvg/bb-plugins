import type { CalendarSnapshot } from "./calendar-contract.js";
import { comparisonExplanation, type ComparisonMetric } from "./calendar-comparison.js";
import { MoneyValues, capturedEstimate, pricedAverage } from "./calendar-money-view.js";
import { shiftDate } from "./calendar-time.js";
type Summary = CalendarSnapshot["summary"];
function tokenSubtotal(summary: Summary, state: string): string {
  return summary.activeEntities || state === "observed-inactivity"
    ? summary.totalTokens.toLocaleString("en-US")
    : "Unknown, no accepted records";
}
function activeValue(summary: Summary, state: string): string {
  return summary.activeEntities || state === "observed-inactivity"
    ? String(summary.activeEntities)
    : "Unknown, no accepted records";
}
function selectedValue(summary: Summary, state: string, metric: ComparisonMetric): string {
  if (metric === "cost")
    return summary.money.capturedCost === null
      ? "Unavailable"
      : capturedEstimate(summary.money.capturedCost);
  if (metric === "cost-per-entity") return pricedAverage(summary.money);
  if (metric === "per-entity")
    return summary.activeEntities
      ? `${summary.totalTokens} / ${summary.activeEntities} = ${(summary.totalTokens / summary.activeEntities).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
      : "Unavailable, no active entities";
  return metric === "tokens" ? tokenSubtotal(summary, state) : activeValue(summary, state);
}
export function CalendarComparison({
  view,
  metric,
  blocked,
}: {
  view: CalendarSnapshot;
  metric: ComparisonMetric;
  blocked: boolean;
}) {
  const comparison = view.comparison;
  if (!comparison) return null;
  const prior = comparison.prior,
    entities = view.query.group === "workspace" ? "workspaces" : "verified threads";
  const period = (name: string, summary: Summary, state: string) => (
    <div className="min-w-0 rounded-md border border-border p-2 [overflow-wrap:anywhere]">
      <h4 className="font-semibold">{name}</h4>
      <p>Selected metric: {selectedValue(summary, state, metric)}.</p>
      <p>Recorded token subtotal: {tokenSubtotal(summary, state)}.</p>
      <p>
        Active {entities}: {activeValue(summary, state)}.
      </p>
      <p>
        Token denominator: {summary.activeEntities} distinct {entities} with accepted records.
      </p>
      <MoneyValues money={summary.money} entities={entities} compact />
      <p className="mt-1 text-muted-foreground">
        Collection:{" "}
        {state === "observed-inactivity"
          ? "Observed inactivity"
          : state === "unknown"
            ? "Unknown"
            : "Partial, complete collection unproved"}
        . Attribution exclusions: {summary.excludedTokens} recorded tokens.
      </p>
    </div>
  );
  return (
    <section
      aria-label="Previous 30-date comparison"
      className="mt-4 min-w-0 rounded-md border border-border bg-muted/20 p-3 [overflow-wrap:anywhere]"
      aria-live="polite"
    >
      <h3 className="font-semibold">Previous 30 dates</h3>
      <p>
        Prior: {comparison.query.startDate} to {shiftDate(comparison.query.startDate, 29)} ·{" "}
        {comparison.query.timezone} · Same selected host, group and entity scope.
      </p>
      <p className="mt-2">
        Percentage unavailable.{" "}
        {blocked
          ? "Report is stale or refreshing. No percentage is calculated."
          : comparisonExplanation[comparison.reasons[metric]]}
      </p>
      <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
        {period("Current known subtotals", view.summary, view.state)}
        {prior.state === "unavailable" ? (
          <p>
            Prior known subtotals unavailable:{" "}
            {prior.reason === "range-unavailable"
              ? "Outside retained bounds"
              : "Prior history cannot be read safely"}
            .
          </p>
        ) : (
          period("Prior known subtotals", prior.summary, prior.state)
        )}
      </div>
      {prior.state !== "unavailable" && (
        <details className="mt-2 text-muted-foreground">
          <summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring">
            Prior collection and attribution limits
          </summary>
          <p>
            Capture: {prior.capture}. Identity: {prior.identity}; resolution pending:{" "}
            {prior.identityPending ? "yes" : "no"}. Pauses: {prior.coverage.pauses}; omissions:{" "}
            {prior.coverage.omissions}; uncertainty: {String(prior.coverage.uncertain)}; backlog:{" "}
            {String(prior.coverage.backlog)}; recovery gap: {String(prior.coverage.recoveryGap)};
            evidence truncated: {String(prior.coverage.truncated)}. Writer activity, settled
            ingestion/import and identity do not certify complete active collection. Pricing is
            separate. These are accepted recorded subtotals, not complete account totals or
            subscription charges.
          </p>
        </details>
      )}
    </section>
  );
}
