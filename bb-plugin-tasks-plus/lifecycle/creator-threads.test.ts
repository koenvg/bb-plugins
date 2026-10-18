import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import { createStore } from "../api";
import { registerLifecycle } from ".";

function fixture(get: () => Promise<ReturnType<typeof makeThreadResponse>>) {
  const host = createFakePluginHost({ pluginId: "creator-lifecycle", sdk: { threads: { get } } });
  const store = createStore(host.bb);
  const project = store.tasks.createProject({ name: "Lifecycle", prefix: "LC", color: "blue" });
  const task = store.tasks.createTask({
    projectId: project.id,
    title: "Follow-up",
    createdByThreadId: "thr_source",
  });
  const blocked = () => store.tasks.creatorThreadBlockerId(store.tasks.getTask(task.id)!) !== null;
  return { ...host, store, task, blocked };
}

describe("creator thread reconciliation", () => {
  it("reconciles archived creators on startup even without task-thread attachments", async () => {
    const f = fixture(async () => makeThreadResponse({ id: "thr_source", archivedAt: 1 }));
    try {
      expect(f.blocked()).toBe(true);
      await registerLifecycle(f.bb, f.store);
      expect(f.blocked()).toBe(false);
      expect(f.store.tasks.listTasks({ dependency: "ready" }).map((task) => task.id)).toEqual([
        f.task.id,
      ]);
      expect(f.harness.realtimeSignals).toContainEqual({
        channel: "tasks:changed",
        payload: { taskId: f.task.id, projectId: f.task.projectId },
      });
    } finally {
      await f.harness.dispose();
    }
  });

  it("only treats thread_not_found as deletion and fails closed on other SDK errors", async () => {
    let error: unknown = Object.assign(new Error("Gone"), { code: "thread_not_found" });
    const f = fixture(async () => {
      throw error;
    });
    try {
      await registerLifecycle(f.bb, f.store);
      expect(f.blocked()).toBe(false);
      error = Object.assign(new Error("Unavailable"), { code: "unavailable" });
      await f.store.creatorThreads.refresh();
      expect(f.blocked()).toBe(true);
      expect(() => f.store.tasks.updateTask(f.task.id, { status: "todo" })).toThrow("thr_source");
    } finally {
      await f.harness.dispose();
    }
  });

  it("does not let an older SDK response override a newer unarchive event", async () => {
    let resolve!: (thread: ReturnType<typeof makeThreadResponse>) => void;
    const pending = new Promise<ReturnType<typeof makeThreadResponse>>((done) => {
      resolve = done;
    });
    const f = fixture(() => pending);
    try {
      const startup = registerLifecycle(f.bb, f.store);
      await Promise.resolve();
      await f.harness.behavior.emitThreadEvent("thread.unarchived", {
        thread: makeThreadResponse({ id: "thr_source" }),
      });
      resolve(makeThreadResponse({ id: "thr_source", archivedAt: 1 }));
      await startup;
      expect(f.blocked()).toBe(true);
    } finally {
      await f.harness.dispose();
    }
  });

  it("ignores SDK replies after disposal", async () => {
    let resolve!: (thread: ReturnType<typeof makeThreadResponse>) => void;
    const pending = new Promise<ReturnType<typeof makeThreadResponse>>((done) => {
      resolve = done;
    });
    const f = fixture(() => pending);
    const refresh = f.store.creatorThreads.refresh();
    await f.harness.dispose();
    resolve(makeThreadResponse({ id: "thr_source", archivedAt: 1 }));
    await expect(refresh).resolves.toBeUndefined();
  });
});
