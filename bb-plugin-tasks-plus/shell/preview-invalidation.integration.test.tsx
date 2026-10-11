// @vitest-environment jsdom
import { cleanup, waitFor } from "@testing-library/react";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, describe, expect, it } from "vitest";
import { createStore, registerTasksApi } from "../api/index.js";
import { TasksRefreshProvider } from "./refresh.js";
import { TaskDataProvider, useTaskPreview } from "./task-data.js";

const app = await loadPluginApp(() => import("../app.js"));
const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  cleanup();
  while (disposers.length) await disposers.pop()?.();
});
function Preview({ taskKey }: { taskKey: string }) {
  const preview = useTaskPreview(taskKey);
  return <output aria-label={taskKey}>{JSON.stringify(preview)}</output>;
}

function setup() {
  const { bb, harness } = createFakePluginHost({ pluginId: "tasks-plus" });
  disposers.push(() => harness.lifecycle.dispose());
  const store = createStore(bb);
  registerTasksApi(bb, store);
  const project = store.tasks.createProject({
    name: "Preview invalidation",
    prefix: "PIN",
    color: "blue",
  });
  const blocker = store.tasks.createTask({
    projectId: project.id,
    title: "Blocker",
    status: "todo",
  });
  const blocked = store.tasks.createTask({
    projectId: project.id,
    title: "Blocked",
    status: "todo",
  });
  const unrelated = store.tasks.createTask({
    projectId: project.id,
    title: "Unrelated",
    status: "todo",
  });
  store.tasks.addTaskDependency(blocker.id, blocked.id);
  const tasks = [blocker, blocked, unrelated];
  const component = () => (
    <TasksRefreshProvider>
      <TaskDataProvider>
        {tasks.map((task) => (
          <Preview key={task.key} taskKey={task.key} />
        ))}
      </TaskDataProvider>
    </TasksRefreshProvider>
  );
  const slot = renderSlot(
    { ...app.navPanels[0]!, component },
    { subPath: "" },
    {
      rpc: { getTaskByKey: (input) => harness.behavior.callRpc("getTaskByKey", input) },
    },
  );
  const read = (key: string) => JSON.parse(slot.getByLabelText(key).textContent!);
  const calls = (key: string) =>
    slot.inspection.rpcCalls.filter(
      (call) =>
        call.method === "getTaskByKey" && (call.input as { taskKey: string }).taskKey === key,
    ).length;
  let signalIndex = 0;
  async function change(method: string, input: unknown) {
    const result = await harness.behavior.callRpc(method, input);
    if (method !== "deleteTask") expect(result).toMatchObject({ ok: true });
    else expect(result).toEqual({ deleted: true });
    const signals = harness.realtimeSignals.slice(signalIndex);
    signalIndex = harness.realtimeSignals.length;
    expect(signals.some((signal) => signal.channel === "tasks:changed")).toBe(true);
    for (const signal of signals) await slot.behavior.emitRealtime(signal.channel, signal.payload);
  }
  return { blocker, blocked, unrelated, read, calls, change };
}

describe("API changes invalidate linked session previews", () => {
  it("refreshes blocker titles, completion, reopening, board moves and deletion without rereading unrelated tasks", async () => {
    const { blocker, blocked, unrelated, read, calls, change } = setup();
    await waitFor(() =>
      expect(read(blocked.key)).toMatchObject({
        current: true,
        data: { blocked: true, openBlockerCount: 1 },
      }),
    );
    await waitFor(() => expect(read(unrelated.key).current).toBe(true));
    const untouched = calls(unrelated.key);
    await change("updateTask", { taskId: blocker.id, title: "Renamed blocker", status: "done" });
    await waitFor(() =>
      expect(read(blocked.key)).toMatchObject({
        current: true,
        data: {
          blocked: false,
          openBlockerCount: 0,
          blockedBy: [{ id: blocker.id, title: "Renamed blocker", status: "done" }],
        },
      }),
    );
    await change("updateTask", { taskId: blocker.id, status: "todo" });
    await waitFor(() =>
      expect(read(blocked.key)).toMatchObject({
        current: true,
        data: { blocked: true, openBlockerCount: 1, blockedBy: [{ status: "todo" }] },
      }),
    );
    await change("boardMove", { taskId: blocker.id, status: "canceled" });
    await waitFor(() =>
      expect(read(blocked.key)).toMatchObject({
        current: true,
        data: { blocked: false, blockedBy: [{ status: "canceled" }] },
      }),
    );
    await change("deleteTask", { taskId: blocker.id });
    await waitFor(() =>
      expect(read(blocked.key)).toMatchObject({
        current: true,
        data: { blockedBy: [], blocked: false, openBlockerCount: 0 },
      }),
    );
    expect(read(unrelated.key).current).toBe(true);
    expect(calls(unrelated.key)).toBe(untouched);
  });

  it("refreshes the reverse dependency reference and counts when the blocked task changes or is deleted", async () => {
    const { blocker, blocked, unrelated, read, calls, change } = setup();
    await waitFor(() =>
      expect(read(blocker.key)).toMatchObject({
        current: true,
        data: { blocks: [{ id: blocked.id }], openBlockedCount: 1 },
      }),
    );
    await waitFor(() => expect(read(unrelated.key).current).toBe(true));
    const untouched = calls(unrelated.key);
    await change("updateTask", {
      taskId: blocked.id,
      title: "Renamed blocked task",
      status: "done",
    });
    await waitFor(() =>
      expect(read(blocker.key)).toMatchObject({
        current: true,
        data: { blocks: [{ title: "Renamed blocked task", status: "done" }], openBlockedCount: 0 },
      }),
    );
    await change("deleteTask", { taskId: blocked.id });
    await waitFor(() =>
      expect(read(blocker.key)).toMatchObject({
        current: true,
        data: { blocks: [], openBlockedCount: 0 },
      }),
    );
    expect(read(unrelated.key).current).toBe(true);
    expect(calls(unrelated.key)).toBe(untouched);
  });
});
