// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeTask, rpcInput } from "../../test-fixtures.js";

if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

const app = await loadPluginApp(() => import("../../app"));

afterEach(cleanup);

const PROJECT_ID = "01HZZZZZZZZZZZZZZZZZZZZZP1";
const TASK_ID = "01HZZZZZZZZZZZZZZZZZZZZZT1";

const task = makeTask({
  id: TASK_ID,
  projectId: PROJECT_ID,
  number: 4,
  key: "TSK-4",
  title: "Ship task embeds",
  status: "in_progress",
  priority: "high",
  position: 100,
});

function directiveProps(attributes: Record<string, string>) {
  return {
    attributes,
    source: `::task{key="${attributes.key ?? ""}"}`,
    message: {
      id: "msg_1",
      threadId: "thr_1",
      turnId: "turn_1",
      projectId: null,
    },
    openWorkspaceFile: null,
  };
}

function taskDetailRpc(getTaskByKey: () => { task: typeof task }) {
  return {
    getTaskByKey,
    listProjects: () => ({ projects: [] }),
    getTask: () => ({ task: null }),
    listTasks: () => ({ tasks: [] }),
    listLabels: () => ({ labels: [] }),
    listAttachments: () => ({ attachments: [] }),
    listTaskThreads: () => ({ taskThreads: [] }),
    listPresets: () => ({ presets: [] }),
    getTaskActivity: () => ({ entries: [] }),
    searchThreads: () => ({ threads: [] }),
  };
}

describe("Tasks app slots", () => {
  it("registers the task directive card and thread panel action", () => {
    expect(app.messageDirectives).toHaveLength(1);
    expect(app.messageDirectives[0]?.id).toBe("task");
    expect(app.threadPanelActions[0]).toMatchObject({
      id: "task",
      title: "Task",
    });
  });
});

