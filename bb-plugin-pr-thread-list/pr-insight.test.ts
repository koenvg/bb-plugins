import { describe, expect, it } from "vitest";
import { readSummary } from "./pr-insight";

const NOW = Date.parse("2026-10-01T12:00:00.000Z");
const TWO_HOURS_AGO = "2026-10-01T10:00:00.000Z";

function summary(overrides: Record<string, unknown> = {}, pr: Record<string, unknown> = {}) {
  return {
    version: 1, updatedAt: "2026-10-01T11:50:00.000Z",
    pr: { number: 42, url: "https://example.com/pull/42", state: "open", ...pr },
    checks: { failed: 1, running: 2, cancelled: 0, passed: 5, skipped: 0, failedNames: ["lint"] },
    reviewers: { pending: 1, approved: 0, changesRequested: 0, pendingNames: ["ana"] },
    blockers: ["checks_failed", "review_required"], error: null,
    ...overrides,
  };
}

describe("github-insight PR summary", () => {
  it("reads the PR, counts, names and blockers", () => {
    expect(readSummary(summary(), NOW)).toEqual({
      number: 42, url: "https://example.com/pull/42", state: "open",
      failedChecks: 1, passedChecks: 5, runningChecks: 2, pendingReviews: 1,
      blockers: ["checks_failed", "review_required"], failedNames: ["lint"], pendingNames: ["ana"],
    });
  });
  it("rejects an open or draft summary older than one hour", () => {
    expect(readSummary(summary({ updatedAt: TWO_HOURS_AGO }), NOW)).toBeNull();
    expect(readSummary(summary({ updatedAt: TWO_HOURS_AGO }, { state: "draft" }), NOW)).toBeNull();
  });
  it("keeps a merged or closed summary at any age", () => {
    expect(readSummary(summary({ updatedAt: TWO_HOURS_AGO }, { state: "merged" }), NOW)?.state).toBe("merged");
    expect(readSummary(summary({ updatedAt: TWO_HOURS_AGO }, { state: "closed" }), NOW)?.state).toBe("closed");
  });
  it("rejects a wrong version, an unknown shape, or bad counts", () => {
    expect(readSummary(summary({ version: 2 }), NOW)).toBeNull();
    expect(readSummary({ version: 1 }, NOW)).toBeNull();
    expect(readSummary(undefined, NOW)).toBeNull();
    expect(readSummary(summary({}, { state: "queued" }), NOW)).toBeNull();
    expect(readSummary(summary({}, { number: "42" }), NOW)).toBeNull();
    expect(readSummary(summary({ checks: { failed: -1, running: 0, passed: 0 } }), NOW)).toBeNull();
    expect(readSummary(summary({ reviewers: { pending: 1.5 } }), NOW)).toBeNull();
  });
  it("skips blocker codes it does not know", () => {
    expect(readSummary(summary({ blockers: ["future", "review_required"] }), NOW)?.blockers).toEqual(["review_required"]);
  });
});
