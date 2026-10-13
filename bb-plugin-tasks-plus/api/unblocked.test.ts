import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import { createStore, registerTasksApi } from ".";

describe("dependency readiness without comments", () => {
  it.each(["done", "canceled"] as const)(
    "publishes readiness when the last blocker becomes %s",
    async (status) => {
      const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
      const store = createStore(bb);
      registerTasksApi(bb, store);
      try {
        const project = store.tasks.createProject({
          name: "Dependencies",
          prefix: "DEP",
          color: "blue",
        });
        const blocker = store.tasks.createTask({ projectId: project.id, title: "Blocker" });
        const task = store.tasks.createTask({ projectId: project.id, title: "Blocked" });
        store.tasks.addTaskDependency(blocker.id, task.id);
        await harness.callRpc("updateTask", { taskId: blocker.id, status });
        expect(store.tasks.dependencyState([task.id]).get(task.id)!.openBlockerIds).toEqual([]);
        expect(harness.realtimeSignals).toContainEqual({
          channel: "tasks:changed",
          payload: { taskId: task.id, projectId: project.id },
        });
        await harness.callRpc("updateTask", { taskId: blocker.id, status: "todo" });
        expect(store.tasks.dependencyState([task.id]).get(task.id)!.openBlockerIds).toEqual([
          blocker.id,
        ]);
        expect(harness.realtimeSignals.every((event) => event.channel === "tasks:changed")).toBe(
          true,
        );
        expect(harness.sdk.callsTo("threads.send")).toEqual([]);
        expect(harness.sdk.callsTo("threads.spawn")).toEqual([]);
        expect(
          bb.storage
            .database()
            .prepare("SELECT name FROM sqlite_master WHERE name = 'comments'")
            .all(),
        ).toEqual([]);
      } finally {
        await harness.dispose();
      }
    },
  );

  it("keeps the remaining blocker and makes repeated terminal saves side-effect free", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
    const store = createStore(bb);
    registerTasksApi(bb, store);
    try {
      const project = store.tasks.createProject({
        name: "Dependencies",
        prefix: "DEP",
        color: "blue",
      });
      const one = store.tasks.createTask({ projectId: project.id, title: "One" });
      const two = store.tasks.createTask({ projectId: project.id, title: "Two" });
      const task = store.tasks.createTask({ projectId: project.id, title: "Blocked" });
      store.tasks.addTaskDependency(one.id, task.id);
      store.tasks.addTaskDependency(two.id, task.id);
      await harness.callRpc("updateTask", { taskId: one.id, status: "done" });
      expect(store.tasks.dependencyState([task.id]).get(task.id)!.openBlockerIds).toEqual([two.id]);
      harness.realtimeSignals.length = 0;
      await harness.callRpc("updateTask", { taskId: one.id, status: "done" });
      expect(harness.realtimeSignals).not.toContainEqual({
        channel: "tasks:changed",
        payload: { taskId: task.id, projectId: project.id },
      });
      expect(harness.sdk.callsTo("threads.send")).toEqual([]);
    } finally {
      await harness.dispose();
    }
  });
});
