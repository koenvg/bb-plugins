import { describe, expect, it, vi } from "vitest";
import {
  makeThreadResponse,
  makeMessageDispatchHookContext,
} from "@get-bb/plugin-sdk/testing";
import { fixture, cleanups } from "./dispatch-test-fixture";
import plugin from "../server";

import { createDispatchStore } from "./dispatch-store";
describe("durable attempts and native admission", () => {
  it.each(["pause", "blocker", "detach", "preset", "claim"])(
    "rechecks %s after a pending native history read",
    async (change) => {
      const f = await fixture();
      const original = await f.dispatch();
      let release!: () => void;
      let pending = false;
      f.setReadInterruptions(async () => {
        pending = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return [];
      });
      const admission = f.hook();
      await vi.waitFor(() => expect(pending).toBe(true));
      if (change === "pause") await f.pause();
      if (change === "blocker") {
        const blocker = f.store.tasks.createTask({
          projectId: f.task.projectId,
          title: "Reopened prerequisite",
        });
        f.store.tasks.addTaskDependency(blocker.id, f.task.id);
      }
      if (change === "detach")
        await f.harness.behavior.callRpc("taskThreadsDetach", {
          taskId: f.task.id,
          threadId: original.threadId,
        });
      if (change === "preset")
        f.store.tasks.updatePreset(f.preset.id, { permissionMode: "full" });
      if (change === "claim")
        createDispatchStore(f.bb.storage.database()).update(
          original.claim!.id,
          {
            phase: "admission_rejected",
            reason: "Another admission rejected this identity",
          },
        );
      release();
      expect((await admission).action).toBe("reject");
      const retained = createDispatchStore(f.bb.storage.database()).get(
        original.claim!.id,
      )!;
      expect(retained).toMatchObject({
        id: original.claim!.id,
        threadId: original.threadId,
        phase: "admission_rejected",
        releasedAt: null,
      });
      expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(1);
      expect(f.harness.inspection.sdk.callsTo("threads.send")).toHaveLength(0);
    },
  );
  it.each(["blocked", "paused"])(
    "refuses ambiguous historical ownership before sender classification: %s",
    async (state) => {
      const f = await fixture(2);
      const original = await f.dispatch();
      const secondTask = f.tasks[1]!;
      await f.harness.behavior.callRpc("taskThreadsAttach", {
        taskId: secondTask.id,
        threadId: original.threadId,
      });
      // Reproduce a state accepted by the old public adoption path without bypassing the new refusal.
      const claims = createDispatchStore(f.bb.storage.database());
      const association = f.store.tasks.getTaskThreadByThreadId(
        secondTask.id,
        original.threadId!,
      )!;
      f.workers.set(
        "thr_other_coordinator",
        makeThreadResponse({
          id: "thr_other_coordinator",
          projectId: "proj_fixture",
          providerId: "pi",
        }),
      );
      const secondRun = await f.approveRun("thr_other_coordinator");
      const other = claims.reserve({
        ...f.input,
        taskId: secondTask.id,
        runId: secondRun.id,
        coordinatorThreadId: secondRun.coordinatorThreadId,
      });
      claims.designate({
        taskId: secondTask.id,
        role: other.role,
        threadId: original.threadId!,
        associationId: association.id,
        runId: other.runId,
      });
      claims.update(other.id, {
        phase: "attached",
        threadId: original.threadId,
        associationId: association.id,
      });
      if (state === "blocked") {
        const blocker = f.store.tasks.createTask({
          projectId: f.task.projectId,
          title: "Second task prerequisite",
        });
        f.store.tasks.addTaskDependency(blocker.id, secondTask.id);
      } else await f.pause();
      for (const senderThreadId of [
        "thr_coordinator",
        "thr_other_coordinator",
        null,
      ]) {
        const context = makeMessageDispatchHookContext({
          thread: f.workers.get(original.threadId!)!,
          origin: null,
          originPluginId: null,
          senderThreadId,
          requestedExecution: {
            providerId: "pi",
            model: "fixture",
            reasoningLevel: "high",
            permissionMode: "auto",
            serviceTier: null,
          },
        });
        const result =
          await f.harness.registrations.hooks["message.dispatch"]!(context);
        expect(result.action).toBe("reject");
        expect((result as any).message).toMatch(/ambiguous/i);
      }
      if (state === "blocked")
        expect((await f.dispatch()).outcome).toBe("resolution_needed");
      else await expect(f.dispatch()).rejects.toThrow("Pause");
      expect(claims.get(original.claim!.id)?.releasedAt).toBeNull();
      expect(claims.get(other.id)?.releasedAt).toBeNull();
      expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(1);
      expect(f.harness.inspection.sdk.callsTo("threads.send")).toHaveLength(0);
    },
  );
  it("records a child admitted before attachment when its response is lost", async () => {
    const f = await fixture();
    f.setCreate(async (args) => {
      const thread = makeThreadResponse({
        id: "thr_worker",
        projectId: args.projectId,
        parentThreadId: args.parentThreadId,
        originPluginId: f.bb.pluginId,
        status: "pending",
      });
      f.workers.set(thread.id, thread);
      f.metadata.set(thread.id, args.pluginMetadata);
      expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(0);
      expect((await f.hook()).action).toBe("proceed");
      throw new Error("Response lost after admission");
    });
    const lost = await f.dispatch();
    expect(lost.outcome).toBe("unresolved");
    expect(lost.claim?.threadId).toBe("thr_worker");
    expect((await f.dispatch()).claim?.id).toBe(lost.claim?.id);
    expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(1);
  });
  it("rolls back ownership, association and status together and retries only attachment", async () => {
    const f = await fixture();
    f.bb.storage
      .database()
      .exec(
        "CREATE TRIGGER fail_attachment BEFORE UPDATE OF status ON tasks BEGIN SELECT RAISE(ABORT,'fixture attachment failure'); END",
      );
    const failed = await f.dispatch();
    expect(failed.outcome).toBe("unresolved");
    expect(failed.claim?.phase).toBe("attachment_failed");
    expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(0);
    expect(f.store.tasks.getTask(f.task.id)?.status).toBe("backlog");
    f.bb.storage.database().exec("DROP TRIGGER fail_attachment");
    expect((await f.dispatch()).outcome).toBe("created");
    expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(1);
  });
  it("preserves the original claim after native rejection before spawn returns", async () => {
    const f = await fixture();
    f.setCreate(async (args) => {
      const thread = makeThreadResponse({
        id: "thr_worker",
        projectId: args.projectId,
        parentThreadId: args.parentThreadId,
        originPluginId: f.bb.pluginId,
      });
      f.workers.set(thread.id, thread);
      f.metadata.set(thread.id, args.pluginMetadata);
      await f.pause();
      expect((await f.hook()).action).toBe("reject");
      return thread;
    });
    const result = await f.dispatch();
    expect(result.outcome).toBe("unresolved");
    expect(result.claim?.phase).toBe("admission_rejected");
    expect(result.threadId).toBe("thr_worker");
    expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(0);
  });
  it("refuses unknown prerequisite handoffs after done or canceled", async () => {
    const f = await fixture();
    const blocker = f.store.tasks.createTask({
      projectId: f.task.projectId,
      title: "Required artifact",
    });
    f.store.tasks.addTaskDependency(blocker.id, f.task.id);
    for (const status of ["done", "canceled"] as const) {
      f.store.tasks.updateTask(blocker.id, { status });
      await expect(f.dispatch()).rejects.toThrow("handoffs");
    }
    expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(0);
  });
  it("rechecks paused runs on delayed admission without automatic resume", async () => {
    const f = await fixture();
    await f.dispatch();
    expect((await f.hook()).action).toBe("proceed");
    await f.pause();
    await expect(f.dispatch()).rejects.toThrow("Pause");
    expect((await f.hook()).action).toBe("reject");
    expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(1);
    expect(
      f.harness.inspection.sdk.callsTo("experimental_hooks.recheck"),
    ).toHaveLength(0);
  });
  it("projects reloaded active runs as interrupted and preserves claims without sends", async () => {
    const f = await fixture();
    f.setCreate(async () => {
      throw new Error("unknown");
    });
    const before = await f.dispatch();
    const reloaded = await f.harness.lifecycle.reload(plugin);
    cleanups.push(() => reloaded.harness.lifecycle.dispose());
    const status = (await reloaded.harness.behavior.callRpc(
      "orchestrateStatus",
      { epicId: f.epic.id },
    )) as any;
    expect(status.status.run.value.phase).toBe("interrupted");
    expect(status.status.subtasks[0].dispatch.value[0].id).toBe(
      before.claim?.id,
    );
    await expect(
      reloaded.harness.behavior.callRpc("orchestrateDispatch", f.input),
    ).rejects.toThrow("interruption");
    expect(
      reloaded.harness.inspection.sdk.callsTo("threads.spawn"),
    ).toHaveLength(0);
  });
  it.each(["scope", "preset", "project", "coordinator", "task"])(
    "rechecks %s before admission",
    async (mode) => {
      const f = await fixture();
      await f.dispatch();
      if (mode === "scope")
        f.store.tasks.updateTask(f.task.id, { description: "Changed" });
      if (mode === "preset")
        f.store.tasks.updatePreset(f.preset.id, { permissionMode: "full" });
      if (mode === "project")
        f.store.tasks.updateProject(f.task.projectId, {
          linkedBbProjectId: "proj_other",
        });
      if (mode === "coordinator") f.setCoordinatorProject("proj_other");
      if (mode === "task")
        f.store.tasks.updateTask(f.task.id, { status: "done" });
      await expect(f.dispatch()).rejects.toThrow();
      expect((await f.hook()).action).toBe("reject");
      expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(1);
    },
  );
  it("guards coordinator continuations and keeps accepted independent work separate", async () => {
    const f = await fixture();
    await f.dispatch();
    await f.pause();
    const context = makeMessageDispatchHookContext({
      thread: f.workers.get("thr_worker")!,
      origin: null,
      originPluginId: null,
      senderThreadId: "thr_coordinator",
    });
    const independent = {
      ...context,
      senderThreadId: null,
      queuedMessages: [],
    };
    expect(
      (await f.harness.registrations.hooks["message.dispatch"]!(independent))
        .action,
    ).toBe("proceed");
    expect(
      (await f.harness.registrations.hooks["message.dispatch"]!(context))
        .action,
    ).toBe("reject");
    expect(
      (await f.harness.registrations.hooks["message.dispatch"]!(independent))
        .action,
    ).toBe("reject");
  });
  it("does not accept metadata as authority for a fabricated attempt", async () => {
    const f = await fixture();
    f.workers.set(
      "thr_forged",
      makeThreadResponse({
        id: "thr_forged",
        projectId: "proj_fixture",
        parentThreadId: "thr_coordinator",
        originPluginId: f.bb.pluginId,
      }),
    );
    f.metadata.set("thr_forged", {
      orchestration: {
        version: 1,
        attemptId: "fake",
        taskId: f.task.id,
        role: "implementation",
        runId: f.input.runId,
        coordinatorThreadId: "thr_coordinator",
        bbProjectId: "proj_fixture",
      },
    });
    expect((await f.hook("thr_forged")).action).toBe("reject");
  });
  it("accepts the native default tier when the preset leaves it unspecified", async () => {
    const f = await fixture();
    await f.dispatch();
    const context = makeMessageDispatchHookContext({
      thread: f.workers.get("thr_worker")!,
      parentThreadId: "thr_coordinator",
      origin: "plugin",
      originPluginId: f.bb.pluginId,
      requestedExecution: {
        providerId: "pi",
        model: "fixture",
        reasoningLevel: "high",
        permissionMode: "auto",
        serviceTier: "default",
      },
    });
    expect(
      (await f.harness.registrations.hooks["message.dispatch"]!(context))
        .action,
    ).toBe("proceed");
  });
  it("keeps legacy manual blocked dispatch warning behavior", async () => {
    const f = await fixture();
    const blocker = f.store.tasks.createTask({
      projectId: f.task.projectId,
      title: "Legacy blocker",
    });
    f.store.tasks.addTaskDependency(blocker.id, f.task.id);
    const legacy = await f.harness.behavior.runCli([
      "dispatch",
      f.task.key,
      "--preset",
      f.preset.id,
      "--json",
    ]);
    expect(legacy.exitCode).toBe(0);
    expect(JSON.parse(legacy.stdout!).warnings).toHaveLength(1);
    expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(1);
  });
  it("rejects a queued first turn after manual owner detachment", async () => {
    const f = await fixture();
    await f.dispatch();
    await f.harness.behavior.callRpc("taskThreadsDetach", {
      taskId: f.task.id,
      threadId: "thr_worker",
    });
    expect((await f.hook()).action).toBe("reject");
  });
  it("rechecks mixed queued groups that contain an orchestration first turn", async () => {
    const f = await fixture();
    await f.dispatch();
    await f.pause();
    const context = makeMessageDispatchHookContext({
      thread: f.workers.get("thr_worker")!,
      origin: "mixed",
      originPluginId: "mixed",
      senderThreadId: "mixed",
      queuedMessages: [
        {
          origin: "plugin",
          originPluginId: f.bb.pluginId,
          senderThreadId: null,
        },
        { origin: null, originPluginId: null, senderThreadId: null },
      ],
    });
    expect(
      (await f.harness.registrations.hooks["message.dispatch"]!(context))
        .action,
    ).toBe("reject");
  });
  it("refuses when the native project lookup cannot establish current facts", async () => {
    const f = await fixture();
    f.harness.sdk.stub("projects.get", async () => {
      throw new Error("project missing");
    });
    await expect(f.dispatch()).rejects.toThrow("project missing");
    expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(0);
  });
  it("never raises the approved execution ceiling on a queued turn", async () => {
    const f = await fixture();
    await f.dispatch();
    const context = makeMessageDispatchHookContext({
      thread: f.workers.get("thr_worker")!,
      parentThreadId: "thr_coordinator",
      origin: "plugin",
      originPluginId: f.bb.pluginId,
      requestedExecution: {
        providerId: "pi",
        model: "fixture",
        reasoningLevel: "high",
        permissionMode: "full",
        serviceTier: "default",
      },
    });
    expect(
      (await f.harness.registrations.hooks["message.dispatch"]!(context))
        .action,
    ).toBe("reject");
    expect((await f.dispatch()).outcome).toBe("resolution_needed");
  });
  it.each(["provider", "version"])(
    "refuses a changed unverified %s path",
    async (change) => {
      const f = await fixture();
      if (change === "provider")
        f.harness.sdk.stub("threads.get", async () =>
          makeThreadResponse({
            id: "thr_coordinator",
            projectId: "proj_fixture",
            providerId: "codex",
          }),
        );
      else
        f.harness.sdk.stub("system.version", async () => ({
          currentVersion: "0.44.1",
        }));
      await expect(f.dispatch()).rejects.toThrow("verified");
      expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(0);
    },
  );
});
