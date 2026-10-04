import { describe, expect, it } from "vitest";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { fixture } from "./dispatch-test-fixture";
import { createDispatchStore } from "./dispatch-store";
import { readResolution, releasedDispatchGrant } from "./recovery-contract";

async function unknown() {
  const f = await fixture();
  f.setCreate(async () => {
    throw new Error("ambiguous transport");
  });
  const dispatched = await f.dispatch();
  return { ...f, input: { ...f.input, claimId: dispatched.claim!.id } };
}
async function decisionFor(
  f: Awaited<ReturnType<typeof unknown>>,
  action = "release",
  associationId: string | null = null,
) {
  const reconciliation = (await f.harness.behavior.callRpc(
    "orchestrateReconcile",
    f.input,
  )) as any;
  const decision = {
    ...f.input,
    action,
    associationId,
    reconciliationId: reconciliation.reconciliationId,
    acknowledgeDelayedCreation: true,
  };
  const event = {
    id: "evt_resolution",
    threadId: f.input.coordinatorThreadId,
    seq: 50,
    createdAt: Date.now(),
    scope: { kind: "thread" },
    type: "client/turn/requested",
    data: {
      requestId: "creq_resolution",
      initiator: "user",
      senderThreadId: null,
      input: [
        {
          type: "text",
          text: `/tasks-orchestrate-resolve ${JSON.stringify(decision)}`,
          mentions: [],
        },
      ],
    },
  };
  f.setRequests([event]);
  return {
    decision,
    event,
    resolve: () =>
      f.harness.behavior.callRpc("orchestrateResolve", {
        ...decision,
        requestId: "creq_resolution",
      }) as Promise<any>,
  };
}
function effects(f: Awaited<ReturnType<typeof fixture>>, spawns = 1) {
  expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(
    spawns,
  );
  for (const method of [
    "threads.send",
    "threads.delete",
    "threads.update",
    "threads.resume",
  ])
    expect(f.harness.inspection.sdk.callsTo(method as any)).toHaveLength(0);
}

