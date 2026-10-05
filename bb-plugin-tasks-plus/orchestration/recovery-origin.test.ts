import { describe, expect, it } from "vitest";
import plugin from "../server";
import { reportFixture } from "./report-test-fixture";
import { historicalAttempt, historicalUnknown } from "./recovery-test-fixture";
import { createDispatchStore } from "./dispatch-store";
import { createReportStore } from "./report-store";
import { expectNoAgentInput } from "./dispatch-test-fixture";

async function original(older: boolean) {
  const f = await reportFixture(1, false, "pi", plugin);
  const { claim } = historicalUnknown(f, "thr_candidate");
  const worker = f.workers.get("thr_candidate")!;
  f.workers.set(worker.id, {
    ...worker,
    providerId: "pi",
    createdAt: older ? 0 : Date.parse(claim.createdAt),
  });
  f.harness.sdk.stub("threads.list", async (args: any) =>
    [...f.workers.values()].filter((thread) =>
      args.archived ? thread.archivedAt != null : thread.archivedAt == null,
    ),
  );
  const input = { ...f.input, claimId: claim.id };
  const native = { threadId: worker.id, projectId: "proj_fixture" };
  return { ...f, claim, input, native };
}

describe("canonical original-worker facts", () => {
  it.each(["orchestrateReconcile", "orchestrateLink"])(
    "%s rejects older metadata-discovered children and subsequent reports",
    async (method) => {
      const f = await original(true);
      const claims = createDispatchStore(f.bb.storage.database());
      const before = claims.get(f.claim.id);
      const result = (await f.harness.behavior.callRpc(method, {
        ...f.input,
        ...(method === "orchestrateLink" ? { threadId: f.native.threadId } : {}),
      })) as any;
      expect(result).toMatchObject({ outcome: "unresolved", complete: false });
      expect(claims.get(f.claim.id)).toEqual(before);
      expect(claims.owners(f.task.id)).toHaveLength(0);
      expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(0);
      expect(f.store.tasks.getTask(f.task.id)?.status).toBe("backlog");
      await expect(f.report({}, f.native)).rejects.toThrow(/Native creation facts/);
      await expect(f.issue(f.task.id, f.native)).rejects.toThrow(/Native creation facts/);
      expect(createReportStore(f.bb.storage.database()).latest(f.task.id)).toBeNull();
      expect(f.store.tasks.listComments(f.task.id)).toHaveLength(0);
      expect(f.harness.sdk.callsTo("files.write")).toHaveLength(0);
      expectNoAgentInput(f.harness);
    },
  );
  it("accepts an original created exactly when its claim was recorded", async () => {
    const f = await original(false);
    const recovered = (await f.harness.behavior.callRpc("orchestrateReconcile", f.input)) as any;
    expect(recovered.outcome).toBe("recovered");
    expect(await f.report({}, f.native)).toMatchObject({
      threadId: f.native.threadId,
      claimId: f.claim.id,
      delivery: { state: "suppressed" },
    });
    expectNoAgentInput(f.harness);
  });
  it("rejects new reports from previously misattributed attached native children", async () => {
    const f = await reportFixture(1, false, "pi", plugin);
    const { claim } = historicalAttempt(f);
    f.workers.set("thr_worker", {
      ...f.workers.get("thr_worker")!,
      createdAt: 0,
      providerId: "pi",
    });
    f.metadata.set("thr_worker", {
      orchestration: {
        version: 1,
        attemptId: claim.id,
        taskId: claim.taskId,
        role: claim.role,
        runId: claim.runId,
        coordinatorThreadId: claim.coordinatorThreadId,
        bbProjectId: "proj_fixture",
      },
    });
    await expect(f.report()).rejects.toThrow(/Native creation facts/);
    expect(createReportStore(f.bb.storage.database()).latest(f.task.id)).toBeNull();
    expect(createDispatchStore(f.bb.storage.database()).get(claim.id)).toEqual(claim);
    expectNoAgentInput(f.harness);
  });
  it("preserves exact durable adopted associations older than the claim", async () => {
    const f = await reportFixture(1, false, "pi", plugin);
    const { claim } = historicalAttempt(f);
    f.harness.sdk.stub("threads.list", async (args: any) =>
      [...f.workers.values()].filter((thread) =>
        args.archived ? thread.archivedAt != null : thread.archivedAt == null,
      ),
    );
    f.workers.set("thr_worker", {
      ...f.workers.get("thr_worker")!,
      createdAt: 0,
      providerId: "pi",
      parentThreadId: "thr_manual_parent",
      originPluginId: null,
    });
    const recovered = (await f.harness.behavior.callRpc("orchestrateReconcile", {
      ...f.input,
      claimId: claim.id,
    })) as any;
    expect(recovered).toMatchObject({ outcome: "reused", claim, threadId: "thr_worker" });
    expect(await f.report()).toMatchObject({
      claimId: claim.id,
      associationId: claim.associationId,
      delivery: { state: "suppressed" },
    });
    expectNoAgentInput(f.harness);
  });
});
