import { countOf, type Blocker } from "./blockers";
import type { RunnableMergeAction } from "./merge-action";
import type { PrInsight } from "./overview";

const CHECK_COUNT_CODES: ReadonlySet<Blocker["code"]> = new Set([
  "checks_failed",
  "checks_running",
]);

export function bannerParts(insight: PrInsight): string[] {
  const { pr, blockers, reviewers } = insight;
  if (pr.state === "merged" || pr.state === "closed" || blockers.length === 0) return [];

  const textOf = (code: Blocker["code"]) => blockers.find((blocker) => blocker.code === code)?.text;
  const pendingReviews = reviewers.filter((reviewer) => reviewer.state === "pending").length;
  const topOther = blockers.find(
    (blocker) =>
      !CHECK_COUNT_CODES.has(blocker.code) &&
      !(blocker.code === "review_required" && pendingReviews > 0),
  );

  return [
    textOf("checks_failed"),
    textOf("checks_running"),
    pendingReviews > 0 ? `${countOf(pendingReviews, "review")} pending` : undefined,
    topOther?.text,
  ].filter((part): part is string => part !== undefined);
}

export type BannerState =
  | { kind: "hidden" }
  | { kind: "merged" }
  | { kind: "blockers"; parts: string[]; topCode: Blocker["code"] }
  | { kind: "ready"; action: RunnableMergeAction }
  | { kind: "queued" };

export function bannerState(insight: PrInsight): BannerState {
  const { mergeAction } = insight;
  if (insight.pr.state === "merged") return { kind: "merged" };
  if (insight.pr.state === "closed") return { kind: "hidden" };
  if (mergeAction.kind === "queued") return { kind: "queued" };
  const parts = bannerParts(insight);
  const topBlocker = insight.blockers[0];
  if (parts.length > 0 && topBlocker !== undefined) {
    return { kind: "blockers", parts, topCode: topBlocker.code };
  }
  if (mergeAction.kind === "merge" || mergeAction.kind === "enqueue") {
    return { kind: "ready", action: mergeAction };
  }
  return { kind: "hidden" };
}
