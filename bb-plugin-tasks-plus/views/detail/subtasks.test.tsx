// @vitest-environment jsdom
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { createStore, registerTasksApi } from "../../api";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Task, TaskDependencyRef } from "../../shared/contract.js";
import { makeTask, rpcInput } from "../../test-fixtures.js";

window.matchMedia ??= (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});
window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};

const app = await loadPluginApp(() => import("../../app"));

afterEach(cleanup);

const PROJECT_ID = "01HZZZZZZZZZZZZZZZZZZZZZP1";

function task(number: number, overrides: Partial<Task> = {}): Task {
  return makeTask({
    id: `01HZZZZZZZZZZZZZZZZZZZZZT${number}`,
    projectId: PROJECT_ID,
    number,
    key: `ABC-${number}`,
    title: `Task ${number}`,
    position: number,
    ...overrides,
  });
}

function ref(number: number, status: Task["status"]): TaskDependencyRef {
  return {
    id: `01HZZZZZZZZZZZZZZZZZZZZZT${number}`,
    key: `ABC-${number}`,
    title: `Task ${number}`,
    status,
  };
}

function renderParent(
  subtasks: () => Task[],
  parent = task(1),
  createTask?: (raw: unknown) => Promise<unknown>,
) {
  return renderSlot(
    app.navPanels[0]!,
    { subPath: "task/ABC-1" },
    {
      sdk: {
        threads: {
          get: async ({ threadId }) => makeThreadResponse({ id: threadId, status: "idle" }),
        },
      },
      rpc: {
        listProjects: () => ({
          projects: [
            {
              id: PROJECT_ID,
              name: "ABC project",
              prefix: "ABC",
              nextTaskNumber: 10,
              color: "blue",
              folderId: null,
              linkedBbProjectId: null,
              createdAt: "2026-07-15T00:00:00.000Z",
            },
          ],
        }),
        ...(createTask ? { createTask } : {}),
        listFolders: () => ({ folders: [] }),
        listPresets: () => ({ presets: [] }),
        sidebarSummary: () => ({ projects: [] }),
        getTaskByKey: () => ({ task: parent }),
        listTasks: (raw) =>
          rpcInput(raw).parentTaskId
            ? { tasks: subtasks(), nextCursor: null }
            : { tasks: [parent], nextCursor: null },
        listLabels: () => ({ labels: [] }),
        listAttachments: () => ({ attachments: [] }),
        listTaskThreads: () => ({ taskThreads: [] }),
        listTaskPullRequests: () => ({
          pullRequests: [],
          unavailableThreadIds: [],
        }),
      },
    },
  );
}

async function subtaskRow(slot: ReturnType<typeof renderParent>, key: string) {
  const row = (await slot.findByText(key)).closest("button");
  return within(row!);
}

const blockedSubtask = task(2, {
  parentTaskId: task(1).id,
  blockedBy: [ref(7, "todo")],
  openBlockerCount: 1,
  blocked: true,
});
const blockingSubtask = task(3, {
  parentTaskId: task(1).id,
  blocks: [ref(8, "todo"), ref(9, "in_progress")],
  openBlockedCount: 2,
});
const plainSubtask = task(4, { parentTaskId: task(1).id });

describe("sub-task rows in the parent detail view", () => {
  it("creates todo from an attributed parent without inheriting its creator", async () => {
    const host = createFakePluginHost({ pluginId: "subtask-attribution" });
    try {
      const store = createStore(host.bb);
      store.tasks.createProject({
        id: PROJECT_ID,
        name: "ABC project",
        prefix: "ABC",
        color: "blue",
      });
      const parent = store.tasks.createTask({
        projectId: PROJECT_ID,
        title: "Attributed parent",
        createdByThreadId: "thr_open_creator",
      });
      registerTasksApi(host.bb, store);
      const calls: Record<string, unknown>[] = [];
      const slot = renderParent(
        () => store.tasks.listSubtasks(parent.id).map((entry) => makeTask(entry)),
        makeTask(parent),
        async (raw) => {
          calls.push(rpcInput(raw));
          return host.harness.callRpc("createTask", rpcInput(raw));
        },
      );
      expect((await slot.findByText("Not archived")).textContent).toBe("Not archived");
      fireEvent.click(await slot.findByRole("button", { name: "Add sub-task" }));
      const input = slot.getByPlaceholderText("Sub-task of ABC-1…");
      fireEvent.change(input, { target: { value: "Independent child" } });
      fireEvent.keyDown(input, { key: "Enter" });
      await slot.findByText("Independent child");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.createdByThreadId ?? null).toBeNull();
      expect(store.tasks.listSubtasks(parent.id)).toMatchObject([
        {
          title: "Independent child",
          status: "todo",
          parentTaskId: parent.id,
          createdByThreadId: null,
        },
      ]);
      expect(store.tasks.getTask(parent.id)?.createdByThreadId).toBe("thr_open_creator");
      expect(host.harness.sdk.callsTo("threads.get")).toEqual([]);
    } finally {
      await host.harness.dispose();
    }
  });
  it("shares task-only blocker labels and keeps subtask host navigation", async () => {
    const slot = renderParent(() => [
      {
        ...blockedSubtask,
        createdByThreadId: "thr_creator",
        openBlockerCount: 1,
        blocks: [ref(8, "todo")],
        openBlockedCount: 1,
      },
    ]);
    const row = await subtaskRow(slot, "ABC-2");
    expect(row.getByText("Blocked by 1 task").textContent).toBe("Blocked by 1 task");
    expect(row.getByText("Blocks 1 task").textContent).toBe("Blocks 1 task");
    expect(row.getByText("Task 2").textContent).toBe("Task 2");
    expect(slot.getByText("ABC-2").closest("button")?.getAttribute("title")).toBe("Todo");
    fireEvent.click(row.getByText("Task 2"));
    await waitFor(() =>
      expect(slot.inspection.navigateCalls).toContainEqual({
        method: "toPluginPanel",
        path: "tasks",
        options: { subPath: "task/ABC-2" },
      }),
    );
    expect(slot.inspection.sdkCalls.filter((call) => call.method === "threads.get")).toEqual([]);
  });
  it("show dependency badges per sub-task", async () => {
    const slot = renderParent(() => [blockedSubtask, blockingSubtask, plainSubtask]);

    expect((await subtaskRow(slot, "ABC-2")).getByText("Blocked by 1 task")).toBeTruthy();
    expect((await subtaskRow(slot, "ABC-3")).getByText("Blocks 2 tasks")).toBeTruthy();
    const plain = await subtaskRow(slot, "ABC-4");
    expect(plain.queryByText(/Blocked by|Blocks/)).toBeNull();
  });

  it("drop the blocked badge when the blocker is done", async () => {
    let current = blockedSubtask;
    const slot = renderParent(() => [current]);
    expect((await subtaskRow(slot, "ABC-2")).getByText("Blocked by 1 task")).toBeTruthy();

    current = {
      ...blockedSubtask,
      blockedBy: [ref(7, "done")],
      openBlockerCount: 0,
      blocked: false,
    };
    await slot.emitRealtime("tasks:changed", {
      taskId: ref(7, "done").id,
      projectId: PROJECT_ID,
    });

    await waitFor(async () =>
      expect((await subtaskRow(slot, "ABC-2")).queryByText("Blocked by 1 task")).toBeNull(),
    );
  });
});