describe("explicit recorded recovery resolution", () => {
  it("refuses ordinary adoption of correlated native identity without local history", async () => {
    const f = await fixture();
    const candidate = makeThreadResponse({
      id: "thr_correlated_legacy", projectId: "proj_fixture", status: "idle",
    });
    f.workers.set(candidate.id, candidate);
    f.metadata.set(candidate.id, { orchestration: { version: "unknown" } });
    await f.harness.behavior.callRpc("taskThreadsAttach", {
      taskId: f.task.id, threadId: candidate.id,
    });
    const association = f.store.tasks.getTaskThreadByThreadId(f.task.id, candidate.id)!;
    await expect(f.harness.behavior.callRpc("orchestrateAdopt", {
      ...f.input, associationId: association.id,
    })).rejects.toThrow(/correlated.*original/i);
    const claims = createDispatchStore(f.bb.storage.database());
    expect(claims.live(f.task.id, f.input.role)).toBeNull();
    expect(claims.owners(f.task.id)).toHaveLength(0);
    expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(1);
    effects(f, 0);
  });
  it.each(["spawned", "adopted"])(
    "refuses new-run adoption of a released %s original without changing history",
    async (kind) => {
      const f = await fixture();
      let original: any;
      if (kind === "spawned") original = await f.dispatch();
      else {
        const thread = makeThreadResponse({
          id: "thr_adopted", projectId: "proj_fixture", status: "idle",
          parentThreadId: "thr_unrelated_parent",
        });
        f.workers.set(thread.id, thread);
        await f.harness.behavior.callRpc("taskThreadsAttach", {
          taskId: f.task.id, threadId: thread.id,
        });
        const association = f.store.tasks.getTaskThreadByThreadId(f.task.id, thread.id)!;
        original = await f.harness.behavior.callRpc("orchestrateAdopt", {
          ...f.input, associationId: association.id,
        });
      }
      const thread = f.workers.get(original.threadId)!;
      f.workers.set(thread.id, { ...thread, status: "error" });
      const d = await decisionFor({ ...f, input: { ...f.input, claimId: original.claim.id } });
      const released = await d.resolve();
      expect(released.outcome).toBe("released");
      f.workers.set(thread.id, { ...thread, status: "idle" });
      const run = await f.approveRun();
      await expect(f.harness.behavior.callRpc("orchestrateAdopt", {
        ...f.input, runId: run.id, associationId: original.claim.associationId,
      })).rejects.toThrow(/original|historical|correlated/i);
      const claims = createDispatchStore(f.bb.storage.database());
      expect(claims.get(original.claim.id)).toEqual(released.claim);
      expect(claims.live(f.task.id, f.input.role)).toBeNull();
      expect(claims.owners(f.task.id)).toHaveLength(0);
      expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(1);
      effects(f, kind === "spawned" ? 1 : 0);
    },
  );
  it.each(["missing-claim", "released-claim", "detached-association", "foreign-project"])(
    "keeps an identical replacement retry unresolved with %s",
    async (kind) => {
      const f = await fixture();
      const original = await f.dispatch();
      const worker = f.workers.get(original.threadId!)!;
      f.workers.set(worker.id, { ...worker, status: "error" });
      const candidate = makeThreadResponse({
        id: "thr_retry_candidate", projectId: "proj_fixture", status: "idle",
      });
      f.workers.set(candidate.id, candidate);
      const association = f.store.tasks.upsertTaskThread({
        taskId: f.task.id, threadId: candidate.id,
        title: "Retry candidate", presetName: "Manual", liveStatus: "idle",
      });
      const d = await decisionFor({
        ...f, input: { ...f.input, claimId: original.claim!.id },
      }, "replace", association.id);
      const first = await d.resolve();
      expect(first.outcome).toBe("replaced");
      const claims = createDispatchStore(f.bb.storage.database());
      if (kind === "missing-claim")
        f.bb.storage.database().prepare(
          "DELETE FROM orchestration_dispatch_claims WHERE id = ?",
        ).run(first.claim.id);
      if (kind === "released-claim") claims.release(first.claim.id, "fixture");
      if (kind === "detached-association")
        await f.harness.behavior.callRpc("taskThreadsDetach", {
          taskId: f.task.id, threadId: candidate.id,
        });
      if (kind === "foreign-project")
        f.workers.set(candidate.id, { ...candidate, projectId: "proj_other" });
      const originalHistory = claims.get(original.claim!.id);
      const comments = f.store.tasks.listComments(f.task.id);
      expect((await d.resolve()).outcome).toBe("unresolved");
      expect(claims.get(original.claim!.id)).toEqual(originalHistory);
      expect(f.store.tasks.listComments(f.task.id)).toEqual(comments);
      effects(f);
    },
  );
  it("applies the documented release CLI only from its exact recorded decision", async () => {
    const f = await unknown();
    const d = await decisionFor(f);
    const output = await f.harness.behavior.runCli(
      [
        "orchestrate",
        "resolve",
        f.task.key,
        "--run",
        f.input.runId,
        "--claim",
        f.input.claimId,
        "--action",
        "release",
        "--reconciliation",
        d.decision.reconciliationId,
        "--request",
        "creq_resolution",
        "--acknowledge-delayed-creation",
        "--json",
      ],
      { threadId: "thr_coordinator" },
    );
    expect(output.exitCode).toBe(0);
    expect(JSON.parse(output.stdout!).outcome).toBe("released");
    effects(f);
  });
  it("recovers an original appearing in the final reconciliation instead of releasing it", async () => {
    const f = await unknown();
    const d = await decisionFor(f);
    let calls = 0;
    f.setListing(async (args) => {
      calls++;
      if (calls >= 3) {
        f.workers.set(
          "thr_late_original",
          makeThreadResponse({
            id: "thr_late_original",
            projectId: "proj_fixture",
            parentThreadId: "thr_coordinator",
            originPluginId: f.bb.pluginId,
            status: "active",
          }),
        );
        f.metadata.set("thr_late_original", {
          orchestration: {
            version: 1,
            attemptId: f.input.claimId,
            taskId: f.task.id,
            role: "implementation",
            runId: f.input.runId,
            coordinatorThreadId: "thr_coordinator",
            bbProjectId: "proj_fixture",
          },
        });
      }
      return args.archived ? [] : [...f.workers.values()];
    });
    const result = await d.resolve();
    expect(result.outcome).toBe("recovered");
    expect(result.threadId).toBe("thr_late_original");
    expect(result.claim.releasedAt).toBeNull();
    effects(f);
  });
  it("never grants a later run permission from a valid prior release record", async () => {
    const f = await unknown();
    const d = await decisionFor(f);
    const released = await d.resolve();
    expect(releasedDispatchGrant(released.claim, f.input)).toBe(true);
    for (const input of [
      { ...f.input, runId: "different" },
      { ...f.input, coordinatorThreadId: "different" },
      { ...f.input, role: "integration" as const },
    ])
      expect(releasedDispatchGrant(released.claim, input)).toBe(false);
    const record = readResolution(released.claim.reason)!;
    expect(
      releasedDispatchGrant(
        {
          ...released.claim,
          reason: JSON.stringify({
            ...record,
            decision: { ...record.decision, claimId: "different" },
          }),
        },
        f.input,
      ),
    ).toBe(false);
    effects(f);
  });
  it("records release after fresh complete zero-match reconciliation, without proving absence or starting work", async () => {
    const f = await unknown();
    const d = await decisionFor(f);
    const before = f.harness.inspection.sdk.callsTo("threads.list").length;
    const result = await d.resolve();
    expect(result.outcome).toBe("released");
    expect(result.warning).toContain("duplicate work");
    expect(
      f.harness.inspection.sdk.callsTo("threads.list").length,
    ).toBeGreaterThan(before);
    expect(result.claim.releasedAt).not.toBeNull();
    const stored = readResolution(result.claim.reason)!;
    expect(stored).toMatchObject({
      version: 1,
      kind: "operator_resolution",
      decision: d.decision,
    });
    expect(stored.previousReason).toContain("unknown");
    expect(stored.decisionReference).toBe("thr_coordinator:creq_resolution:50");
    effects(f);
    const retry = await d.resolve();
    expect(retry.claim.id).toBe(result.claim.id);
    expect(retry.outcome).toBe("released");
    effects(f);
    // Only a separate dispatch under active admission may create another attempt.
    f.setCreate(async (args) => {
      const thread = makeThreadResponse({
        id: "thr_after_resolution",
        projectId: args.projectId,
        parentThreadId: args.parentThreadId,
        originPluginId: f.bb.pluginId,
      });
      f.workers.set(thread.id, thread);
      f.metadata.set(thread.id, args.pluginMetadata);
      return thread;
    });
    const next = await f.dispatch();
    expect(next.outcome).toBe("created");
    expect(next.claim!.id).not.toBe(result.claim.id);
    expect(
      createDispatchStore(f.bb.storage.database()).get(result.claim.id)
        ?.releasedAt,
    ).toBe(result.claim.releasedAt);
    effects(f, 2);
  });
  it.each([
    "agent",
    "sender",
    "quoted",
    "mixed",
    "stale",
    "mismatch",
    "acknowledgement",
    "metadata",
  ])("refuses %s decisions and preserves the claim", async (kind) => {
    const f = await unknown();
    const d = await decisionFor(f);
    const event: any = d.event;
    if (kind === "agent") event.data.initiator = "agent";
    if (kind === "sender") event.data.senderThreadId = "thr_foreign";
    if (kind === "quoted")
      event.data.input[0].text = `Quoted: ${event.data.input[0].text}`;
    if (kind === "mixed") event.data.inputGroups = [{}, {}];
    if (kind === "stale") event.createdAt -= 16 * 60_000;
    if (kind === "mismatch")
      event.data.input[0].text = event.data.input[0].text.replace(
        f.input.claimId,
        "different-claim",
      );
    if (kind === "acknowledgement")
      event.data.input[0].text = event.data.input[0].text.replace(
        '"acknowledgeDelayedCreation":true',
        '"acknowledgeDelayedCreation":false',
      );
    if (kind === "metadata") {
      f.metadata.set("thr_coordinator", {
        permissionToken: "not-authority",
        decision: d.decision,
      });
      f.setRequests([]);
    }
    await expect(d.resolve()).rejects.toThrow();
    expect(
      createDispatchStore(f.bb.storage.database()).get(f.input.claimId)
        ?.releasedAt,
    ).toBeNull();
    effects(f);
  });
  it("does not treat diagnostic or malformed resolution reasons as a dispatch grant", async () => {
    const f = await unknown();
    const claims = createDispatchStore(f.bb.storage.database());
    for (const reason of [
      "operator released",
      JSON.stringify({ version: 1, kind: "operator_resolution" }),
      "{bad-json}",
    ]) {
      f.bb.storage
        .database()
        .prepare(
          "UPDATE orchestration_dispatch_claims SET released_at=?,reason=? WHERE id=?",
        )
        .run(new Date().toISOString(), reason, f.input.claimId);
      expect(releasedDispatchGrant(claims.get(f.input.claimId), f.input)).toBe(
        false,
      );
      expect((await f.dispatch()).outcome).toBe("resolution_needed");
    }
    effects(f);
  });
  it.each(["unavailable", "multiple", "changed", "creating"])(
    "refuses release when fresh reconciliation is %s",
    async (kind) => {
      const f = await unknown();
      const d = await decisionFor(f);
      if (kind === "unavailable")
        f.setListing(async () => {
          throw new Error("interrupted");
        });
      if (kind === "creating")
        createDispatchStore(f.bb.storage.database()).update(f.input.claimId, {
          phase: "creating",
        });
      if (kind === "multiple" || kind === "changed") {
        const correlation = {
          version: 1,
          attemptId: f.input.claimId,
          ...f.input,
          bbProjectId: "proj_fixture",
        } as any;
        delete correlation.claimId;
        for (const id of kind === "multiple" ? ["thr_a", "thr_b"] : ["thr_a"]) {
          f.workers.set(
            id,
            makeThreadResponse({
              id,
              projectId: "proj_fixture",
              parentThreadId: "thr_coordinator",
              originPluginId: f.bb.pluginId,
            }),
          );
          f.metadata.set(id, { orchestration: correlation });
        }
      }
      const result = await d.resolve();
      if (kind === "changed") expect(result.outcome).toBe("recovered");
      else expect(result.outcome).toBe("unresolved");
      expect(
        createDispatchStore(f.bb.storage.database()).get(f.input.claimId)
          ?.releasedAt,
      ).toBeNull();
      effects(f);
    },
  );
  it("never treats old creating state or lease expiry as definite absence", async () => {
    const f = await unknown();
    f.bb.storage
      .database()
      .prepare(
        "UPDATE orchestration_dispatch_claims SET phase='creating',updated_at='2000-01-01T00:00:00.000Z' WHERE id=?",
      )
      .run(f.input.claimId);
    const d = await decisionFor(f);
    expect((await d.resolve()).outcome).toBe("unresolved");
    expect((await f.dispatch()).outcome).toBe("unresolved");
    effects(f);
  });
  it("refuses a different run or live coordinator project without retagging the old claim", async () => {
    const f = await unknown();
    const d = await decisionFor(f);
    const other = await f.approveRun();
    await expect(
      f.harness.behavior.callRpc("orchestrateReconcile", {
        ...f.input,
        runId: other.id,
      }),
    ).rejects.toThrow("original");
    f.setRequests([d.event]);
    f.setCoordinatorProject("proj_foreign");
    await expect(d.resolve()).rejects.toThrow("project");
    expect(
      createDispatchStore(f.bb.storage.database()).get(f.input.claimId)?.runId,
    ).toBe(f.input.runId);
    effects(f);
  });
  it("blocks a delayed original on a later separate dispatch after recorded release", async () => {
    const f = await unknown();
    const d = await decisionFor(f);
    expect((await d.resolve()).outcome).toBe("released");
    const metadata = {
      version: 1,
      attemptId: f.input.claimId,
      taskId: f.task.id,
      role: f.input.role,
      runId: f.input.runId,
      coordinatorThreadId: "thr_coordinator",
      bbProjectId: "proj_fixture",
    };
    f.workers.set(
      "thr_delayed",
      makeThreadResponse({
        id: "thr_delayed",
        projectId: "proj_fixture",
        parentThreadId: "thr_coordinator",
        originPluginId: f.bb.pluginId,
      }),
    );
    f.metadata.set("thr_delayed", { orchestration: metadata });
    expect((await f.dispatch()).threadId).toBe("thr_delayed");
    expect(
      createDispatchStore(f.bb.storage.database()).get(f.input.claimId)
        ?.releasedAt,
    ).not.toBeNull();
    effects(f);
  });
  it("refuses a local ownership change during native observations", async () => {
    const f = await unknown();
    const d = await decisionFor(f);
    f.setListing(async () => {
      f.store.tasks.upsertTaskThread({
        taskId: f.task.id,
        threadId: "thr_manual",
        title: "Manual",
        presetName: "Manual",
        liveStatus: "idle",
      });
      return [];
    });
    await expect(d.resolve()).rejects.toThrow("changed during native reads");
    expect(
      createDispatchStore(f.bb.storage.database()).get(f.input.claimId)
        ?.releasedAt,
    ).toBeNull();
    effects(f);
  });
  it.each([
    "valid",
    "foreign-project",
    "another-claim",
    "changed-reconciliation",
    "released-claim",
    "correlated-candidate",
    "active-original",
    "unavailable-history",
  ])(
    "validates explicit replacement with %s state and preserves all history",
    async (kind) => {
      const f = await fixture();
      const dispatched = await f.dispatch();
      const input = { ...f.input, claimId: dispatched.claim!.id };
      const original = f.workers.get("thr_worker")!;
      f.workers.set(original.id, {
        ...original,
        status: kind === "active-original" ? "active" : "error",
      });
      const selected = makeThreadResponse({
        id: "thr_replacement",
        projectId: kind === "foreign-project" ? "proj_other" : "proj_fixture",
        parentThreadId: "thr_other_parent",
        status: "idle",
      });
      f.workers.set(selected.id, selected);
      // Manual association writes retain their legacy behavior; recovery must validate native project.
      const association = f.store.tasks.upsertTaskThread({
        taskId: f.task.id,
        threadId: selected.id,
        title: "Candidate",
        presetName: "Manual",
        liveStatus: "idle",
      });
      const wrapped = { ...f, input };
      const d = await decisionFor(wrapped, "replace", association.id);
      if (kind === "another-claim" || kind === "released-claim") {
        const claims = createDispatchStore(f.bb.storage.database());
        const other = f.store.tasks.createTask({
          projectId: f.task.projectId,
          title: "Other",
        });
        const claim = claims.reserve({ ...f.input, taskId: other.id });
        claims.update(claim.id, { threadId: selected.id });
        if (kind === "released-claim") claims.release(claim.id, "fixture historical identity");
      }
      if (kind === "correlated-candidate") f.metadata.set(selected.id, { orchestration: null });
      if (kind === "changed-reconciliation")
        f.workers.set(original.id, { ...original, status: "idle" });
      if (kind === "unavailable-history") {
        f.workers.set(original.id, { ...original, status: "idle" });
        f.setReadInterruptions(async () => {
          throw new Error("history unavailable");
        });
      }
      if (kind === "valid") {
        const result = await d.resolve();
        expect(result.outcome).toBe("replaced");
        expect(result.threadId).toBe(selected.id);
        const claims = createDispatchStore(f.bb.storage.database());
        const old = claims.get(input.claimId)!;
        expect(old.associationId).toBe(dispatched.claim!.associationId);
        expect(old.threadId).toBe(original.id);
        expect(old.runId).toBe(input.runId);
        expect(old.releasedAt).not.toBeNull();
        expect(readResolution(old.reason)?.replacementClaimId).toBe(
          result.claim.id,
        );
        expect(claims.live(f.task.id, "implementation")?.threadId).toBe(
          selected.id,
        );
        expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(2);
        expect(f.workers.get(selected.id)?.parentThreadId).toBe(
          "thr_other_parent",
        );
        expect(f.store.tasks.getTask(f.task.id)?.status).toBe("in_progress");
        expect((await f.dispatch()).threadId).toBe(selected.id);
        const comments = f.store.tasks.listComments(f.task.id);
        const retry = await d.resolve();
        expect(retry).toMatchObject({
          outcome: "replaced", threadId: selected.id, claim: result.claim,
        });
        expect(f.store.tasks.listComments(f.task.id)).toEqual(comments);
      } else {
        let result: any = null;
        try {
          result = await d.resolve();
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
        if (result) expect(result.outcome).toBe("unresolved");
        expect(
          createDispatchStore(f.bb.storage.database()).get(input.claimId)
            ?.releasedAt,
        ).toBeNull();
        expect(
          createDispatchStore(f.bb.storage.database()).live(
            f.task.id,
            "implementation",
          )?.threadId,
        ).toBe(original.id);
      }
      effects(f);
    },
  );
});
