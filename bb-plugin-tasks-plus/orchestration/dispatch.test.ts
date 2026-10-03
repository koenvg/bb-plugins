import { describe, expect, it, vi } from "vitest";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { fixture } from "./dispatch-test-fixture";

describe("safe dispatch public contracts", () => {
  it("reserves one claim before concurrent creation and reuses the same owner without sends", async () => {
    const f = await fixture();
    let release!: () => void;
    f.setCreate(async (args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      const thread = makeThreadResponse({
        id: "thr_worker",
        projectId: args.projectId,
        parentThreadId: args.parentThreadId,
        originPluginId: f.bb.pluginId,
      });
      f.workers.set(thread.id, thread);
      f.metadata.set(thread.id, args.pluginMetadata);
      return thread;
    });
    const first = f.dispatch();
    await vi.waitFor(() =>
      expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(1),
    );
    expect((await f.dispatch()).outcome).toBe("unresolved");
    release();
    expect((await first).outcome).toBe("created");
    const reused = await f.dispatch();
    expect(reused.outcome).toBe("reused");
    expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(1);
    expect(f.harness.inspection.sdk.callsTo("threads.send")).toHaveLength(0);
    expect(f.store.tasks.getTask(f.task.id)?.status).toBe("in_progress");
    const args = f.harness.inspection.sdk.callsTo(
      "threads.spawn",
    )[0]![0] as any;
    expect(args.parentThreadId).toBe("thr_coordinator");
    expect(args.pluginMetadata.orchestration.taskId).toBe(f.task.id);
    expect(args.reasoningLevel).toBe("high");
    expect(args.permissionMode).toBe("auto");
    expect(args.prompt).not.toContain("Your thread is already attached");
    expect(args.prompt).toContain("Local attachment can still be pending");
  });
  it("keeps unknown creation durable and visible before attachment", async () => {
    const f = await fixture();
    f.setCreate(async () => {
      throw new Error("lost response");
    });
    expect((await f.dispatch()).outcome).toBe("unresolved");
    expect((await f.dispatch()).outcome).toBe("unresolved");
    const status = (await f.harness.behavior.callRpc("orchestrateStatus", {
      epicId: f.epic.id,
    })) as any;
    expect(status.status.subtasks[0].dispatch.value[0].phase).toBe(
      "creation_unknown",
    );
    expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(1);
  });
  it("refuses open blockers without a claim and refuses a reopened blocker at queued admission", async () => {
    const f = await fixture();
    const blocker = f.store.tasks.createTask({
      projectId: f.task.projectId,
      title: "Prerequisite",
    });
    f.store.tasks.addTaskDependency(blocker.id, f.task.id);
    await expect(f.dispatch()).rejects.toThrow();
    expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(0);
    f.store.tasks.removeTaskDependency(blocker.id, f.task.id);
    await f.dispatch();
    f.store.tasks.addTaskDependency(blocker.id, f.task.id);
    expect((await f.hook()).action).toBe("reject");
    await expect(f.dispatch()).rejects.toThrow("Native blockers");
    expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(1);
  });
});
