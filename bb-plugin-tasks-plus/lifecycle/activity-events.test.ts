import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import { createStore, registerTasksApi } from "../api";
import { tasksRpcContract } from "../shared/contract";
import { registerLifecycle, THREAD_STATUS_RECONCILE_INTERVAL_MS } from ".";

type Thread = ReturnType<typeof makeThreadResponse>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(get: () => Promise<Thread>, liveStatus: "idle" | "working" | "failed" = "idle") {
  const host = createFakePluginHost({ pluginId: "tasks", sdk: { threads: { get } } });
  const store = createStore(host.bb);
  const project = store.tasks.createProject({ name: "Background", prefix: "BKG", color: "blue" });
  const task = store.tasks.createTask({
    projectId: project.id,
    title: "Background activity",
    status: "in_review",
  });
  const attached = store.tasks.upsertTaskThread({
    taskId: task.id,
    threadId: "thr_worker",
    title: "Worker",
    presetName: "Worker",
    liveStatus,
  });
  registerTasksApi(host.bb, store);
  const status = async () =>
    tasksRpcContract.listTaskThreads.output
      .parse(await host.harness.behavior.callRpc("listTaskThreads", { taskId: task.id }))
      .taskThreads.map((thread) => thread.liveStatus);
  return { ...host, store, task, attached, status };
}
const snapshot = (activeBackgroundAgentCount: number) =>
  makeThreadResponse({ id: "thr_worker", status: "idle", activeBackgroundAgentCount });

describe("background-only lifecycle", () => {
  it("publishes only execution transitions for idle counts 0, 1, 2, 1, 0 without SDK refetches", async () => {
    const f = fixture(async () => snapshot(0));
    try {
      await registerLifecycle(f.bb, f.store);
      const statuses: string[][] = [];
      const signalCounts: number[] = [];
      for (const count of [0, 1, 2, 1, 0]) {
        await f.harness.behavior.emitThreadEvent("experimental_thread.events", {
          thread: snapshot(count),
          sequence: 7,
        });
        statuses.push(await f.status());
        signalCounts.push(f.harness.realtimeSignals.length);
      }
      expect(statuses).toEqual([["idle"], ["working"], ["working"], ["working"], ["idle"]]);
      expect(signalCounts).toEqual([0, 1, 1, 1, 2]);
      expect(f.harness.realtimeSignals).toEqual([
        { channel: "threads:changed", payload: { taskId: f.task.id } },
        { channel: "threads:changed", payload: { taskId: f.task.id } },
      ]);
      expect(f.harness.sdk.callsTo("threads.get")).toEqual([[{ threadId: "thr_worker" }]]);
      expect(f.store.tasks.getTask(f.task.id)?.status).toBe("in_review");
    } finally {
      await f.harness.lifecycle.dispose();
    }
  });

  it("uses activity on idle events, recovers failures and keeps explicit completion sticky", async () => {
    const f = fixture(async () => snapshot(0));
    try {
      await registerLifecycle(f.bb, f.store);
      await f.harness.behavior.emitThreadEvent("thread.idle", {
        thread: snapshot(1),
        lastAssistantText: null,
      });
      expect(await f.status()).toEqual(["working"]);
      await f.harness.behavior.emitThreadEvent("experimental_thread.events", {
        thread: makeThreadResponse({
          id: "thr_worker",
          status: "error",
          activeBackgroundAgentCount: 2,
        }),
        sequence: 8,
      });
      expect(await f.status()).toEqual(["failed"]);
      await f.harness.behavior.emitThreadEvent("experimental_thread.events", {
        thread: snapshot(1),
        sequence: 8,
      });
      expect(await f.status()).toEqual(["working"]);
      await f.harness.behavior.emitThreadEvent("thread.deleted", {
        thread: makeThreadResponse({ id: "thr_worker", deletedAt: 1 }),
      });
      await f.harness.behavior.emitThreadEvent("experimental_thread.events", {
        thread: snapshot(1),
        sequence: 9,
      });
      expect(await f.status()).toEqual(["completed"]);
      expect(f.harness.realtimeSignals).toEqual(
        Array.from({ length: 4 }, () => ({
          channel: "threads:changed",
          payload: { taskId: f.task.id },
        })),
      );
    } finally {
      await f.harness.lifecycle.dispose();
    }
  });
});

