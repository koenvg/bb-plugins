import type { TaskWorkStatus } from "./contract.js";
type WorkPr = TaskWorkStatus["pullRequests"]["items"][number];
export const RICH_DETAILS_MAX_AGE = 60 * 60_000;

/** The producer observation time, never host updatedAt, dates check/review claims. */
export function ageRichDetails(pr: WorkPr, now: number): WorkPr {
  if (!pr.rich || !["available", "incomplete"].includes(pr.details)) return pr;
  const time = Date.parse(pr.rich.refreshedAt);
  if (!Number.isFinite(time) || time > now)
    return { ...pr, details: "unavailable", detailsReason: "invalid_metadata" };
  if (
    (pr.state === "open" || pr.state === "draft") &&
    now - time > RICH_DETAILS_MAX_AGE
  )
    return { ...pr, details: "stale", detailsReason: "expired" };
  return pr;
}
