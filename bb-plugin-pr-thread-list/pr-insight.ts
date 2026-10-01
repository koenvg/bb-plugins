export const INSIGHT_PLUGIN_ID = "github-insight";
export const INSIGHT_METADATA_KEY = "prSummary";
const MAX_AGE_MS = 60 * 60_000;

const BLOCKERS = ["conflicts", "checks_failed", "changes_requested", "behind", "review_required",
  "unresolved_threads", "checks_running", "draft", "blocked"] as const;
export type BlockerCode = typeof BLOCKERS[number];

export interface PrInsight {
  failedChecks: number;
  passedChecks: number;
  runningChecks: number;
  pendingReviews: number;
  blockers: BlockerCode[];
  failedNames: string[];
  pendingNames: string[];
}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const count = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const isBlocker = (value: unknown): value is BlockerCode => BLOCKERS.includes(value as BlockerCode);

export function readInsight(value: unknown, prNumber: number, now: number): PrInsight | null {
  const summary = record(value);
  const pr = record(summary?.pr), checks = record(summary?.checks), reviewers = record(summary?.reviewers);
  if (summary?.version !== 1 || !pr || !checks || !reviewers || pr.number !== prNumber) return null;
  const updatedAt = typeof summary.updatedAt === "string" ? Date.parse(summary.updatedAt) : NaN;
  if (!(now - updatedAt <= MAX_AGE_MS)) return null;
  const failedChecks = count(checks.failed), passedChecks = count(checks.passed), runningChecks = count(checks.running), pendingReviews = count(reviewers.pending);
  if (failedChecks === null || passedChecks === null || runningChecks === null || pendingReviews === null) return null;
  const blockers = Array.isArray(summary.blockers) ? summary.blockers : [];
  return {
    failedChecks, passedChecks, runningChecks, pendingReviews,
    blockers: blockers.filter(isBlocker),
    failedNames: strings(checks.failedNames), pendingNames: strings(reviewers.pendingNames),
  };
}
