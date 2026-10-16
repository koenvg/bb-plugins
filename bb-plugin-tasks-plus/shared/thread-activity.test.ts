import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import { createStore, registerTasksApi } from "../api";
import { registerDelegation } from "../delegate";
import { registerLifecycle } from "../lifecycle";
import { tasksRpcContract } from "./contract";

type Consumer = "attach" | "delegate" | "startup" | "api";
type ActivityCase = [
  ReturnType<typeof makeThreadResponse>["status"],
  number,
  string | Record<Consumer, string>,
  deletedAt?: number,
  archivedAt?: number,
];
const cases: readonly ActivityCase[] = [
  ["pending", 0, "starting"],
  ["starting", 0, "starting"],
  ["active", 0, "working"],
  ["stopping", 0, "working"],
  ["idle", 0, "idle"],
  ["error", 0, "failed"],
  ["pending", 1, "working"],
  ["starting", 1, "working"],
  ["active", 1, "working"],
  ["stopping", 1, "working"],
  ["idle", 1, "working"],
  ["idle", 2, "working"],
  ["error", 1, "failed"],
  [
    "idle",
    1,
    { attach: "completed", delegate: "completed", startup: "completed", api: "removed" },
    1,
  ],
  [
    "error",
    1,
    { attach: "completed", delegate: "completed", startup: "failed", api: "removed" },
    1,
  ],
  ["idle", 1, "working", undefined, 1],
];

for (const consumer of ["attach", "delegate", "startup", "api"] as const) {
  describe(`${consumer} thread activity`, () => {
    it.each(cases)(
      "projects %s with count %i to %s (deletedAt %s, archivedAt %s)",
      async (status, activeBackgroundAgentCount, expectation, deletedAt, archivedAt) => {
        const expected = typeof expectation === "string" ? expectation : expectation[consumer];
        const { bb, harness } = createFakePluginHost({
          pluginId: "tasks",
          sdk: {
            threads: {
              spawn: async () => ({ id: "thr_worker" }),
              get: async () =>
                makeThreadResponse({
                  id: "thr_worker",
                  status,
                  activeBackgroundAgentCount,
                  deletedAt: deletedAt ?? null,
                  archivedAt: archivedAt ?? null,
                }),
            },
          },
        });
        try {
          const store = createStore(bb);
          const project = store.tasks.createProject({
            name: "Activity",
            prefix: "ACT",
            color: "blue",
            linkedBbProjectId: "proj_bb",
          });
          const task = store.tasks.createTask({
            projectId: project.id,
            title: "Background work",
            status: "in_review",
          });
          registerTasksApi(bb, store);
          registerDelegation(bb, store);
          if (consumer === "attach") {
            await harness.behavior.callRpc("taskThreadsAttach", {
              taskId: task.id,
              threadId: "thr_worker",
            });
          } else if (consumer === "delegate") {
            const preset = store.tasks.createPreset({
              name: "Worker",
              providerId: "pi",
              modelId: "test",
              reasoningLevel: "high",
              serviceTier: null,
              permissionMode: "full",
              environmentKind: "project-default",
              baseBranch: null,
              machineId: null,
              instructions: "",
              builtin: false,
            });
            await harness.behavior.callRpc("delegate", { taskId: task.id, presetId: preset.id });
          } else {
            store.tasks.upsertTaskThread({
              taskId: task.id,
              threadId: "thr_worker",
              title: "Worker",
              presetName: "Worker",
              liveStatus: consumer === "api" ? "completed" : "starting",
            });
            if (consumer === "startup") await registerLifecycle(bb, store);
          }
          if (consumer === "api") {
            const before = store.tasks.listTaskThreads(task.id);
            const result = tasksRpcContract.listTaskWorkStatus.output.parse(
              await harness.behavior.callRpc("listTaskWorkStatus", { taskIds: [task.id] }),
            );
            expect(result.byTaskId[task.id]?.threads).toEqual([
              expect.objectContaining({
                threadId: "thr_worker",
                execution: expected,
                archive:
                  deletedAt !== undefined
                    ? "unknown"
                    : archivedAt === 1
                      ? "archived"
                      : "unarchived",
              }),
            ]);
            expect(store.tasks.listTaskThreads(task.id)).toEqual(before);
            expect(harness.realtimeSignals).toEqual([]);
          } else {
            const result = tasksRpcContract.listTaskThreads.output.parse(
              await harness.behavior.callRpc("listTaskThreads", { taskId: task.id }),
            );
            expect(result.taskThreads).toEqual([
              expect.objectContaining({ threadId: "thr_worker", liveStatus: expected }),
            ]);
          }
          expect(store.tasks.getTask(task.id)?.status).toBe("in_review");
        } finally {
          await harness.lifecycle.dispose();
        }
      },
    );
  });
}
