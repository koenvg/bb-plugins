import { describe, expect, it } from "vitest";
import { orchestrationStatusContract } from "./status-contract";
import { setup } from "./status-test-fixture";

describe("compact status extension contract", () => {
  it("projects explicit extension records without inventing completion or dropping primary owners", async () => {
    const f = setup();
    const task = f.child("Reported work");
    const owner = f.attach(task.id, "thr_owner");
    for (let i = 0; i < 8; i++) f.attach(task.id, `thr_aux${i}`);
    f.coordination.run = { state: "absent" };
    f.coordination.acceptance = { state: "absent" };
    f.coordination.tasks = new Map([
      [
        task.id,
        {
          ownership: {
            state: "known",
            reason: "designated_in_tasks",
            owners: [
              {
                associationId: owner.id,
                threadId: owner.threadId,
                role: "implementation",
              },
            ],
          },
          dispatch: {
            state: "present",
            value: [
              {
                id: "claim",
                runId: "run",
                role: "implementation",
                phase: "unresolved",
                threadId: null,
              },
            ],
          },
          latestOutcome: {
            state: "present",
            value: {
              id: "report",
              commentId: "comment",
              threadId: owner.threadId,
              createdAt: "2026-10-03T00:00:00.000Z",
              outcome: "review_ready",
              summary: "Large summary".repeat(10000),
              resultReferences: Array.from({ length: 12 }, (_, i) => `attachment:${i}`),
            },
          },
          reportedDecisions: {
            state: "present",
            value: [
              {
                id: "decision-report",
                taskId: task.id,
                threadId: owner.threadId,
                kind: "needs_decision",
                state: "pending",
                createdAt: "2026-10-03T00:00:00.000Z",
                question: "Approve?",
              },
            ],
          },
        },
      ],
    ]);
    const result = await f.read();
    if (!result.ok) throw new Error(result.error.message);
    const projected = result.status.subtasks[0]!;
    expect(projected.status).toBe("todo");
    expect(projected.owners[0]).toMatchObject({
      associationId: owner.id,
      threadId: owner.threadId,
    });
    expect(projected.workers).toMatchObject({ total: 8, omitted: 3 });
    expect(projected.latestOutcome).toMatchObject({
      state: "present",
      value: {
        id: "report",
        outcome: "review_ready",
        resultReferences: { total: 12, omitted: 7 },
      },
    });
    expect(result.status.run).toEqual({ state: "absent" });
    f.store.tasks.deleteTaskThread(owner.id);
    const detached = await f.read();
    if (!detached.ok) throw new Error(detached.error.message);
    expect(detached.status.subtasks[0]).toMatchObject({
      ownership: {
        state: "resolution_needed",
        reason: "owner_association_missing",
        owners: [],
      },
      owners: [],
    });
  });

  it("preserves explicit run scope and failed or verified acceptance without changing tickets", async () => {
    const f = setup();
    const task = f.child("Done work", "done");
    const integration = f.attach(f.epic.id, "thr_integration");
    f.coordination.run = {
      state: "present",
      value: {
        id: "run",
        phase: "paused",
        coordinatorThreadId: "thr_coordinator",
        approvedTaskIds: [task.id],
        scopeState: "changed",
        baselineReferences: ["commit:baseline"],
      },
    };
    f.coordination.acceptance = {
      state: "present",
      value: {
        reportId: "acceptance-report",
        threadId: integration.threadId,
        outcome: "failed",
        baselineReferences: ["commit:verified"],
        evidenceReferences: ["attachment:evidence"],
      },
    };
    let result = await f.read();
    if (!result.ok) throw new Error(result.error.message);
    expect(result.status.run).toMatchObject({
      state: "present",
      value: {
        phase: "paused",
        scopeState: "changed",
        approvedTaskIds: [task.id],
      },
    });
    expect(result.status.acceptance).toMatchObject({
      state: "present",
      value: { outcome: "failed" },
    });
    expect(result.status.epic.status).toBe("in_progress");
    f.coordination.acceptance.value.outcome = "verified";
    result = await f.read();
    if (!result.ok) throw new Error(result.error.message);
    expect(result.status.acceptance).toMatchObject({
      state: "present",
      value: {
        outcome: "verified",
        evidenceReferences: { items: ["attachment:evidence"] },
      },
    });
    expect(f.store.tasks.getTask(f.epic.id)?.status).toBe("in_progress");
    expect(f.spawn).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
  });

  it("keeps unresolved pre-attachment claims visible and refuses conflicting owner data", async () => {
    const f = setup();
    const task = f.child("Created but unattached", "in_progress");
    const data = {
      dispatch: {
        state: "present" as const,
        value: [
          {
            id: "claim",
            runId: "run",
            role: "implementation" as const,
            phase: "creation_unknown",
            threadId: "thr_pending",
          },
        ],
      },
    };
    f.coordination.tasks = new Map([[task.id, data]]);
    let result = await f.read();
    if (!result.ok) throw new Error(result.error.message);
    expect(result.status.subtasks[0]).toMatchObject({
      ownership: { state: "resolution_needed" },
      workers: { total: 0 },
      dispatch: data.dispatch,
    });
    const a = f.attach(task.id, "thr_a");
    const b = f.attach(task.id, "thr_b");
    f.coordination.tasks = new Map([
      [
        task.id,
        {
          ownership: {
            state: "known",
            reason: "conflict",
            owners: [a, b].map((worker) => ({
              associationId: worker.id,
              threadId: worker.threadId,
              role: "implementation",
            })),
          },
        },
      ],
    ]);
    expect(await f.read()).toMatchObject({
      ok: false,
      error: { code: "epic_status_extension_invalid" },
    });
    expect(f.get).not.toHaveBeenCalled();
  });

  it("omits oversized references rather than truncating identities and validates overflow counts", async () => {
    const f = setup();
    f.coordination.run = {
      state: "present",
      value: {
        id: "run",
        phase: "active",
        coordinatorThreadId: "thr_coordinator",
        approvedTaskIds: [],
        scopeState: "unknown",
        baselineReferences: ["x".repeat(5000), "commit:base"],
      },
    };
    const result = await f.read();
    if (!result.ok) throw new Error(result.error.message);
    expect(result.status.run).toMatchObject({
      state: "present",
      value: {
        baselineReferences: { items: ["commit:base"], total: 2, omitted: 1 },
      },
    });
    const invalid = structuredClone(result);
    invalid.status.epic.attachments.omitted = 99;
    expect(orchestrationStatusContract.orchestrateStatus.output.safeParse(invalid).success).toBe(
      false,
    );
  });

  it("rejects one native owner association designated under multiple roles", async () => {
    const f = setup();
    const owner = f.attach(f.epic.id, "thr_multi_role");
    for (let i = 0; i < 8; i++) f.attach(f.epic.id, `thr_other${i}`);
    f.coordination.tasks = new Map([
      [
        f.epic.id,
        {
          ownership: {
            state: "known",
            reason: "duplicate_association",
            owners: ["orchestrator" as const, "integration" as const].map((role) => ({
              associationId: owner.id,
              threadId: owner.threadId,
              role,
            })),
          },
        },
      ],
    ]);
    const before = f.bb.storage.database().prepare("SELECT total_changes() AS n").get();
    expect(await f.read()).toMatchObject({
      ok: false,
      error: { code: "epic_status_extension_invalid" },
    });
    expect(f.bb.storage.database().prepare("SELECT total_changes() AS n").get()).toEqual(before);
    expect(f.get).not.toHaveBeenCalled();
    expect(f.spawn).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
  });
});
