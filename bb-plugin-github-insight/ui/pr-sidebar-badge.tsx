import type { ExperimentalBadge } from "@get-bb/plugin-sdk/app";
import { reviewBadge } from "../core/review-badge";
import { useReviewQueue } from "./use-review-queue";

export function usePrBadge(): ExperimentalBadge | null {
  const badge = reviewBadge(useReviewQueue().view);
  if (badge === null) return null;
  const label = [
    badge.count === null
      ? null
      : `${badge.count} ${badge.count === "1" ? "pull request needs" : "pull requests need"} review`,
    badge.unseen ? "new" : null,
    badge.returned ? "Review agent came back" : null,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    ...(badge.count === null
      ? {}
      : badge.count === "50+"
        ? { text: badge.count }
        : { count: Number(badge.count) }),
    tone: badge.unseen || badge.returned ? "warning" : "neutral",
    label,
  };
}