describe("Task directive card", () => {
  it("renders live task data with a complete accessible name", async () => {
    const slot = renderSlot(app.messageDirectives[0]!, directiveProps({ key: "TSK-4" }), {
      rpc: { getTaskByKey: () => ({ task }) },
    });

    const main = await slot.findByRole("button", {
      name: "TSK-4 — Ship task embeds, in progress, high priority — open in side panel",
    });
    expect(main).toBeTruthy();
    expect(slot.rpcCalls).toContainEqual({
      method: "getTaskByKey",
      input: { taskKey: "TSK-4" },
    });
    expect(slot.getByText("TSK-4").closest("[aria-hidden]")).toBeTruthy();
  });

  it("omits the priority glyph and spoken priority when priority is none", async () => {
    const slot = renderSlot(app.messageDirectives[0]!, directiveProps({ key: "TSK-4" }), {
      rpc: { getTaskByKey: () => ({ task: { ...task, priority: "none" } }) },
    });
    const main = await slot.findByRole("button", {
      name: "TSK-4 — Ship task embeds, in progress — open in side panel",
    });
    expect(main.querySelectorAll("svg")).toHaveLength(1);
  });

  it("opens the side panel on primary click and the Tasks app from the arrow", async () => {
    const openThreadPanel = vi.fn(() => true);
    const slot = renderSlot(app.messageDirectives[0]!, directiveProps({ key: "TSK-4" }), {
      openThreadPanel,
      rpc: { getTaskByKey: () => ({ task }) },
    });

    fireEvent.click(await slot.findByText("Ship task embeds"));
    expect(openThreadPanel).toHaveBeenCalledWith({
      actionId: "task",
      title: "TSK-4",
      params: { taskKey: "TSK-4" },
    });

    fireEvent.click(slot.getByRole("button", { name: "Open TSK-4 in Tasks" }));
    expect(slot.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: "task/TSK-4" },
    });
  });

  it("falls back to the Tasks app when no side panel is available", async () => {
    const slot = renderSlot(app.messageDirectives[0]!, directiveProps({ key: "TSK-4" }), {
      rpc: { getTaskByKey: () => ({ task }) },
    });
    fireEvent.click(await slot.findByText("Ship task embeds"));
    expect(slot.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: "task/TSK-4" },
    });
  });

  it("shows the title fallback while loading and keeps it when not found", async () => {
    let resolveFetch: (value: { task: null }) => void;
    const pending = new Promise<{ task: null }>((resolve) => {
      resolveFetch = resolve;
    });
    const slot = renderSlot(
      app.messageDirectives[0]!,
      directiveProps({ key: "TSK-9", title: "Old embed work" }),
      { rpc: { getTaskByKey: () => pending } },
    );

    const loading = slot.getByRole("status", { name: "Loading task TSK-9" });
    expect(loading.textContent).toContain("Old embed work");

    resolveFetch!({ task: null });
    await slot.findByText("Old embed work · not found");
    fireEvent.click(slot.getByRole("button", { name: "Open Tasks" }));
    expect(slot.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: {},
    });
  });

  it("renders the generic not-found copy without a title fallback", async () => {
    const slot = renderSlot(app.messageDirectives[0]!, directiveProps({ key: "TSK-9" }), {
      rpc: { getTaskByKey: () => ({ task: null }) },
    });
    await slot.findByText("Task not found — deleted, or its key changed");
  });

  it("rejects malformed keys without calling the backend", () => {
    const malformed: Record<string, string>[] = [{}, { key: "  " }, { key: "not a key" }];
    for (const attributes of malformed) {
      const slot = renderSlot(app.messageDirectives[0]!, directiveProps(attributes), {
        rpc: {},
      });
      slot.getByText("Invalid task link. Expected a task key like TSK-4.");
      expect(slot.rpcCalls).toHaveLength(0);
      cleanup();
    }
  });

  it("offers a retry that refetches after a transport error", async () => {
    let fail = true;
    const slot = renderSlot(app.messageDirectives[0]!, directiveProps({ key: "TSK-4" }), {
      rpc: {
        getTaskByKey: () => {
          if (fail) throw new Error("boom");
          return { task };
        },
      },
    });
    const retry = await slot.findByRole("button", { name: "Retry" });
    fail = false;
    fireEvent.click(retry);
    await slot.findByText("Ship task embeds");
  });

  it("refetches on matching realtime payloads and ignores unrelated ones", async () => {
    const slot = renderSlot(app.messageDirectives[0]!, directiveProps({ key: "TSK-4" }), {
      rpc: { getTaskByKey: () => ({ task }) },
    });
    await slot.findByText("Ship task embeds");
    const calls = () => slot.rpcCalls.filter((call) => call.method === "getTaskByKey").length;
    const baseline = calls();

    await slot.emitRealtime("tasks:changed", {
      taskId: "01HZZZZZZZZZZZZZZZZZZZZZT9",
      projectId: PROJECT_ID,
    });
    await slot.emitRealtime("projects:changed", {
      projectId: "01HZZZZZZZZZZZZZZZZZZZZZP9",
    });
    expect(calls()).toBe(baseline);

    await slot.emitRealtime("tasks:changed", {
      taskId: TASK_ID,
      projectId: PROJECT_ID,
    });
    await waitFor(() => expect(calls()).toBe(baseline + 1));

    await slot.emitRealtime("projects:changed", { projectId: PROJECT_ID });
    await waitFor(() => expect(calls()).toBe(baseline + 2));
  });

  it("refetches an unresolved card on any tasks event so new tasks appear", async () => {
    let created = false;
    const slot = renderSlot(app.messageDirectives[0]!, directiveProps({ key: "TSK-4" }), {
      rpc: { getTaskByKey: () => ({ task: created ? task : null }) },
    });
    await slot.findByText("Task not found — deleted, or its key changed");
    created = true;
    await slot.emitRealtime("tasks:changed", {
      taskId: TASK_ID,
      projectId: PROJECT_ID,
    });
    await slot.findByText("Ship task embeds");
  });
});

