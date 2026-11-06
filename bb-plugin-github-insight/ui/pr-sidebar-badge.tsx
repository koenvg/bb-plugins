import type { ExperimentalBadge } from "@get-bb/plugin-sdk/app";
import { reviewBadge } from "../core/review-badge";
import { useReviewQueue } from "./use-review-queue";

export function usePrSidebarBadge(): ExperimentalBadge | null {
  const badge = reviewBadge(useReviewQueue().view);
  if (badge === null) return null;
  const labels = [];
  if (badge.count !== null) labels.push(`${badge.count} pull requests need review`);
  if (badge.unseen) labels.push("New pull requests");
  if (badge.returned) labels.push("Review agent came back");
  return {
    ...(badge.count === null ? {} : { text: badge.count }),
    tone: badge.unseen || badge.returned ? "warning" : "neutral",
    label: labels.join(". "),
  };
}
