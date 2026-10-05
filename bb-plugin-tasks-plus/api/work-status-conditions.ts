import type { TaskWorkStatus } from "../shared/contract.js";
import { normalizeQueue } from "./work-status-queue.js";

type Rich = NonNullable<TaskWorkStatus["pullRequests"]["items"][number]["rich"]>;
type Reason = TaskWorkStatus["pullRequests"]["items"][number]["detailsReason"];
const KNOWN = new Set([
  "conflicts",
  "checks_failed",
  "changes_requested",
  "behind",
  "review_required",
  "unresolved_threads",
  "checks_running",
  "draft",
  "blocked",
]);

/** Producer counts and additive decisions must agree before an empty blocker list is useful. */
export function normalizeConditions(
  fields: Record<string, unknown>,
  value: {
    pr: { state: string };
    checks: Rich["checks"];
    reviewers: Rich["reviewers"];
    blockers: string[];
  },
): Pick<Rich, "conditions" | "readiness" | "mergeObservations" | "queue"> & {
  reason?: Reason;
} {
  const conditions = new Set(value.blockers);
  const observations: string[] = [];
  let reason: Reason = value.blockers.some((code) => !KNOWN.has(code))
    ? "unsupported_conditions"
    : undefined;
  const add = (applies: boolean, code: string) => {
    if (applies) conditions.add(code);
  };
  add(value.checks.failed > 0, "checks_failed");
  add(value.checks.running > 0, "checks_running");
  add(value.checks.cancelled > 0, "checks_cancelled");
  add(value.reviewers.pending > 0, "review_required");
  add(value.reviewers.changesRequested > 0, "changes_requested");
  if (
    value.checks.failedNames.length > value.checks.failed ||
    value.reviewers.pendingNames.length > value.reviewers.pending
  )
    reason = "contradictory_evidence";

  const decisions: Record<string, readonly unknown[]> = {
    mergeable: ["MERGEABLE", "CONFLICTING"],
    mergeStateStatus: ["BEHIND", "BLOCKED", "CLEAN", "DIRTY", "DRAFT", "HAS_HOOKS", "UNSTABLE"],
    reviewDecision: [null, "APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED"],
  };
  for (const [field, known] of Object.entries(decisions)) {
    if (!(field in fields)) continue;
    const decision = fields[field];
    observations.push(`${field}: ${JSON.stringify(decision)}`);
    if (!known.includes(decision)) reason = "unsupported_conditions";
  }
  add(fields.mergeable === "CONFLICTING" || fields.mergeStateStatus === "DIRTY", "conflicts");
  add(fields.reviewDecision === "CHANGES_REQUESTED", "changes_requested");
  add(fields.reviewDecision === "REVIEW_REQUIRED", "review_required");
  add(fields.mergeStateStatus === "BEHIND", "behind");
  add(fields.mergeStateStatus === "BLOCKED" || fields.mergeStateStatus === "UNSTABLE", "blocked");
  add(fields.mergeStateStatus === "DRAFT", "draft");
  if ("unresolvedThreads" in fields) {
    const count = fields.unresolvedThreads;
    observations.push(`unresolvedThreads: ${JSON.stringify(count)}`);
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)
      reason = "unsupported_conditions";
    else add(count > 0, "unresolved_threads");
  }
  if (value.pr.state === "open" && conditions.has("draft")) reason = "contradictory_evidence";
  const { queue, reason: queueReason } = normalizeQueue(fields.mergeQueue);
  reason ??= queueReason;
  add(queue?.state === "failed", "queue_failed");
  if (queue && queue.state !== "unknown" && queue.state !== "failed")
    conditions.add(`queue_${queue.state}`);
  return {
    conditions: [...conditions].sort(),
    readiness: reason
      ? "unknown"
      : value.pr.state === "open" && !queue && conditions.size === 0
        ? "ready"
        : "blocked",
    ...(queue ? { queue } : {}),
    ...(observations.length ? { mergeObservations: observations } : {}),
    ...(reason ? { reason } : {}),
  };
}