describe("Task embed panel", () => {
  it("renders the task detail for the panel params and links to the app", async () => {
    const slot = renderSlot(
      app.threadPanelActions[0]!,
      { threadId: "thr_1", params: { taskKey: "TSK-4" } },
      {
        rpc: taskDetailRpc(() => ({ task })),
      },
    );
    await slot.findByRole("textbox", { name: "Task title" });
    fireEvent.click(slot.getByRole("button", { name: "Open TSK-4 in Tasks" }));
    expect(slot.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: "task/TSK-4" },
    });
  });

  it("keeps the thread header, open link and detail on A after a rejected switch, then retries to B", async () => {
    const Panel = app.threadPanelActions[0]!.component;
    const other = makeTask({
      id: "01HZZZZZZZZZZZZZZZZZZZZZT2",
      key: "TSK-5",
      title: "Other ticket",
    });
    let finishSave!: (result: unknown) => void;
    const updateTask = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishSave = resolve;
          }),
      )
      .mockResolvedValue({ ok: true, task: { ...task, title: "Edited A" } });
    const slot = renderSlot(
      app.threadPanelActions[0]!,
      { threadId: "thr_1", params: { taskKey: "TSK-4" } },
      {
        rpc: {
          ...taskDetailRpc(() => ({ task })),
          getTaskByKey: (raw) => ({
            task: rpcInput(raw).taskKey === "TSK-4" ? task : other,
          }),
          updateTask,
        },
      },
    );
    const title = await slot.findByRole("textbox", { name: "Task title" });
    fireEvent.click(slot.getByRole("button", { name: "Open TSK-4 in Tasks" }));
    expect(slot.inspection.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: "task/TSK-4" },
    });
    title.textContent = "Edited A";
    fireEvent.input(title);
    slot.lifecycle.rerender(<Panel threadId="thr_1" params={{ taskKey: "TSK-5" }} />);
    await waitFor(() => expect(updateTask).toHaveBeenCalledOnce());
    expect(slot.queryByText("TSK-5")).toBeNull();
    expect(slot.getByText("TSK-4")).toBeTruthy();
    await act(async () => finishSave({ ok: false, error: { message: "Save rejected" } }));
    expect((await slot.findByRole("alert")).textContent).toContain("Save rejected");
    expect(slot.getByRole("button", { name: "Open TSK-4 in Tasks" })).toBeTruthy();
    expect(slot.queryByRole("button", { name: "Open TSK-5 in Tasks" })).toBeNull();
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Edited A");
    fireEvent.click(slot.getByRole("button", { name: "Retry save" }));
    await waitFor(() =>
      expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Other ticket"),
    );
    expect(slot.getByText("TSK-5")).toBeTruthy();
    fireEvent.click(slot.getByRole("button", { name: "Open TSK-5 in Tasks" }));
    expect(slot.inspection.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: "task/TSK-5" },
    });
  });
  it("waits for thread-side edits before opening the ticket in Tasks", async () => {
    let finishSave!: (result: unknown) => void;
    const slot = renderSlot(
      app.threadPanelActions[0]!,
      { threadId: "thr_1", params: { taskKey: "TSK-4" } },
      {
        rpc: {
          ...taskDetailRpc(() => ({ task })),
          updateTask: () =>
            new Promise((resolve) => {
              finishSave = resolve;
            }),
        },
      },
    );
    const title = await slot.findByRole("textbox", { name: "Task title" });
    title.textContent = "Edited before opening";
    fireEvent.input(title);
    fireEvent.click(slot.getByRole("button", { name: "Open TSK-4 in Tasks" }));
    expect(slot.inspection.navigateCalls).toEqual([]);
    await act(async () =>
      finishSave({
        ok: true,
        task: { ...task, title: "Edited before opening" },
      }),
    );
    expect(slot.inspection.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: "task/TSK-4" },
    });
  });
  it("resyncs the embedded task detail after reconnect", async () => {
    let title = "Stale embedded detail";
    const slot = renderSlot(
      app.threadPanelActions[0]!,
      { threadId: "thr_1", params: { taskKey: "TSK-4" } },
      {
        realtimeConnectionState: "connected",
        rpc: taskDetailRpc(() => ({ task: { ...task, title } })),
      },
    );
    await slot.findByText("Stale embedded detail");

    title = "Recovered embedded detail";
    await slot.behavior.setRealtimeConnectionState("reconnecting");
    expect(slot.queryByText("Recovered embedded detail")).toBeNull();
    await slot.behavior.setRealtimeConnectionState("connected");
    await slot.findByText("Recovered embedded detail");
  });

  it("opens the first linked task when the launcher supplies no key", async () => {
    const slot = renderSlot(
      app.threadPanelActions[0]!,
      { threadId: "thr_1", params: null },
      {
        rpc: {
          ...taskDetailRpc(() => ({ task })),
          getTasksForThread: () => ({ tasks: [task] }),
        },
      },
    );
    expect((await slot.findByRole("textbox", { name: "Task title" })).textContent).toBe(
      "Ship task embeds",
    );
    fireEvent.click(slot.getByRole("button", { name: "Open TSK-4 in Tasks" }));
    expect(slot.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: "task/TSK-4" },
    });
  });
  it.each(["in_review", "done"] as const)(
    "opens the first of several linked tasks with status %s, including after restore",
    async (status) => {
      const linkedTask = { ...task, status };
      const other = makeTask({ key: "TSK-5", title: "Later linked task" });
      const restore = () =>
        renderSlot(
          app.threadPanelActions[0]!,
          { threadId: "thr_1", params: null },
          {
            rpc: {
              ...taskDetailRpc(() => ({ task: linkedTask })),
              getTasksForThread: () => ({ tasks: [linkedTask, other] }),
            },
          },
        );
      const initial = restore();
      await initial.findByRole("button", { name: "Open TSK-4 in Tasks" });
      cleanup();
      const restored = restore();
      expect((await restored.findByRole("textbox", { name: "Task title" })).textContent).toBe(
        "Ship task embeds",
      );
      expect(restored.queryByText("Later linked task")).toBeNull();
    },
  );

  it.each(["TSK-5", "invalid", "TSK-99"])(
    "keeps the explicit target %s without a linked-task lookup",
    async (taskKey) => {
      const other = makeTask({ key: "TSK-5", title: "Explicit task" });
      const slot = renderSlot(
        app.threadPanelActions[0]!,
        { threadId: "thr_1", params: { taskKey } },
        {
          rpc: {
            ...taskDetailRpc(() => ({ task })),
            getTaskByKey: () => ({ task: taskKey === "TSK-5" ? other : null }),
            getTasksForThread: () => ({ tasks: [task] }),
          },
        },
      );
      if (taskKey === "TSK-5") await slot.findByText("Explicit task");
      else if (taskKey === "invalid") {
        slot.getByText("Open a task card from a message to view it here.");
      } else await slot.findByText("Task TSK-99 was not found.");
      expect(slot.rpcCalls.some(({ method }) => method === "getTasksForThread")).toBe(false);
    },
  );

  it("shows loading while the linked-task lookup is pending", async () => {
    let resolve!: (result: { tasks: (typeof task)[] }) => void;
    const slot = renderSlot(
      app.threadPanelActions[0]!,
      { threadId: "thr_1", params: null },
      {
        rpc: {
          ...taskDetailRpc(() => ({ task })),
          getTasksForThread: () =>
            new Promise((done) => {
              resolve = done;
            }),
        },
      },
    );
    slot.getByRole("status", { name: "Loading linked task" });
    expect(slot.queryByText("No task is linked to this thread.")).toBeNull();
    await act(async () => resolve({ tasks: [task] }));
    await slot.findByRole("textbox", { name: "Task title" });
  });

  it("distinguishes lookup failure from no linked tasks and supports manual retry", async () => {
    let fail = true;
    const slot = renderSlot(
      app.threadPanelActions[0]!,
      { threadId: "thr_1", params: null },
      {
        rpc: {
          ...taskDetailRpc(() => ({ task })),
          getTasksForThread: () => {
            if (fail) throw new Error("Offline");
            return { tasks: [] };
          },
        },
      },
    );
    expect((await slot.findByRole("alert")).textContent).toContain(
      "Couldn't load the linked task.",
    );
    expect(slot.queryByText("No task is linked to this thread.")).toBeNull();
    fail = false;
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    await slot.findByText("No task is linked to this thread.");
    expect(slot.queryByRole("alert")).toBeNull();
  });

  it("refreshes linked selection on updates and reconnect, retaining details on lookup failure", async () => {
    let tasks: (typeof task)[] = [];
    let fail = false;
    const other = makeTask({ id: "01HZZZZZZZZZZZZZZZZZZZZZT2", key: "TSK-5", title: "Next task" });
    const slot = renderSlot(
      app.threadPanelActions[0]!,
      { threadId: "thr_1", params: null },
      {
        realtimeConnectionState: "connected",
        rpc: {
          ...taskDetailRpc(() => ({ task })),
          getTaskByKey: (raw) => ({ task: rpcInput(raw).taskKey === "TSK-4" ? task : other }),
          getTasksForThread: () => {
            if (fail) throw new Error("Offline");
            return { tasks };
          },
        },
      },
    );
    await slot.findByText("No task is linked to this thread.");
    tasks = [task];
    await slot.behavior.emitRealtime("threads:changed", { taskId: task.id });
    await slot.findByText("Ship task embeds");
    tasks = [other];
    await slot.behavior.setRealtimeConnectionState("reconnecting");
    await slot.behavior.setRealtimeConnectionState("connected");
    const title = await slot.findByText("Next task");
    fail = true;
    await slot.behavior.emitRealtime("tasks:changed", { taskId: other.id });
    await slot.findByRole("alert");
    expect(slot.getByRole("textbox", { name: "Task title" })).toBe(title);
    expect(slot.getByRole("button", { name: "Open TSK-5 in Tasks" })).toBeTruthy();
    fail = false;
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(slot.queryByRole("alert")).toBeNull());
    expect(slot.getByRole("textbox", { name: "Task title" })).toBe(title);
  });

  it.each([true, false])("saves before changing linked tasks, with save success %s", async (ok) => {
    let tasks = [task];
    const other = makeTask({ id: "01HZZZZZZZZZZZZZZZZZZZZZT2", key: "TSK-5", title: "Next task" });
    let finishSave!: (result: unknown) => void;
    const updateTask = vi.fn(
      () =>
        new Promise((resolve) => {
          finishSave = resolve;
        }),
    );
    const slot = renderSlot(
      app.threadPanelActions[0]!,
      { threadId: "thr_1", params: null },
      {
        rpc: {
          ...taskDetailRpc(() => ({ task })),
          getTaskByKey: (raw) => ({ task: rpcInput(raw).taskKey === "TSK-4" ? task : other }),
          getTasksForThread: () => ({ tasks }),
          updateTask,
        },
      },
    );
    const title = await slot.findByRole("textbox", { name: "Task title" });
    title.textContent = "Edited linked task";
    fireEvent.input(title);
    tasks = [other];
    await slot.behavior.emitRealtime("threads:changed", { taskId: other.id });
    await waitFor(() => expect(updateTask).toHaveBeenCalledOnce());
    expect(slot.getByRole("textbox", { name: "Task title" })).toBe(title);
    expect(slot.getByRole("button", { name: "Open TSK-4 in Tasks" })).toBeTruthy();
    await act(async () =>
      finishSave(
        ok
          ? { ok: true, task: { ...task, title: "Edited linked task" } }
          : { ok: false, error: { message: "Save rejected" } },
      ),
    );
    if (ok) {
      await slot.findByText("Next task");
      slot.getByRole("button", { name: "Open TSK-5 in Tasks" });
    } else {
      expect((await slot.findByRole("alert")).textContent).toContain("Save rejected");
      expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe(
        "Edited linked task",
      );
      slot.getByRole("button", { name: "Open TSK-4 in Tasks" });
      expect(slot.queryByRole("button", { name: "Open TSK-5 in Tasks" })).toBeNull();
    }
  });

  it.each(["same task", "lookup failure", "no linked task"])(
    "retains the explicit editor while default lookup is delayed, then returns %s",
    async (outcome) => {
      const Panel = app.threadPanelActions[0]!.component;
      let finishLookup!: (result: { tasks: (typeof task)[] }) => void;
      let failLookup!: (error: Error) => void;
      const updateTask = vi.fn().mockResolvedValue({ ok: true, task });
      const slot = renderSlot(
        app.threadPanelActions[0]!,
        { threadId: "thr_1", params: { taskKey: "TSK-4" } },
        {
          rpc: {
            ...taskDetailRpc(() => ({ task })),
            getTasksForThread: () =>
              new Promise((resolve, reject) => {
                finishLookup = resolve;
                failLookup = reject;
              }),
            updateTask,
          },
        },
      );
      const title = await slot.findByRole("textbox", { name: "Task title" });
      title.textContent = "Unsaved explicit edit";
      fireEvent.input(title);
      await act(async () => slot.lifecycle.rerender(<Panel threadId="thr_1" params={null} />));
      await slot.findByRole("status", { name: "Loading linked task" });
      expect(slot.getByRole("textbox", { name: "Task title" })).toBe(title);
      expect(title.textContent).toBe("Unsaved explicit edit");
      slot.getByRole("button", { name: "Open TSK-4 in Tasks" });
      if (outcome === "same task") {
        await act(async () => finishLookup({ tasks: [task] }));
      } else if (outcome === "no linked task") {
        await act(async () => finishLookup({ tasks: [] }));
        await slot.findByText("No task is linked to this thread.");
        expect(slot.queryByRole("textbox", { name: "Task title" })).toBeNull();
        expect(updateTask).toHaveBeenCalledOnce();
        return;
      } else {
        await act(async () => failLookup(new Error("Offline")));
        await slot.findByRole("alert");
        slot.getByRole("button", { name: "Retry" });
      }
      expect(slot.getByRole("textbox", { name: "Task title" })).toBe(title);
      expect(title.textContent).toBe("Unsaved explicit edit");
      expect(updateTask).not.toHaveBeenCalled();
    },
  );
});
