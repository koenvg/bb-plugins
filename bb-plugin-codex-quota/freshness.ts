import type { QuotaStatus } from "./contract.js";

export const FRESH_MS = 5 * 60_000;
export const MAX_AGE_MS = 24 * 60 * 60_000;

/** Recalculate on the viewer's clock; a server's earlier "fresh" label cannot outlive its deadline. */
export function visibleView(view: QuotaStatus, now: number): QuotaStatus {
  if (!view.snapshot) return view;
  const age = now - Date.parse(view.snapshot.observedAt);
  if (!Number.isFinite(age) || age < 0 || age >= MAX_AGE_MS) {
    return { state: "unavailable", reason: "expired", snapshot: null };
  }
  if (age >= FRESH_MS && view.state === "fresh") return { ...view, state: "stale", reason: "aged" };
  return view;
}
