import type { TaskWorkStatus } from "./contract.js";
type WorkPr = TaskWorkStatus["pullRequests"]["items"][number];
export const RICH_DETAILS_MAX_AGE = 60 * 60_000;

/** The producer observation time, never host updatedAt, dates check/review claims. */
export function ageRichDetails(pr: WorkPr, now: number): WorkPr {
  const time = richDetailsTime(pr);
  if (time === undefined) return pr;
  if (!Number.isFinite(time) || time > now)
    return { ...pr, details: "unavailable", detailsReason: "invalid_metadata" };
  if (expires(pr) && now - time > RICH_DETAILS_MAX_AGE)
    return { ...pr, details: "stale", detailsReason: "expired" };
  return pr;
}

export function nextRichDetailsChange(pr: WorkPr, now: number): number {
  const time = richDetailsTime(pr);
  if (time === undefined || !Number.isFinite(time)) return Infinity;
  if (time > now) return time;
  const firstExpiredTime = time + RICH_DETAILS_MAX_AGE + 1;
  return expires(pr) && firstExpiredTime > now ? firstExpiredTime : Infinity;
}

function richDetailsTime(pr: WorkPr): number | undefined {
  if (pr.rich && (pr.details === "available" || pr.details === "incomplete")) {
    return Date.parse(pr.rich.refreshedAt);
  }
}

function expires(pr: WorkPr): boolean {
  return pr.state === "open" || pr.state === "draft";
}
