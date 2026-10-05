import { describe, expect, it } from "vitest";
import { fixture, expectNoAgentInput } from "./dispatch-test-fixture";

describe("manual-first production entrypoints", () => {
  it("returns deferred from an approved dispatch before creating a claim or worker", async () => {
    const f = await fixture();
    const result = await f.dispatch();
    expect(result).toMatchObject({ outcome: "deferred", claim: null, threadId: null });
    expectNoAgentInput(f.harness);
    const status = (await f.harness.behavior.callRpc("orchestrateStatus", {
      epicId: f.epic.id,
    })) as any;
    expect(status.status.subtasks[0].dispatch).toEqual({ state: "absent" });
    expect(f.store.tasks.listTaskThreads(f.task.id)).toEqual([]);
    expect(f.store.tasks.getTask(f.task.id)?.status).toBe("backlog");
  });
  it("stores a production Pi report without notification or receipt intent", async () => {
    const { reportFixture } = await import("./report-test-fixture");
    const { default: plugin } = await import("../server");
    const f = await reportFixture(1, true, "pi", plugin);
    const report = await f.report();
    expect(report.delivery).toMatchObject({
      state: "suppressed",
      reference: null,
      attemptedAt: null,
    });
    expect(
      f.store.tasks.listComments(f.task.id).find((c) => c.id === report.commentId)?.notifiedCount,
    ).toBe(0);
    expectNoAgentInput(f.harness);
    expect(await f.report()).toEqual(report);
  });
  it("keeps begin, pause and native-approved resume as records only", async () => {
    const f = await fixture();
    const scope = (
      (await f.harness.behavior.callRpc("orchestrateStatus", { epicId: f.epic.id })) as any
    ).status.run.value;
    expect(scope.phase).toBe("active");
    await f.pause();
    const resumed = await f.approveRun("thr_coordinator", "resume");
    expect(resumed).toMatchObject({ id: scope.id, phase: "active" });
    expect(f.store.tasks.getTask(f.task.id)?.status).toBe("backlog");
    expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(0);
    expectNoAgentInput(f.harness);
  });
});
