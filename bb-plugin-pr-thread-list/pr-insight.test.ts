import { describe, expect, it } from "vitest";
import { readInsight } from "./pr-insight";

const NOW = Date.parse("2026-10-01T12:00:00.000Z");

function summary(overrides: Record<string, unknown> = {}) {
  return {
    version: 1, updatedAt: "2026-10-01T11:50:00.000Z",
    pr: { number: 42, url: "https://example.com/pull/42", state: "open" },
    checks: { failed: 1, running: 2, cancelled: 0, passed: 5, skipped: 0, failedNames: ["lint"] },
    reviewers: { pending: 1, approved: 0, changesRequested: 0, pendingNames: ["ana"] },
    blockers: ["checks_failed", "review_required"], error: null,
    ...overrides,
  };
}

describe("github-insight PR summary", () => {
  it("reads counts, names and blockers for the matching PR", () => {
    expect(readInsight(summary(), 42, NOW)).toEqual({
      failedChecks: 1, passedChecks: 5, runningChecks: 2, pendingReviews: 1,
      blockers: ["checks_failed", "review_required"], failedNames: ["lint"], pendingNames: ["ana"],
    });
  });
  it("ignores a summary for another PR, a stale summary, or an unknown shape", () => {
    expect(readInsight(summary(), 7, NOW)).toBeNull();
    expect(readInsight(summary({ updatedAt: "2026-10-01T10:00:00.000Z" }), 42, NOW)).toBeNull();
    expect(readInsight(summary({ version: 2 }), 42, NOW)).toBeNull();
    expect(readInsight({ version: 1 }, 42, NOW)).toBeNull();
    expect(readInsight(undefined, 42, NOW)).toBeNull();
  });
  it("skips blocker codes it does not know", () => {
    expect(readInsight(summary({ blockers: ["future", "review_required"] }), 42, NOW)?.blockers).toEqual(["review_required"]);
  });
});
