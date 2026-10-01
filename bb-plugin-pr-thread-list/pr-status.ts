import type { PluginSidebarPullRequest } from "@get-bb/plugin-sdk/app";
import type { BlockerCode, PrInsight } from "./pr-insight";

type Tone = "neutral" | "waiting" | "problem" | "ready" | "merged";
type Reason = "open" | "draft" | "merged" | "closed" | "checks_running" | "checks_failed" | "review" | "changes_requested"
  | "unresolved_threads" | "conflicts" | "behind" | "blocked" | "ready";

export interface PrMark {
  icon: string;
  count: number | null;
  spin: boolean;
  tone: Tone;
  title: string;
}

export type ChecksState = "passed" | "running" | "failed" | "unknown";

export interface PrView {
  lead: string;
  checks: ChecksState;
  leadTitle: string;
  word: string | null;
  tone: Tone;
  marks: PrMark[];
  label: string;
}

const REASONS: Record<Reason, { status: string; tone: Tone; lead?: string; mark?: string; word?: string; spin?: true }> = {
  open: { status: "open", tone: "neutral" },
  draft: { status: "draft", tone: "neutral", lead: "GitPullRequestDraft" },
  merged: { status: "merged", tone: "merged", lead: "GitMerge", word: "Merged" },
  closed: { status: "closed", tone: "neutral", lead: "GitPullRequestClosed" },
  checks_running: { status: "checks running", tone: "waiting", mark: "Spinner", spin: true },
  checks_failed: { status: "checks failed", tone: "problem", mark: "CircleX", word: "Checks failed" },
  review: { status: "awaiting review", tone: "waiting", mark: "Eye" },
  changes_requested: { status: "changes requested", tone: "problem", mark: "Edit", word: "Changes requested" },
  unresolved_threads: { status: "unresolved comments", tone: "waiting", mark: "MessageSquare" },
  conflicts: { status: "merge conflicts", tone: "problem", mark: "AlertCircle", word: "Conflicts" },
  behind: { status: "branch out of date", tone: "waiting" },
  blocked: { status: "merge blocked", tone: "problem", mark: "Lock", word: "Blocked" },
  ready: { status: "ready to merge", tone: "ready", word: "Ready" },
};

const ATTENTION: Partial<Record<PluginSidebarPullRequest["attention"], Reason>> = {
  checks_pending: "checks_running", checks_failed: "checks_failed", review_requested: "review",
  changes_requested: "changes_requested", conflicts: "conflicts", ready_to_merge: "ready",
};

/** A summary can be an hour old, so it may only name reasons BB folds into "blocked", never contradict BB. */
const BLOCKED_BECAUSE: Partial<Record<BlockerCode, Reason>> = {
  checks_running: "checks_running", review_required: "review", unresolved_threads: "unresolved_threads", behind: "behind",
};
const BLOCKED_ORDER: Reason[] = ["checks_running", "review", "unresolved_threads", "behind"];

function reasonsFor(pr: PluginSidebarPullRequest, insight: PrInsight | null): Reason[] {
  if (pr.state !== "open") return [pr.state];
  if (pr.attention !== "blocked") return [ATTENTION[pr.attention] ?? "open"];
  const named = new Set(insight?.blockers.map((code) => BLOCKED_BECAUSE[code]));
  const reasons = BLOCKED_ORDER.filter((reason) => named.has(reason));
  return reasons.length ? reasons : ["blocked"];
}

const plural = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;
const names = (prefix: string, list: string[]) => list.length ? [`${prefix}: ${list.join(", ")}`] : [];
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

type Counted = { count: number; text: string; details: string[] };

const COUNTS: Partial<Record<Reason, (insight: PrInsight) => Counted>> = {
  checks_failed: (insight) => ({ count: insight.failedChecks,
    text: plural(insight.failedChecks, "failed check", "failed checks"), details: names("Failed", insight.failedNames) }),
  checks_running: (insight) => ({ count: insight.runningChecks,
    text: plural(insight.runningChecks, "check running", "checks running"), details: [] }),
  review: (insight) => ({ count: insight.pendingReviews,
    text: plural(insight.pendingReviews, "review pending", "reviews pending"), details: names("Waiting on", insight.pendingNames) }),
};

function counted(reason: Reason, insight: PrInsight | null): Counted | null {
  const found = insight ? COUNTS[reason]?.(insight) : undefined;
  return found && found.count > 0 ? found : null;
}

const CHECKS_TEXT: Record<ChecksState, string | null> = {
  passed: "All checks passed", running: "Checks running", failed: "Checks failed", unknown: null,
};

function checksState(pr: PluginSidebarPullRequest, insight: PrInsight | null): ChecksState {
  if (pr.state !== "open") return "unknown";
  if (pr.attention === "ready_to_merge") return "passed";
  if (pr.attention === "checks_failed") return "failed";
  if (pr.attention === "checks_pending") return "running";
  if (!insight) return "unknown";
  if (insight.failedChecks > 0) return "failed";
  if (insight.runningChecks > 0) return "running";
  return insight.passedChecks > 0 ? "passed" : "unknown";
}

export function presentPullRequest(pr: PluginSidebarPullRequest, insight: PrInsight | null): PrView {
  const reasons = reasonsFor(pr, insight);
  const first = REASONS[reasons[0]!];
  const parts = reasons.map((reason) => {
    const { status, tone, mark, spin = false } = REASONS[reason];
    const count = counted(reason, insight);
    const text = count?.text ?? status;
    return { text, mark: mark ? { icon: mark, count: count?.count ?? null, spin, tone,
      title: [sentence(text), ...count?.details ?? []].join("\n") } : null };
  });
  const status = `PR #${pr.number}: ${parts.map((part) => part.text).join(", ")}`;
  const checks = checksState(pr, insight);
  return {
    lead: first.lead ?? "GitPullRequest", checks,
    leadTitle: [`PR #${pr.number}: ${pr.title}`, CHECKS_TEXT[checks]].filter(Boolean).join("\n"),
    word: first.word ?? null, tone: first.tone,
    marks: parts.flatMap((part) => part.mark ? [part.mark] : []),
    label: status,
  };
}
