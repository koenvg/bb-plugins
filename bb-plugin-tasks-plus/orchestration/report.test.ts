import { describe, expect, it } from "vitest";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { reportFixture } from "./report-test-fixture";
import { createReportStore } from "./report-store";
import { createDispatchStore } from "./dispatch-store";
import { correlationSchema } from "./dispatch-contract";
import plugin from "../server";

describe("explicit worker reports", () => {
  it.each(["completed", "review_ready", "blocked", "failed", "needs_decision"])(
    "records %s and a readable linked comment without task-status inference",
    async (outcome) => {
      const f = await reportFixture();
      const report = await f.report({
        outcome,
        ...(outcome === "needs_decision" ? { question: "Which baseline?" } : {}),
      });
      expect(report).toMatchObject({
        outcome,
        taskId: f.task.id,
        taskKey: f.task.key,
        threadId: "thr_worker",
        runId: f.input.runId,
        role: "implementation",
      });
      expect(report.associationId).toBe(f.store.tasks.listTaskThreads(f.task.id)[0]!.id);
      expect(f.store.tasks.getTask(f.task.id)?.status).toBe("in_progress");
      expect(f.store.tasks.getTask(f.epic.id)?.status).toBe("backlog");
      const comment = f.store.tasks
        .listComments(f.task.id)
        .find((comment) => comment.id === report.commentId)!;
      expect(comment.body).toContain(`report:${report.id}`);
      expect(comment.body).toContain("@thread:thr_worker");
      expect(comment.body).toContain("abc123");
      expect(comment.notifiedCount).toBe(0);
      expect(
        await f.harness.behavior.callRpc("readWorkerReport", {
          reportId: report.id,
        }),
      ).toEqual(report);
      const read = createReportStore(f.bb.storage.database());
      expect(read.getForRun(report.id, f.input.runId)).toEqual(report);
      expect(read.getForRun(report.id, "other-run")).toBeNull();
    },
  );
  it("deduplicates concurrent/ordinary retries and rejects conflicting identities", async () => {
    const f = await reportFixture();
    const reports = await Promise.all([f.report(), f.report()]);
    expect(reports[0]!.id).toBe(reports[1]!.id);
    expect((await f.report()).id).toBe(reports[0]!.id);
    expect(f.harness.sdk.callsTo("threads.send")).toHaveLength(0);
    expect(
      f.store.tasks.listComments(f.task.id).filter((row) => row.body.startsWith("Worker report")),
    ).toHaveLength(1);
    await expect(f.report({ summary: "Different result" })).rejects.toThrow(
      /different immutable payload/,
    );
    await expect(f.report({ taskId: f.tasks[0]!.id, outcome: "failed" })).rejects.toThrow(
      /different immutable payload/,
    );
  });
  it("retains immutable provenance and identical retry after detach, but refuses new reports", async () => {
    const f = await reportFixture();
    const before = await f.report();
    await f.detach();
    expect(await f.report()).toEqual(before);
    expect(
      await f.harness.behavior.callRpc("readWorkerReport", {
        reportId: before.id,
      }),
    ).toEqual(before);
    await expect(f.report({ key: "new-after-detach" })).rejects.toThrow(/claim|context|worker/i);
    expect(f.harness.sdk.callsTo("threads.send")).toHaveLength(0);
  });
  it("accepts only the actual attached owner, never supplied thread IDs", async () => {
    const f = await reportFixture(2);
    f.workers.set(
      "thr_wrong",
      makeThreadResponse({
        id: "thr_wrong",
        providerId: "codex",
        projectId: "proj_fixture",
      }),
    );
    await expect(f.report({}, { ...f.nativeContext, threadId: "thr_wrong" })).rejects.toThrow(
      /worker|context/i,
    );
    await expect(f.report({ threadId: "thr_wrong" })).rejects.toThrow();
    await expect(f.report({ taskId: f.tasks[1]!.id })).rejects.toThrow(/claim|context|worker/i);
    await expect(f.report({}, { ...f.nativeContext, projectId: "proj_other" })).rejects.toThrow(
      /project|context/i,
    );
    expect(createReportStore(f.bb.storage.database()).latest(f.task.id)).toBeNull();
  });
  it("rejects a wrong attached non-owner and plural claims", async () => {
    const f = await reportFixture(2);
    f.workers.set(
      "thr_wrong",
      makeThreadResponse({
        id: "thr_wrong",
        providerId: "codex",
        projectId: "proj_fixture",
      }),
    );
    f.store.tasks.upsertTaskThread({
      taskId: f.task.id,
      threadId: "thr_wrong",
      presetName: "Attached",
      title: "Other",
      liveStatus: "working",
    });
    await expect(f.report({}, { ...f.nativeContext, threadId: "thr_wrong" })).rejects.toThrow(
      /owner|claim/,
    );
    const claims = createDispatchStore(f.bb.storage.database());
    const second = claims.reserve({ ...f.input, taskId: f.tasks[1]!.id });
    claims.update(second.id, { threadId: "thr_worker" });
    await expect(f.report()).rejects.toThrow(/ambiguous/);
    expect(claims.forThread("thr_worker")).toHaveLength(2);
  });
  it("records retained pre-attachment activity without attaching or retagging its original claim", async () => {
    const f = await reportFixture(1, false);
    const claims = createDispatchStore(f.bb.storage.database());
    const claim = claims.reserve(f.input);
    claims.update(claim.id, { phase: "creating" });
    f.workers.set(
      "thr_worker",
      makeThreadResponse({
        id: "thr_worker",
        providerId: "codex",
        projectId: "proj_fixture",
        parentThreadId: "thr_coordinator",
        originPluginId: f.bb.pluginId,
        createdAt: Date.now(),
      }),
    );
    f.metadata.set("thr_worker", {
      orchestration: {
        version: 1,
        attemptId: claim.id,
        taskId: f.task.id,
        role: "implementation",
        runId: f.input.runId,
        coordinatorThreadId: "thr_coordinator",
        bbProjectId: "proj_fixture",
      },
    });
    const report = await f.report({ outcome: "needs_decision", question: "Need baseline choice" });
    expect(report).toMatchObject({ associationId: null, claimId: claim.id, runId: f.input.runId });
    expect(claims.get(claim.id)?.threadId).toBeNull();
    expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(0);
    expect(f.harness.sdk.callsTo("threads.spawn")).toHaveLength(0);
    expect(f.harness.sdk.callsTo("threads.send")).toHaveLength(0);
  });
  it.each([
    "wrong-metadata",
    "wrong-parent",
    "wrong-native-origin",
    "old-worker",
    "duplicate-native",
    "released-claim",
  ])("refuses recoverable spoof/conflict %s", async (fault) => {
    const f = await reportFixture(1, false);
    const claims = createDispatchStore(f.bb.storage.database());
    const claim = claims.reserve(f.input);
    claims.update(claim.id, { phase: "creating" });
    const worker = makeThreadResponse({
      id: "thr_worker",
      providerId: "codex",
      projectId: "proj_fixture",
      originPluginId: fault === "wrong-native-origin" ? "other-plugin" : f.bb.pluginId,
      parentThreadId: fault === "wrong-parent" ? "thr_other" : "thr_coordinator",
      createdAt: fault === "old-worker" ? 0 : Date.now(),
    });
    f.workers.set(worker.id, worker);
    f.metadata.set(worker.id, {
      orchestration: correlationSchema.parse({
        version: 1,
        attemptId: claim.id,
        taskId: f.task.id,
        role: "implementation",
        runId: fault === "wrong-metadata" ? "forged" : f.input.runId,
        coordinatorThreadId: "thr_coordinator",
        bbProjectId: "proj_fixture",
      }),
    });
    if (fault === "duplicate-native") {
      f.workers.set("thr_duplicate", makeThreadResponse({ ...worker, id: "thr_duplicate" }));
      f.metadata.set("thr_duplicate", f.metadata.get(worker.id));
    }
    if (fault === "released-claim")
      f.bb.storage
        .database()
        .prepare("UPDATE orchestration_dispatch_claims SET released_at=? WHERE id=?")
        .run(new Date().toISOString(), claim.id);
    await expect(f.report()).rejects.toThrow(/context|claim|worker/i);
    expect(createReportStore(f.bb.storage.database()).latest(f.task.id)).toBeNull();
    expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(0);
    expect(f.harness.sdk.callsTo("threads.spawn")).toHaveLength(0);
  });
  it("rolls back the linked comment when report persistence fails", async () => {
    const f = await reportFixture();
    const before = f.store.tasks.listComments(f.task.id).length;
    f.bb.storage
      .database()
      .exec(
        "CREATE TRIGGER fixture_report_failure BEFORE INSERT ON orchestration_reports BEGIN SELECT RAISE(ABORT,'fixture report failure'); END;",
      );
    await expect(f.report()).rejects.toThrow(/fixture report failure/);
    expect(f.store.tasks.listComments(f.task.id)).toHaveLength(before);
  });
  it("starts no report deliveries or writes on reload", async () => {
    const f = await reportFixture();
    const report = await f.report();
    const count = f.harness.sdk.callsTo("threads.send").length;
    const reloaded = await f.harness.lifecycle.reload(plugin);
    expect(f.harness.sdk.callsTo("threads.send")).toHaveLength(count);
    expect(reloaded.harness.sdk.callsTo("threads.send")).toHaveLength(0);
    expect(
      await reloaded.harness.behavior.callRpc("readWorkerReport", {
        reportId: report.id,
      }),
    ).toEqual(report);
    expect(
      (
        (await reloaded.harness.behavior.callRpc("orchestrateStatus", {
          epicId: f.epic.id,
        })) as any
      ).status.run.value.phase,
    ).toBe("interrupted");
    await reloaded.harness.lifecycle.dispose();
  });
});
