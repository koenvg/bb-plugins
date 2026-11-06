import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import { createStore } from "../api";
import {
  registerLifecycle,
  THREAD_STATUS_IDLE_INTERVAL_MS,
  THREAD_STATUS_RECONCILE_INTERVAL_MS,
} from ".";

function fixture() {
  const host = createFakePluginHost({
    pluginId: "creator-lifecycle",
    sdk: {
      threads: {
        get: async ({ threadId }) => makeThreadResponse({ id: threadId, status: "active" }),
      },
    },
  });
  const store = createStore(host.bb);
  const project = store.tasks.createProject({ name: "Lifecycle", prefix: "LC", color: "blue" });
  const task = store.tasks.createTask({
    projectId: project.id,
    title: "Follow-up",
    createdByThreadId: "thr_source",
  });
  return { ...host, store, task };
}

describe("creator attribution and attached worker lifecycle", () => {
  it("never reconciles creator-only relations on startup, polling or creator events", async () => {
    vi.useFakeTimers();
    const f = fixture();
    try {
      await registerLifecycle(f.bb, f.store);
      const service = f.harness.runService("thread-status-reconcile");
      await vi.advanceTimersByTimeAsync(
        THREAD_STATUS_IDLE_INTERVAL_MS + THREAD_STATUS_RECONCILE_INTERVAL_MS,
      );
      for (const event of ["thread.archived", "thread.unarchived", "thread.deleted"] as const) {
        await f.harness.emitThreadEvent(event, {
          thread: makeThreadResponse({ id: "thr_source" }),
        });
      }
      expect(f.harness.sdk.callsTo("threads.get")).toEqual([]);
      expect(f.harness.realtimeSignals).toEqual([]);
      expect(f.store.tasks.getTask(f.task.id)).toEqual(f.task);
      expect(f.store.tasks.listTasks({ dependency: "ready" }).map((task) => task.id)).toEqual([
        f.task.id,
      ]);
      service.controller.abort();
      await service.done;
    } finally {
      await f.harness.dispose();
      vi.useRealTimers();
    }
  });

  for (const threadId of ["thr_source", "thr_worker"]) {
    it(`reconciles and completes attached worker ${threadId} independently of attribution`, async () => {
      const f = fixture();
      try {
        const worker = f.store.tasks.upsertTaskThread({
          taskId: f.task.id,
          threadId,
          title: "Worker",
          presetName: "Fixture",
          liveStatus: "starting",
        });
        await registerLifecycle(f.bb, f.store);
        expect(f.harness.sdk.callsTo("threads.get")).toEqual([[{ threadId }]]);
        expect(f.store.tasks.getTaskThread(worker.id)?.liveStatus).toBe("working");
        await f.harness.emitThreadEvent("thread.deleted", {
          thread: makeThreadResponse({ id: threadId, deletedAt: 1 }),
        });
        expect(f.store.tasks.getTaskThread(worker.id)?.liveStatus).toBe("completed");
        expect(f.store.tasks.getTask(f.task.id)).toMatchObject({
          status: "backlog",
          createdByThreadId: "thr_source",
        });
        expect(f.harness.realtimeSignals).toContainEqual({
          channel: "threads:changed",
          payload: { taskId: f.task.id },
        });
        expect(f.harness.realtimeSignals.some((signal) => signal.channel === "tasks:changed")).toBe(
          false,
        );
      } finally {
        await f.harness.dispose();
      }
    });
  }
});
