import { describe, expect, it } from "vitest";
import { reportInputSchema, REPORT_LIMITS } from "./report-contract";

describe("worker report boundary", () => {
  const input = {
    taskId: "01H00000000000000000000001",
    contextToken: "a".repeat(64),
    key: "build-1",
    outcome: "completed",
    summary: "Checks pass.",
  };
  it.each(["completed", "review_ready", "blocked", "failed", "needs_decision"])(
    "accepts %s without a task status edit",
    (outcome) => {
      const parsed = reportInputSchema.parse({
        ...input,
        outcome,
        ...(outcome === "needs_decision" ? { question: "Which baseline?" } : {}),
      });
      expect(parsed).not.toHaveProperty("status");
    },
  );
  it("requires a real question for needs_decision", () => {
    expect(reportInputSchema.safeParse({ ...input, outcome: "needs_decision" }).success).toBe(
      false,
    );
  });
  it.each(["contextToken", "key", "summary"])("rejects blank %s", (field) => {
    expect(reportInputSchema.safeParse({ ...input, [field]: " " }).success).toBe(false);
  });
  it("rejects oversized input and authority supplied as metadata", () => {
    for (const change of [
      { summary: "x".repeat(REPORT_LIMITS.summary + 1) },
      { question: "x".repeat(REPORT_LIMITS.question + 1) },
      {
        resultReferences: Array.from({ length: REPORT_LIMITS.results + 1 }, () => ({
          kind: "commit",
          reference: "abc",
        })),
      },
      { baselineReferences: ["x".repeat(REPORT_LIMITS.reference + 1)] },
      { threadId: "thr_forged" },
      { runId: "supplied-authority" },
      { status: "done" },
      { outcome: "idle" },
      { resultReferences: [{ kind: "code", reference: "abc" }] },
    ])
      expect(reportInputSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
});
