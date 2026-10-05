import { describe, expect, it } from "vitest";
import { fixture } from "./dispatch-test-fixture";
import { expectNoAgentInput } from "./dispatch-test-fixture";
import { createDispatchStore } from "./dispatch-store";
import { createDispatcher } from "./dispatch";
import { createRunController } from "./run";

import { historicalAttempt, historicalUnknown } from "./recovery-test-fixture";
async function lostChild() {
  const f = await fixture();
  const dispatched = historicalUnknown(f, "thr_original");
  const input = { ...f.input, claimId: dispatched.claim!.id };
  const reconcile = () => f.harness.behavior.callRpc("orchestrateReconcile", input) as Promise<any>;
  return { ...f, input, reconcile };
}
function noEffects(f: Awaited<ReturnType<typeof fixture>>, spawns = 0) {
  expectNoAgentInput(f.harness);
  expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(spawns);
  for (const method of ["threads.send", "threads.delete", "threads.update", "threads.resume"])
    expect(f.harness.inspection.sdk.callsTo(method as any)).toHaveLength(0);
}

describe("public recovery", () => {
  it.each(["created", "attachment_failed", "creation_unknown"] as const)(
    "repairs %s claim bookkeeping for the verified unchanged original owner",
    async (phase) => {
      const f = await fixture();
      const dispatched = historicalAttempt(f);
      const claims = createDispatchStore(f.bb.storage.database());
      claims.update(dispatched.claim!.id, { phase, reason: "fixture interrupted bookkeeping" });
      const owners = claims.owners(f.task.id);
      const associations = f.store.tasks.listTaskThreads(f.task.id);
      const comments = f.store.tasks.listComments(f.task.id);
      const recovered = (await f.harness.behavior.callRpc("orchestrateReconcile", {
        ...f.input,
        claimId: dispatched.claim!.id,
      })) as any;
      expect(recovered.claim.phase).toBe("attached");
      expect(recovered.threadId).toBe(dispatched.threadId);
      expect((await f.dispatch()).outcome).toBe("deferred");
      expect(claims.owners(f.task.id)).toEqual(owners);
      expect(f.store.tasks.listTaskThreads(f.task.id)).toEqual(associations);
      expect(f.store.tasks.listComments(f.task.id)).toEqual(comments);
      noEffects(f);
    },
  );
  it.each(["retry", "reload"])(
    "preserves stronger recovered history on deferred %s",
    async (mode) => {
      const f = await lostChild();
      const recovered = await f.reconcile();
      const claims = createDispatchStore(f.bb.storage.database());
      const comments = f.store.tasks.listComments(f.task.id);
      const result =
        mode === "retry"
          ? await f.dispatch()
          : await createDispatcher(f.bb, f.store, createRunController(f.bb, f.store)).dispatch(
              f.input,
            );
      expect(result).toMatchObject({ outcome: "deferred", claim: null, threadId: null });
      expect(claims.get(f.input.claimId)).toEqual(recovered.claim);
      expect(f.store.tasks.listComments(f.task.id)).toEqual(comments);
      expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(1);
      noEffects(f);
    },
  );
  it("finds and attaches the active original after response loss, then returns it on retry", async () => {
    const f = await lostChild();
    const recovered = await f.reconcile();
    expect(recovered).toMatchObject({
      outcome: "recovered",
      threadId: "thr_original",
      claim: { phase: "attached" },
    });
    expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(1);
    expect((await f.reconcile()).threadId).toBe("thr_original");
    expect(f.store.tasks.getTask(f.task.id)?.status).toBe("in_progress");
    noEffects(f);
  });
  it.each(["zero", "multiple", "unavailable", "incomplete", "interrupted"])(
    "keeps ambiguous creation unresolved for %s listings",
    async (kind) => {
      const f = await lostChild();
      if (kind === "zero") f.workers.clear();
      if (kind === "multiple") {
        f.workers.set("thr_duplicate", {
          ...f.workers.get("thr_original")!,
          id: "thr_duplicate",
        });
        f.metadata.set("thr_duplicate", f.metadata.get("thr_original"));
      }
      if (kind === "unavailable" || kind === "interrupted")
        f.setListing(async () => {
          throw new Error(kind);
        });
      if (kind === "incomplete")
        f.setListing(async () => Array.from({ length: 101 }, () => f.workers.get("thr_original")!));
      expect((await f.reconcile()).outcome).toBe("unresolved");
      expect(
        createDispatchStore(f.bb.storage.database()).get(f.input.claimId)?.releasedAt,
      ).toBeNull();
      expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(0);
      noEffects(f);
    },
  );
  it.each(["project", "parent", "origin", "task", "role", "run", "attempt"])(
    "refuses unsafe known-worker linking with mismatched %s",
    async (field) => {
      const f = await lostChild();
      const child = f.workers.get("thr_original")!;
      if (["project", "parent", "origin"].includes(field)) {
        f.workers.set(child.id, {
          ...child,
          [field === "project"
            ? "projectId"
            : field === "parent"
              ? "parentThreadId"
              : "originPluginId"]: "foreign",
        });
      } else
        f.metadata.get(child.id).orchestration[field === "role" ? "role" : `${field}Id`] =
          "foreign";
      const linked = (await f.harness.behavior.callRpc("orchestrateLink", {
        ...f.input,
        threadId: child.id,
      })) as any;
      expect(linked.outcome).toBe("unresolved");
      expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(0);
      noEffects(f);
    },
  );
  it("recovers after restart without startup replay or automatic resume", async () => {
    const f = await lostChild();
    const runs = createRunController(f.bb, f.store);
    const restarted = createDispatcher(f.bb, f.store, runs);
    expect(runs.requireContext(f.input.runId, f.input.coordinatorThreadId).phase).toBe(
      "interrupted",
    );
    noEffects(f);
    const result = await restarted.recovery.reconcile(f.input);
    expect(result.outcome).toBe("recovered");
    expect(runs.requireContext(f.input.runId, f.input.coordinatorThreadId).phase).toBe(
      "interrupted",
    );
    expect(await restarted.dispatch(f.input)).toMatchObject({ outcome: "deferred", claim: null });
    noEffects(f);
  });
  it("refuses before creation and can retry after the local refusal is removed", async () => {
    const f = await fixture();
    const blocker = f.store.tasks.createTask({
      projectId: f.task.projectId,
      title: "Open blocker",
    });
    f.store.tasks.addTaskDependency(blocker.id, f.task.id);
    expect((await f.dispatch()).outcome).toBe("deferred");
    expect(
      createDispatchStore(f.bb.storage.database()).live(f.task.id, "implementation"),
    ).toBeNull();
    noEffects(f, 0);
    f.store.tasks.removeTaskDependency(blocker.id, f.task.id);
    expect((await f.dispatch()).outcome).toBe("deferred");
    noEffects(f);
  });
  it("recovers failed local attachment without changing the original child or seeding again", async () => {
    const f = await fixture();
    const dispatched = historicalUnknown(f, "thr_worker");
    const claims = createDispatchStore(f.bb.storage.database());
    claims.update(dispatched.claim.id, { phase: "attachment_failed", threadId: "thr_worker" });
    f.bb.storage
      .database()
      .exec(
        `CREATE TRIGGER refuse_fixture BEFORE INSERT ON task_threads BEGIN SELECT RAISE(ABORT, 'fixture'); END`,
      );
    await expect(
      f.harness.behavior.callRpc("orchestrateReconcile", {
        ...f.input,
        claimId: dispatched.claim.id,
      }),
    ).rejects.toThrow("fixture");
    expect(claims.get(dispatched.claim.id)?.phase).toBe("attachment_failed");
    expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(0);
    f.bb.storage.database().exec("DROP TRIGGER refuse_fixture");
    const output = await f.harness.behavior.runCli(
      [
        "orchestrate",
        "reconcile",
        f.task.key,
        "--run",
        f.input.runId,
        "--claim",
        dispatched.claim!.id,
        "--json",
      ],
      { threadId: "thr_coordinator" },
    );
    expect(JSON.parse(output.stdout!).outcome).toBe("recovered");
    expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(1);
    noEffects(f);
  });
  it("links the exact active original through CLI without changing its parent", async () => {
    const f = await lostChild();
    const result = await f.harness.behavior.runCli(
      [
        "orchestrate",
        "link",
        f.task.key,
        "--run",
        f.input.runId,
        "--claim",
        f.input.claimId,
        "--worker",
        "thr_original",
        "--json",
      ],
      { threadId: "thr_coordinator" },
    );
    expect(JSON.parse(result.stdout!).outcome).toBe("recovered");
    expect(f.workers.get("thr_original")?.parentThreadId).toBe("thr_coordinator");
    noEffects(f);
  });
  it("uses archived and hidden coverage and fails closed when metadata is unavailable", async () => {
    const f = await lostChild();
    f.workers.set("thr_original", {
      ...f.workers.get("thr_original")!,
      archivedAt: Date.now(),
      visibility: "hidden",
    });
    const result = await f.reconcile();
    expect(result.candidates).toEqual(["thr_original"]);
    expect(result.outcome).toBe("unresolved");
    const args = f.harness.inspection.sdk.callsTo("threads.list").map((call) => call[0] as any);
    expect(args.some((arg) => arg.archived && arg.includeHidden)).toBe(true);
    f.harness.sdk.stub("threads.getPluginMetadata", async () => {
      throw new Error("metadata unavailable");
    });
    expect((await f.reconcile()).complete).toBe(false);
    noEffects(f);
  });
  it("keeps a partially attached original association and recovers its designation atomically", async () => {
    const f = await lostChild();
    const association = f.store.tasks.upsertTaskThread({
      taskId: f.task.id,
      threadId: "thr_original",
      title: "Partial",
      presetName: "Fixture",
      liveStatus: "working",
    });
    const result = await f.reconcile();
    expect(result.claim.associationId).toBe(association.id);
    expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(1);
    noEffects(f);
  });
  it("does not link an original with another live task claim", async () => {
    const f = await lostChild();
    const other = f.store.tasks.createTask({
      projectId: f.task.projectId,
      title: "Other claim",
    });
    const claims = createDispatchStore(f.bb.storage.database());
    const conflicting = claims.reserve({ ...f.input, taskId: other.id });
    claims.update(conflicting.id, { threadId: "thr_original" });
    expect((await f.reconcile()).outcome).toBe("unresolved");
    expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(0);
    noEffects(f);
  });
});
