import { describe, expect, it, vi } from "vitest";
import { reportFixture } from "./report-test-fixture";
import plugin from "../server";
import { createReportIntents } from "./report-intents";
import { expectNoAgentInput } from "./dispatch-test-fixture";

describe("non-notifying report writes", () => {
  it.each(["completed", "review_ready", "blocked", "failed", "needs_decision"])(
    "stores %s in the production module without delivery attempts",
    async (outcome) => {
      const f = await reportFixture(1, true, "pi", plugin);
      const recheck = vi.spyOn(f.bb.experimental_hooks, "recheck");
      const report = await f.report({
        outcome,
        ...(outcome === "needs_decision" ? { question: "Which baseline?" } : {}),
      });
      expect(report.delivery).toMatchObject({
        state: "suppressed",
        reference: null,
        attemptedAt: null,
      });
      expect(report.delivery.reason).toContain("Manual-first");
      expect(createReportIntents(f.bb.storage.database()).get(report.id)).toBeNull();
      const issued = await f.issue();
      expect(
        await f.harness.behavior.callRpc("reportWorker", {
          ...f.payload,
          outcome,
          ...(outcome === "needs_decision" ? { question: "Which baseline?" } : {}),
          contextToken: issued.token,
        }),
      ).toEqual(report);
      await f.pause();
      expect(
        await f.report({
          outcome,
          ...(outcome === "needs_decision" ? { question: "Which baseline?" } : {}),
        }),
      ).toEqual(report);
      expectNoAgentInput(f.harness);
      expect(recheck).not.toHaveBeenCalled();
      expect(f.store.tasks.getTask(f.task.id)?.status).toBe("in_progress");
    },
  );
});