for (const phase of ["startup", "sweep"] as const) {
  describe(`${phase} read fencing`, () => {
    it.each([
      ["start", "idle", 1, 0, false, "working"],
      ["finish", "working", 0, 1, false, "idle"],
      ["unchanged", "idle", 0, 1, false, "idle"],
      ["missing", "idle", 0, 0, true, "idle"],
      ["recovery", "failed", 1, 0, false, "working"],
      ["deletion", "idle", 0, 1, false, "completed"],
    ] as const)(
      "does not overwrite %s with an older read",
      async (kind, initial, count, staleCount, missing, expected) => {
        vi.useFakeTimers();
        const pending = deferred<Thread>();
        const started = deferred<void>();
        let reads = 0;
        const f = fixture(async () => {
          if (phase === "sweep" && ++reads === 1) {
            return initial === "failed"
              ? makeThreadResponse({ id: "thr_worker", status: "error" })
              : snapshot(initial === "working" ? 1 : 0);
          }
          started.resolve();
          return pending.promise;
        }, initial);
        let service: ReturnType<typeof f.harness.runService> | undefined;
        try {
          const startup = registerLifecycle(f.bb, f.store);
          let sweep: ReturnType<typeof vi.advanceTimersByTimeAsync> | undefined;
          if (phase === "sweep") {
            await startup;
            service = f.harness.runService("thread-status-reconcile");
            sweep = vi.advanceTimersByTimeAsync(THREAD_STATUS_RECONCILE_INTERVAL_MS);
          }
          await started.promise;
          if (kind === "deletion") {
            await f.harness.behavior.emitThreadEvent("thread.deleted", {
              thread: makeThreadResponse({ id: "thr_worker", deletedAt: 1 }),
            });
          } else {
            await f.harness.behavior.emitThreadEvent("experimental_thread.events", {
              thread: snapshot(count),
              sequence: 10,
            });
          }
          if (missing) {
            pending.reject(Object.assign(new Error("gone"), { code: "thread_not_found" }));
          } else {
            pending.resolve(
              kind === "recovery"
                ? makeThreadResponse({ id: "thr_worker", status: "error" })
                : snapshot(staleCount),
            );
          }
          await startup;
          await sweep;
          expect(await f.status()).toEqual([expected]);
          expect(f.harness.realtimeSignals).toEqual(
            Array.from({ length: kind === "unchanged" || kind === "missing" ? 0 : 1 }, () => ({
              channel: "threads:changed",
              payload: { taskId: f.task.id },
            })),
          );
        } finally {
          service?.controller.abort();
          await service?.done;
          await f.harness.lifecycle.dispose();
          vi.useRealTimers();
        }
      },
    );
  });
}

it.each(["replacement", "completed"] as const)(
  "re-reads the original attachment before applying a startup read to a %s row",
  async (outcome) => {
    const pending = deferred<Thread>();
    const f = fixture(() => pending.promise);
    try {
      const startup = registerLifecycle(f.bb, f.store);
      if (outcome === "replacement") {
        f.store.tasks.deleteTaskThread(f.attached.id);
        const replacement = f.store.tasks.upsertTaskThread({
          taskId: f.task.id,
          threadId: "thr_worker",
          title: "Replacement",
          presetName: "Worker",
          liveStatus: "starting",
        });
        expect(replacement.id).not.toBe(f.attached.id);
      } else {
        f.store.tasks.updateTaskThreadStatus(f.attached.id, "completed");
      }
      const update = vi.spyOn(f.store.tasks, "updateTaskThreadStatus");
      pending.resolve(snapshot(1));
      await startup;
      expect(await f.status()).toEqual([outcome === "replacement" ? "starting" : "completed"]);
      expect(update.mock.calls).toEqual([]);
      expect(f.harness.realtimeSignals).toEqual([]);
    } finally {
      await f.harness.lifecycle.dispose();
    }
  },
);

it("suppresses writes and publications from reads and events after disposal", async () => {
  const pending = deferred<Thread>();
  const f = fixture(() => pending.promise);
  const startup = registerLifecycle(f.bb, f.store);
  await f.harness.behavior.emitThreadEvent("thread.active", {
    thread: makeThreadResponse({ id: "thr_worker", status: "active" }),
  });
  expect(await f.status()).toEqual(["working"]);
  const update = vi.spyOn(f.store.tasks, "updateTaskThreadStatus");
  await f.harness.lifecycle.dispose();
  pending.resolve(makeThreadResponse({ id: "thr_worker", status: "error" }));
  await startup;
  await f.harness.behavior.emitThreadEvent("experimental_thread.events", {
    thread: snapshot(0),
    sequence: 11,
  });
  expect(update.mock.calls).toEqual([]);
  expect(f.harness.realtimeSignals).toEqual([
    { channel: "threads:changed", payload: { taskId: f.task.id } },
  ]);
});
