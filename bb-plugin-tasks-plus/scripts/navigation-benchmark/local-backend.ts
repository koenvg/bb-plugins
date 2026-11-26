// Local lab only. The SDK host owns SQLite and validates every RPC input/output.
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { createStore, registerTasksApi } from "../../api/index.js";
import { type Task, tasksRpcContract } from "../../shared/contract.js";
// @ts-expect-error Existing Node fixture helper has no declaration file.
import { createFixture } from "./fixture.mjs";

type FixtureTask = Pick<
  Task,
  "id" | "key" | "title" | "description" | "status" | "priority" | "dueDate" | "labelIds"
> & { owner: string; marker: string; revision?: string };
export interface NavigationFixture {
  project: { name: string; prefix: string };
  labels: { id: string; name: string; color: string }[];
  tasks: FixtureTask[];
}

const id = (n: number) => String(n).padStart(26, "0");
export function createLocalBackend(owner: string, count = 100) {
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks-plus",
    sdk: {
      projects: { list: () => Promise.resolve([]) },
      threads: { get: () => Promise.resolve(null) },
    },
  });
  const store = createStore(bb);
  registerTasksApi(bb, store);
  const fixture: NavigationFixture = createFixture(owner, count);
  const project = store.tasks.createProject({ id: id(1), ...fixture.project, color: "blue" });
  const labelIds = new Map<string, string>();
  fixture.labels.forEach((label, i) => {
    const stored = store.tasks.createLabel({
      id: id(10 + i),
      projectId: project.id,
      name: label.name,
      color: label.color,
    });
    labelIds.set(label.id, stored.id);
  });
  fixture.tasks.forEach((task, i) => {
    const stored = store.tasks.createTask({
      id: id(100 + i),
      projectId: project.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
    });
    if (stored.key !== task.key) throw new Error("Fixture key mismatch");
    task.id = stored.id;
    for (const label of task.labelIds) {
      const labelId = labelIds.get(label);
      if (!labelId) throw new Error(`Unknown fixture label ${label}`);
      store.tasks.addTaskLabel(stored.id, labelId);
    }
  });
  bb.storage
    .database()
    .prepare("UPDATE tasks SET created_at = ?, updated_at = ?")
    .run("2026-10-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z");
  const calls: { method: string; input: unknown; time: number }[] = [];
  let failRead: string | null = null;
  let saveDelay = 0;
  let failSave = false;
  return {
    fixture,
    bb,
    harness,
    calls,
    databasePath: bb.storage.database().name,
    control(value: { failRead?: string | null; saveDelay?: number; failSave?: boolean }) {
      if ("failRead" in value) failRead = value.failRead ?? null;
      if ("saveDelay" in value) saveDelay = value.saveDelay ?? 0;
      if ("failSave" in value) failSave = value.failSave ?? false;
    },
    async call(method: string, input: unknown) {
      calls.push({ method, input, time: Date.now() });
      if (!Object.hasOwn(tasksRpcContract, method)) throw new Error("Unknown RPC");
      if (!/^(get|list|sidebar)/.test(method) && method !== "updateTask")
        throw new Error("Lab blocks mutation/dispatch/notification");
      if (method === "getTaskByKey" && (input as { taskKey: string }).taskKey === failRead)
        throw new Error("Owned failed-read case");
      if (method === "updateTask") {
        if (saveDelay)
          await (() => {
            const { promise, resolve, reject } = Promise.withResolvers<unknown>();
            try {
              setTimeout(resolve, saveDelay);
            } catch (setupError) {
              reject(setupError);
            }
            return promise;
          })();
        if (failSave) throw new Error("Owned failed-save case");
      }
      return harness.behavior.callRpc(method, input);
    },
    dispose: () => harness.lifecycle.dispose(),
  };
}
