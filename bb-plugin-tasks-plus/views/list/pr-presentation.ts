import type { TaskWorkStatus } from "../../shared/contract.js";
export type WorkPr = TaskWorkStatus["pullRequests"]["items"][number];
export const LIFECYCLE_LABELS: Record<WorkPr["state"], string> = {
  open: "Open",
  draft: "Draft",
  merged: "Merged",
  closed: "Closed",
  unknown: "Lifecycle unavailable",
};
const CONDITIONS = [
  { key: "conflicts", label: "Conflicts", rank: 0 },
  { key: "checks_failed", label: "Checks failing", rank: 1 },
  { key: "changes_requested", label: "Changes requested", rank: 2 },
  { key: "blocked", label: "Other merge blockers", rank: 3 },
  { key: "checks_cancelled", label: "Checks cancelled", rank: 3 },
  { key: "queue_failed", label: "Queue failed", rank: 3 },
  { key: "checks_running", label: "Checks running", rank: 4 },
  { key: "review_required", label: "Awaiting review", rank: 5 },
  { key: "unresolved_threads", label: "Unresolved comments", rank: 6 },
  { key: "behind", label: "Behind", rank: 7 },
  { key: "queue_queued", label: "Queued", rank: 7.5 },
  { key: "queue_awaiting_checks", label: "Queued, awaiting checks", rank: 7.5 },
  { key: "queue_merging", label: "Queued, merging", rank: 7.5 },
] as const;
export function currentConditions(pr: WorkPr): string[] {
  if (
    !pr.rich ||
    !["available", "incomplete"].includes(pr.details) ||
    !["open", "draft"].includes(pr.state)
  )
    return [];
  if (
    pr.state === "open" &&
    pr.details === "available" &&
    pr.rich.readiness === "ready" &&
    pr.rich.conditions.length === 0 &&
    !pr.rich.queue &&
    pr.rich.checks.failed === 0 &&
    pr.rich.checks.running === 0 &&
    pr.rich.checks.cancelled === 0 &&
    pr.rich.checks.failedNames.length === 0 &&
    pr.rich.reviewers.pending === 0 &&
    pr.rich.reviewers.changesRequested === 0 &&
    pr.rich.reviewers.pendingNames.length === 0
  )
    return ["Ready to merge"];
  return CONDITIONS.filter(({ key }) => pr.rich!.conditions.includes(key)).map(
    ({ label }) => label,
  );
}
export function qualityLabel(pr: WorkPr): string {
  return {
    available: "Details",
    incomplete: "Details incomplete",
    stale: "Details stale",
    unavailable: "Details unavailable",
  }[pr.details];
}
export function primaryBucket(pr: WorkPr) {
  const condition = currentConditions(pr)[0];
  const rank = condition
    ? condition === "Ready to merge"
      ? 8
      : CONDITIONS.find((c) => c.label === condition)!.rank
    : pr.state === "unknown"
      ? 9
      : pr.state === "open"
        ? 10
        : pr.state === "draft"
          ? 11
          : pr.state === "merged"
            ? 12
            : 13;
  const label = condition
    ? pr.state === "draft"
      ? `Draft, ${condition.toLowerCase()}`
      : condition
    : LIFECYCLE_LABELS[pr.state];
  return {
    key: `${pr.state}:${condition ?? "lifecycle"}`,
    label,
    rank,
    problem: [
      "Conflicts",
      "Checks failing",
      "Changes requested",
      "Other merge blockers",
      "Checks cancelled",
      "Queue failed",
    ].includes(condition ?? ""),
  };
}
export function aggregatePrs(items: readonly WorkPr[]) {
  const buckets = new Map<string, ReturnType<typeof primaryBucket> & { count: number }>();
  for (const pr of items) {
    const bucket = primaryBucket(pr);
    const previous = buckets.get(bucket.key);
    buckets.set(bucket.key, { ...bucket, count: (previous?.count ?? 0) + 1 });
  }
  return [...buckets.values()].sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
}
const REASONS: Record<NonNullable<WorkPr["detailsReason"]>, string> = {
  integration_absent: "GitHub Insight is not installed.",
  integration_disabled: "GitHub Insight is disabled.",
  integration_error: "GitHub Insight availability could not be confirmed.",
  metadata_absent: "No rich summary was reported.",
  metadata_error: "A summary could not be read.",
  invalid_metadata: "A summary contains invalid fields or observation time.",
  unsupported_version: "The summary version is unsupported.",
  unsupported_conditions: "Some reported conditions are unsupported.",
  unsupported_queue: "Some merge queue evidence cannot be interpreted.",
  missing_prerequisites: "Merge readiness prerequisites were not explicitly reported.",
  contradictory_evidence: "Reported counts or lifecycle prerequisites contradict other evidence.",
  refresh_error: "The producer reported a refresh error.",
  conflict: "Observations conflict without decisive newer evidence.",
  identity_mismatch: "The summary refers to a different current PR.",
  lifecycle_mismatch: "The summary does not match the current lifecycle.",
  association_unavailable: "The current PR association could not be confirmed.",
  expired: "Open/draft details are older than one hour.",
  refresh_failed: "The latest overview refresh failed.",
  budget_exceeded: "The bounded refresh could not read every summary.",
};
export function qualityExplanation(pr: WorkPr): string {
  return pr.detailsReason
    ? REASONS[pr.detailsReason]
    : pr.details === "unavailable"
      ? "Only basic PR lifecycle is shown."
      : "Merge readiness requires fresh validated blocker and queue evidence.";
}
