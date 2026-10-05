import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import { createStore, registerTasksApi } from "./index.js";
import { createWorkStatusReader, WORK_STATUS_REFRESH_THREAD_LIMIT } from "./work-status.js";

const refreshId = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

function setup(
  get = vi.fn(async ({ threadId }: { threadId: string }) =>
    makeThreadResponse({ id: threadId, status: "idle" }),
  ),
) {
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks",
    sdk: { threads: { get } },
  });
  const store = createStore(bb);
  const project = store.tasks.createProject({
    name: "Work",
    prefix: "WRK",
    color: "blue",
  });
  const task = store.tasks.createTask({
    projectId: project.id,
    title: "Work",
    status: "in_review",
  });
  registerTasksApi(bb, store);
  const attach = (threadId: string, taskId = task.id) =>
    store.tasks.upsertTaskThread({
      taskId,
      threadId,
      presetName: "Worker",
      title: threadId,
      liveStatus: "completed",
    });
  return { bb, harness, store, project, task, attach, get };
}

describe("read-only task work status", () => {
  it("normalizes all execution states and isolates unreadable items without trusting completed cache", async () => {
    const statuses = {
      pending: "starting",
      starting: "starting",
      active: "working",
      stopping: "working",
      idle: "idle",
      error: "failed",
    } as const;
    const get = vi.fn(async ({ threadId }: { threadId: string }) => {
      const status = threadId.slice(4);
      if (status === "unreadable") throw new Error("offline");
      return makeThreadResponse({
        id: threadId,
        title: `Current ${status}`,
        status: status as keyof typeof statuses,
      });
    });
    const { harness, store, task, attach } = setup(get);
    for (const status of [...Object.keys(statuses), "unreadable"]) attach(`thr_${status}`);
    const before = store.tasks.listTaskThreads(task.id);
    const result = (await harness.behavior.callRpc("listTaskWorkStatus", {
      taskIds: [task.id],
    })) as {
      byTaskId: Record<
        string,
        { threads: { threadId: string; execution: string; title: string }[] }
      >;
    };
    const threads = result.byTaskId[task.id]!.threads;
    for (const [status, execution] of Object.entries(statuses))
      expect(threads.find((t) => t.threadId === `thr_${status}`)).toMatchObject({
        execution,
        title: `Current ${status}`,
      });
    expect(threads.find((t) => t.threadId === "thr_unreadable")).toMatchObject({
      execution: "unavailable",
      title: "thr_unreadable",
    });
    expect(store.tasks.listTaskThreads(task.id)).toEqual(before);
    expect(store.tasks.getTask(task.id)!.status).toBe("in_review");
    expect(
      harness.inspection.sdk.calls.every((c) => ["threads.get", "plugins.list"].includes(c.path)),
    ).toBe(true);
    expect(harness.realtimeSignals).toEqual([]);
    await harness.lifecycle.dispose();
  });

  it("accepts empty and duplicate inputs, returns explicit unknown tasks, and rejects invalid or over-500 unique IDs", async () => {
    const { harness, task, attach, get } = setup();
    attach("thr_shared");
    expect(await harness.behavior.callRpc("listTaskWorkStatus", { taskIds: [] })).toEqual({
      byTaskId: {},
    });
    const unknown = "01HZZZZZZZZZZZZZZZZZZZZZZZ";
    const result = (await harness.behavior.callRpc("listTaskWorkStatus", {
      taskIds: [...Array(501).fill(task.id), unknown],
    })) as { byTaskId: Record<string, unknown> };
    expect(Object.keys(result.byTaskId)).toEqual([task.id, unknown]);
    expect(result.byTaskId[unknown]).toMatchObject({
      availability: "unavailable",
      threads: [],
    });
    expect(get).toHaveBeenCalledTimes(1);
    await expect(
      harness.behavior.callRpc("listTaskWorkStatus", { taskIds: ["bad"] }),
    ).rejects.toThrow();
    await expect(
      harness.behavior.callRpc("listTaskWorkStatus", {
        taskIds: Array.from({ length: 501 }, (_, i) => `01H${String(i).padStart(23, "0")}`),
      }),
    ).rejects.toThrow();
    await harness.lifecycle.dispose();
  });

  it("deduplicates threads across tasks and concurrent batches and caps all SDK reads at eight", async () => {
    let active = 0,
      peak = 0;
    const releases: (() => void)[] = [];
    const get = vi.fn(async ({ threadId }: { threadId: string }) => {
      peak = Math.max(peak, ++active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return makeThreadResponse({ id: threadId, status: "active" });
    });
    const { bb, store, project, task, attach, harness } = setup(get);
    const other = store.tasks.createTask({
      projectId: project.id,
      title: "Other",
    });
    for (let i = 0; i < 18; i++) {
      attach(`thr_${i}`);
      attach(`thr_${i}`, other.id);
    }
    const read = createWorkStatusReader({
      store: store.tasks,
      threads: bb.sdk.threads,
      now: () => new Date("2026-10-02T00:00:00Z"),
    });
    const a = read([task.id, other.id]);
    const b = read([other.id]);
    await vi.waitFor(() => expect(active).toBe(8));
    while (get.mock.calls.length < 18 || active) {
      releases.splice(0).forEach((resolve) => resolve());
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const [first, second] = await Promise.all([a, b]);
    expect(peak).toBe(8);
    expect(get).toHaveBeenCalledTimes(18);
    expect(first.byTaskId[task.id]!.threads).toEqual(second.byTaskId[other.id]!.threads);
    expect(first.byTaskId[task.id]!.observedAt).toBe("2026-10-02T00:00:00.000Z");
    await harness.lifecycle.dispose();
  });

  it("distinguishes confirmed removal from generic lookup errors and never infers archive from either", async () => {
    const get = vi.fn(async ({ threadId }: { threadId: string }) => {
      if (threadId === "thr_missing")
        throw Object.assign(new Error("Thread missing"), {
          code: "thread_not_found",
        });
      if (threadId === "thr_error") throw new Error("not found");
      return makeThreadResponse({
        id: threadId,
        status: "error",
        archivedAt: 1,
        deletedAt: 0,
      });
    });
    const { harness, store, task, attach } = setup(get);
    ["thr_missing", "thr_error", "thr_deleted"].forEach((t) => attach(t));
    const before = store.tasks.listTaskThreads(task.id);
    expect(
      await harness.behavior.callRpc("listTaskWorkStatus", {
        taskIds: [task.id],
      }),
    ).toMatchObject({
      byTaskId: {
        [task.id]: {
          threads: expect.arrayContaining([
            expect.objectContaining({
              threadId: "thr_missing",
              execution: "removed",
              archive: "unknown",
            }),
            expect.objectContaining({
              threadId: "thr_deleted",
              execution: "removed",
              archive: "unknown",
            }),
            expect.objectContaining({
              threadId: "thr_error",
              execution: "unavailable",
              archive: "unknown",
            }),
          ]),
        },
      },
    });
    expect(store.tasks.listTaskThreads(task.id)).toEqual(before);
    expect(store.tasks.getTask(task.id)!.status).toBe("in_review");
    expect(harness.realtimeSignals).toEqual([]);
    await harness.lifecycle.dispose();
  });

  it("preserves readable execution with unknown archive fields and rejects unknown existence", async () => {
    const get = vi.fn(async ({ threadId }: { threadId: string }) => {
      const thread = makeThreadResponse({
        id: threadId,
        status: "idle",
        archivedAt: 1,
      });
      if (threadId === "thr_unknown_existence") Reflect.deleteProperty(thread, "deletedAt");
      else Reflect.deleteProperty(thread, "archivedAt");
      return thread;
    });
    const { harness, task, attach } = setup(get);
    ["thr_unknown_archive", "thr_unknown_existence"].forEach((t) => attach(t));
    expect(
      await harness.behavior.callRpc("listTaskWorkStatus", {
        taskIds: [task.id],
      }),
    ).toMatchObject({
      byTaskId: {
        [task.id]: {
          threads: expect.arrayContaining([
            expect.objectContaining({
              threadId: "thr_unknown_archive",
              execution: "idle",
              archive: "unknown",
            }),
            expect.objectContaining({
              threadId: "thr_unknown_existence",
              execution: "unavailable",
              archive: "unknown",
            }),
          ]),
        },
      },
    });
    await harness.lifecycle.dispose();
  });

  it("hydrates archive independently of failed runtime without changing completed attachments or workflow", async () => {
    const get = vi.fn(async ({ threadId }: { threadId: string }) =>
      makeThreadResponse({
        id: threadId,
        status: "error",
        archivedAt: threadId === "thr_archived" ? 1 : null,
      }),
    );
    const { harness, store, task, attach } = setup(get);
    ["thr_archived", "thr_unarchived"].forEach((t) => attach(t));
    const before = store.tasks.listTaskThreads(task.id);
    const result = await harness.behavior.callRpc("listTaskWorkStatus", {
      taskIds: [task.id],
    });
    expect(result).toMatchObject({
      byTaskId: {
        [task.id]: {
          threads: expect.arrayContaining([
            expect.objectContaining({
              threadId: "thr_archived",
              execution: "failed",
              archive: "archived",
            }),
            expect.objectContaining({
              threadId: "thr_unarchived",
              execution: "failed",
              archive: "unarchived",
            }),
          ]),
        },
      },
    });
    expect(store.tasks.listTaskThreads(task.id)).toEqual(before);
    expect(store.tasks.getTask(task.id)!.status).toBe("in_review");
    expect(
      harness.inspection.sdk.calls.every((c) => ["threads.get", "plugins.list"].includes(c.path)),
    ).toBe(true);
    expect(harness.realtimeSignals).toEqual([]);
    await harness.lifecycle.dispose();
  });

  it("bounds refresh admission, rejects collisions, releases finished/expired sessions and retries with fresh execution", async () => {
    vi.useFakeTimers();
    let status: "idle" | "active" = "idle";
    const get = vi.fn(async ({ threadId }: { threadId: string }) =>
      makeThreadResponse({ id: threadId, status }),
    );
    const { harness, task, attach } = setup(get);
    attach("thr_shared");
    const call = (i: number, step: "start" | "continue" | "finish", taskIds = [task.id]) =>
      harness.behavior.callRpc("listTaskWorkStatus", {
        taskIds,
        refresh: { id: refreshId(i), step },
      });
    try {
      for (let i = 0; i < 8; i++) await call(i, "start");
      expect(get).toHaveBeenCalledTimes(8);
      for (const i of [0, 8])
        expect(await call(i, "start")).toMatchObject({
          byTaskId: {
            [task.id]: {
              availability: "unavailable",
              threads: [expect.objectContaining({ execution: "unavailable" })],
            },
          },
        });
      expect(get).toHaveBeenCalledTimes(8);
      expect(await call(0, "continue")).toMatchObject({
        byTaskId: {
          [task.id]: {
            threads: [expect.objectContaining({ execution: "idle" })],
          },
        },
      });
      await call(0, "finish", []);
      await call(8, "start");
      expect(get).toHaveBeenCalledTimes(9);
      expect(await call(0, "continue")).toMatchObject({
        byTaskId: { [task.id]: { availability: "unavailable" } },
      });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(vi.getTimerCount()).toBe(0);
      expect(await call(1, "continue")).toMatchObject({
        byTaskId: { [task.id]: { availability: "unavailable" } },
      });
      expect(get).toHaveBeenCalledTimes(9);
      status = "active";
      expect(await call(9, "start")).toMatchObject({
        byTaskId: {
          [task.id]: {
            threads: [expect.objectContaining({ execution: "working" })],
          },
        },
      });
      expect(get).toHaveBeenCalledTimes(10);
    } finally {
      await harness.lifecycle.dispose();
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    }
  });

  it("bounds retained thread observations without losing associations or rereading overflow, then recovers on a new refresh", async () => {
    const { bb, store, task, attach, get, harness } = setup();
    attach("thr_template");
    const template = store.tasks.listTaskThreads(task.id)[0]!;
    let attached = Array.from({ length: WORK_STATUS_REFRESH_THREAD_LIMIT + 1 }, (_, i) => ({
      ...template,
      threadId: `thr_${i}`,
    }));
    const read = createWorkStatusReader({
      store: { getTask: () => task, listTaskThreads: () => attached },
      threads: bb.sdk.threads,
      now: () => new Date(),
    });
    try {
      const first = await read([task.id], { id: refreshId(0), step: "start" });
      expect(get).toHaveBeenCalledTimes(WORK_STATUS_REFRESH_THREAD_LIMIT);
      expect(first.byTaskId[task.id]!.threads).toHaveLength(WORK_STATUS_REFRESH_THREAD_LIMIT + 1);
      expect(first.byTaskId[task.id]!.threads.at(-1)!.execution).toBe("unavailable");
      attached = [attached[0]!, attached.at(-1)!];
      const second = await read([task.id], {
        id: refreshId(0),
        step: "finish",
      });
      expect(get).toHaveBeenCalledTimes(WORK_STATUS_REFRESH_THREAD_LIMIT);
      expect(second.byTaskId[task.id]!.threads).toEqual([
        expect.objectContaining({ threadId: "thr_0", execution: "idle" }),
        expect.objectContaining({
          threadId: `thr_${WORK_STATUS_REFRESH_THREAD_LIMIT}`,
          execution: "unavailable",
        }),
      ]);
      await read([task.id], { id: refreshId(1), step: "start" });
      const fresh = await read([task.id], { id: refreshId(1), step: "finish" });
      expect(get).toHaveBeenCalledTimes(WORK_STATUS_REFRESH_THREAD_LIMIT + 2);
      expect(fresh.byTaskId[task.id]!.threads.every((thread) => thread.execution === "idle")).toBe(
        true,
      );
    } finally {
      read.dispose();
      await harness.lifecycle.dispose();
    }
  });

  it("shares one global eight-read budget across independent refresh sessions", async () => {
    let active = 0,
      peak = 0;
    const releases: (() => void)[] = [];
    const get = vi.fn(async ({ threadId }: { threadId: string }) => {
      peak = Math.max(peak, ++active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return makeThreadResponse({ id: threadId, status: "active" });
    });
    const { harness, task, attach } = setup(get);
    for (let i = 0; i < 12; i++) attach(`thr_${i}`);
    try {
      const requests = [0, 1].map((i) =>
        harness.behavior.callRpc("listTaskWorkStatus", {
          taskIds: [task.id],
          refresh: { id: refreshId(i), step: "start" },
        }),
      );
      await vi.waitFor(() => expect(active).toBe(8));
      while (get.mock.calls.length < 24 || active) {
        releases.splice(0).forEach((resolve) => resolve());
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      await Promise.all(requests);
      expect(peak).toBe(8);
      expect(get).toHaveBeenCalledTimes(24);
      for (const i of [0, 1])
        await harness.behavior.callRpc("listTaskWorkStatus", {
          taskIds: [],
          refresh: { id: refreshId(i), step: "finish" },
        });
    } finally {
      await harness.lifecycle.dispose();
    }
  });
});
