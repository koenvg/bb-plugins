// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginCommandContext } from "@get-bb/plugin-sdk/app";
import { makeTask, rpcInput } from "../test-fixtures.js";
import { DetailView } from "../views/detail/index.js";
import { TASKS_COMMANDS } from "./commands.js";
import { TasksRefreshProvider } from "./refresh.js";

const app = await loadPluginApp(() => import("../app"));
const Panel = app.navPanels[0]!.component;
const context: PluginCommandContext = { threadId: null, projectId: null, openPanel: () => false };
const project = {
  id: "01HZZZZZZZZZZZZZZZZZZZZZP1",
  name: "Command fixture",
  prefix: "TSK",
  nextTaskNumber: 3,
  color: "blue",
  folderId: null,
  linkedBbProjectId: null,
  createdAt: "2026-07-15T00:00:00.000Z",
};
const tasks = [1, 2].map((number) =>
  makeTask({
    id: `01HZZZZZZZZZZZZZZZZZZZZZT${number}`,
    projectId: project.id,
    number,
    key: `TSK-${number}`,
    title: `Task ${number}`,
    status: "todo",
    priority: "none",
  }),
);
const label = {
  id: "label-1",
  projectId: project.id,
  name: "frontend",
  color: "blue",
  createdAt: project.createdAt,
};
const propertyIds = [
  "task-change-status",
  "task-set-priority",
  "task-edit-labels",
  "task-set-due-date",
];
const deferredIds = [
  "task-change-linked-bb-project",
  "task-dispatch",
  "task-previous",
  "task-next",
  "task-back",
];

function command(id: string) {
  const entry = TASKS_COMMANDS.find((item) => item.id === id);
  if (!entry) throw new Error(`Missing command ${id}`);
  return entry;
}
function available(id: string) {
  return command(id).isAvailable?.(context);
}
function run(id: string) {
  act(() => {
    void command(id).run(context);
  });
}
function fixture({ lookup }: { lookup?: (key: unknown) => unknown } = {}) {
  const records = tasks.map((task) => ({ ...task }));
  const updates: Record<string, unknown>[] = [];
  const rpc = {
    listProjects: () => ({ projects: [project] }),
    listFolders: () => ({ folders: [] }),
    listLabels: () => ({ labels: [label] }),
    listPresets: () => ({ presets: [] }),
    sidebarSummary: () => ({ projects: [] }),
    listTasks: (raw: unknown) => ({
      tasks: rpcInput(raw).parentTaskId ? [] : records,
      nextCursor: null,
    }),
    getTaskByKey: async (raw: unknown) => {
      const key = rpcInput(raw).taskKey;
      return {
        task: lookup ? await lookup(key) : (records.find((task) => task.key === key) ?? null),
      };
    },
    getTask: () => ({ task: null }),
    listAttachments: () => ({ attachments: [] }),
    listTaskThreads: () => ({ taskThreads: [] }),
    listTaskPullRequests: () => ({ pullRequests: [], unavailableThreadIds: [] }),
    listBbProjects: () => ({ bbProjects: [] }),
    updateTask: (raw: unknown) => {
      const input = rpcInput(raw);
      updates.push(input);
      const task = records.find((task) => task.id === input.taskId)!;
      Object.assign(task, input);
      return { ok: true, task: { ...task } };
    },
  };
  const render = (subPath = "task/TSK-1") => renderSlot(app.navPanels[0]!, { subPath }, { rpc });
  return { render, rpc, updates };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }));
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (
    this: HTMLElement,
  ) {
    const layout = this.closest<HTMLElement>("[data-properties-layout]");
    return (layout?.dataset.propertiesLayout === "rail"
      ? []
      : [{ width: 900, height: 600 }]) as unknown as DOMRectList;
  });
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function ready(slot: ReturnType<ReturnType<typeof fixture>["render"]>, key = "TSK-1") {
  await slot.findByRole("textbox", { name: "Task title" });
  await waitFor(() => expect(available("task-change-status")).toBe(true));
  expect(slot.container.textContent).toContain(key);
}

describe("task-detail command registration and targeting", () => {
  it("registers exactly nine stable detail commands without defaults or a comment command", () => {
    expect(
      TASKS_COMMANDS.filter((entry) => entry.id.startsWith("task-")).map(({ id, title }) => [
        id,
        title,
      ]),
    ).toEqual([
      ["task-change-status", "Tasks: Change status"],
      ["task-set-priority", "Tasks: Set priority"],
      ["task-set-due-date", "Tasks: Set due date"],
      ["task-edit-labels", "Tasks: Edit labels"],
      ["task-change-linked-bb-project", "Tasks: Change linked BB project"],
      ["task-dispatch", "Tasks: Dispatch task..."],
      ["task-previous", "Tasks: Previous task"],
      ["task-next", "Tasks: Next task"],
      ["task-back", "Tasks: Back"],
    ]);
    expect(TASKS_COMMANDS.every((entry) => entry.defaultShortcut === undefined)).toBe(true);
    for (const id of propertyIds) expect(available(id)).toBe(false);
  });
  it.each(["all", "active", "manage", `${project.id}?view=board`])(
    "rejects the %s route and never queues task navigation",
    async (route) => {
      const { render, updates } = fixture();
      const slot = render(route);
      await slot.findByRole("main", { name: "Tasks" });
      if (route === "all" || route.includes("view=board")) {
        const row = await slot.findByRole("button", { name: "Open TSK-1: Task 1" });
        row.focus();
        expect(document.activeElement).toBe(row);
      }
      for (const id of propertyIds) {
        expect(available(id)).toBe(false);
        run(id);
      }
      slot.rerender(<Panel subPath="task/TSK-1" />);
      await ready(slot);
      expect(slot.queryByRole("menu")).toBeNull();
      expect(updates).toEqual([]);
      expect(slot.navigateCalls).toEqual([]);
    },
  );
  it("does not make follow-up delivery handlers available", async () => {
    const slot = fixture().render();
    await ready(slot);
    for (const id of deferredIds) {
      expect(available(id)).toBe(false);
      run(id);
    }
    expect(slot.navigateCalls).toEqual([]);
    expect(slot.queryByRole("menu")).toBeNull();
  });
  it.each(["pending", "missing", "error", "mismatch"])("rejects a %s task", async (state) => {
    const { render, updates } = fixture({
      lookup: () => {
        if (state === "pending") return new Promise(() => {});
        if (state === "error") throw new Error("Fixture lookup failed");
        return state === "mismatch" ? tasks[1] : null;
      },
    });
    const slot = render();
    await act(async () => {});
    for (const id of propertyIds) {
      expect(available(id)).toBe(false);
      run(id);
    }
    expect(updates).toEqual([]);
    expect(slot.navigateCalls).toEqual([]);
  });
  it("does not target an embedded DetailView", async () => {
    const { rpc, updates } = fixture();
    const slot = renderSlot(
      {
        component: () => (
          <TasksRefreshProvider>
            <DetailView taskKey="TSK-1" />
          </TasksRefreshProvider>
        ),
      },
      { taskKey: "TSK-1" },
      { rpc },
    );
    await slot.findByRole("textbox", { name: "Task title" });
    for (const id of propertyIds) {
      expect(available(id)).toBe(false);
      run(id);
    }
    expect(updates).toEqual([]);
    expect(slot.queryByRole("menu")).toBeNull();
  });
  it.each(["hidden", "display", "visibility", "geometry"])(
    "rejects a retained panel hidden through %s",
    async (kind) => {
      const { render, updates } = fixture();
      const slot = render();
      await ready(slot);
      if (kind === "hidden") slot.container.hidden = true;
      if (kind === "display") slot.container.style.display = "none";
      if (kind === "visibility") slot.container.style.visibility = "hidden";
      if (kind === "geometry")
        vi.mocked(HTMLElement.prototype.getClientRects).mockReturnValue(
          [] as unknown as DOMRectList,
        );
      for (const id of propertyIds) {
        expect(available(id)).toBe(false);
        run(id);
      }
      expect(updates).toEqual([]);
      expect(slot.queryByRole("menu")).toBeNull();
    },
  );
  it("ignores palette and editable focus, but rejects two shown sessions", async () => {
    const { render } = fixture();
    const first = render();
    await ready(first);
    first.container.setAttribute("inert", "");
    first.container.setAttribute("aria-hidden", "true");
    first.getByRole("textbox", { name: "Task title", hidden: true }).focus();
    expect(available("task-change-status")).toBe(true);
    const second = render("task/TSK-2");
    await waitFor(() =>
      expect(second.container.querySelector('[aria-label="Task title"]')).not.toBeNull(),
    );
    expect(available("task-change-status")).toBe(false);
    run("task-change-status");
    expect(document.querySelector('[role="menu"]')).toBeNull();
    second.unmount();
    expect(available("task-change-status")).toBe(true);
  });
  it("targets the fresh task and persists its chosen due date", async () => {
    const { render, updates } = fixture();
    const slot = render();
    await ready(slot);
    const listed = command("task-set-due-date");
    expect(listed.isAvailable?.(context)).toBe(true);
    slot.rerender(<Panel subPath="task/TSK-2" />);
    await ready(slot, "TSK-2");
    fireEvent.keyDown(document, { key: "F9" });
    act(() => void listed.run(context));
    const input = await slot.findByLabelText("Due date");
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.change(input, { target: { value: "2026-08-09" } });
    await waitFor(() => expect(updates).toEqual([{ taskId: tasks[1]!.id, dueDate: "2026-08-09" }]));
    slot.rerender(<Panel subPath="all" />);
    expect(available("task-set-due-date")).toBe(false);
    run("task-set-due-date");
    slot.unmount();
    const reloaded = render("task/TSK-2");
    await ready(reloaded, "TSK-2");
    run("task-set-due-date");
    const persisted = await reloaded.findByLabelText("Due date");
    expect((persisted as HTMLInputElement).value).toBe("2026-08-09");
    expect(updates).toEqual([{ taskId: tasks[1]!.id, dueDate: "2026-08-09" }]);
    expect(slot.navigateCalls).toEqual([]);
  });
  it("retargets listed commands and cleans up route changes and remounts", async () => {
    const { render, updates } = fixture();
    const slot = render();
    await ready(slot);
    const listed = command("task-set-priority");
    slot.rerender(<Panel subPath="task/TSK-2" />);
    await ready(slot, "TSK-2");
    act(() => void listed.run(context));
    const high = await slot.findByRole("menuitem", { name: "High" });
    fireEvent.keyDown(high, { key: "Enter" });
    await waitFor(() => expect(updates).toEqual([{ taskId: tasks[1]!.id, priority: "high" }]));
    slot.rerender(<Panel subPath="all" />);
    expect(available("task-set-priority")).toBe(false);
    run("task-set-priority");
    slot.unmount();
    expect(available("task-change-status")).toBe(false);
    const reloaded = render();
    await ready(reloaded);
    run("task-change-status");
    expect(await reloaded.findByRole("menu")).toBeDefined();
  });
});

describe("property command keyboard workflow", () => {
  it.each(["inline", "rail"])(
    "opens the visible %s due-date picker and saves only explicit date choices",
    async (layout) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 6, 15, 12));
      vi.mocked(HTMLElement.prototype.getClientRects).mockImplementation(function (
        this: HTMLElement,
      ) {
        const owner = this.closest<HTMLElement>("[data-properties-layout]");
        return (owner && owner.dataset.propertiesLayout !== layout
          ? []
          : [{ width: 900, height: 600 }]) as unknown as DOMRectList;
      });
      const { render, updates } = fixture();
      const slot = render();
      await ready(slot);
      const properties = slot.container.querySelector<HTMLElement>(
        `[data-properties-layout="${layout}"]`,
      )!;
      const trigger = within(properties).getByRole("button", { name: "Set due date" });
      fireEvent.keyDown(document, { key: "F9" });
      run("task-set-due-date");
      const input = await slot.findByLabelText("Due date");
      expect(slot.getAllByLabelText("Due date")).toHaveLength(1);
      await waitFor(() => expect(document.activeElement).toBe(input));
      expect(updates).toEqual([]);
      fireEvent.keyDown(input, { key: "Escape" });
      await waitFor(() => expect(slot.queryByLabelText("Due date")).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(trigger));
      expect(updates).toEqual([]);
      for (const [name, dueDate] of [
        ["Today", "2026-07-15"],
        ["Tomorrow", "2026-07-16"],
        ["Next week", "2026-07-22"],
      ] as const) {
        run("task-set-due-date");
        const dateInput = await slot.findByLabelText("Due date");
        await waitFor(() => expect(document.activeElement).toBe(dateInput));
        const preset = slot.getByRole("button", { name: new RegExp(`^${name}`) });
        preset.focus();
        fireEvent.click(preset, { detail: 0 });
        await waitFor(() => expect(updates).toEqual([{ taskId: tasks[0]!.id, dueDate }]));
        updates.splice(0);
      }
      run("task-set-due-date");
      const customInput = await slot.findByLabelText("Due date");
      await waitFor(() => expect(document.activeElement).toBe(customInput));
      fireEvent.change(customInput, { target: { value: "" } });
      expect(updates).toEqual([]);
      fireEvent.change(customInput, { target: { value: "2026-08-09" } });
      await waitFor(() =>
        expect(updates).toEqual([{ taskId: tasks[0]!.id, dueDate: "2026-08-09" }]),
      );
      updates.splice(0);
      run("task-set-due-date");
      await slot.findByLabelText("Due date");
      const remove = slot.getByRole("button", { name: "Remove due date" });
      remove.focus();
      fireEvent.click(remove, { detail: 0 });
      await waitFor(() => expect(updates).toEqual([{ taskId: tasks[0]!.id, dueDate: null }]));
      updates.splice(0);
      fireEvent.pointerDown(trigger);
      fireEvent.click(trigger);
      await slot.findByLabelText("Due date");
      fireEvent.click(slot.getByRole("button", { name: /^Tomorrow/ }));
      await waitFor(() =>
        expect(updates).toEqual([{ taskId: tasks[0]!.id, dueDate: "2026-07-16" }]),
      );
      expect(slot.navigateCalls).toEqual([]);
    },
  );

  it("keeps the blocked-work confirmation before entering In progress", async () => {
    const blocker = { id: tasks[1]!.id, key: "TSK-2", title: "Task 2", status: "todo" as const };
    const blocked = { ...tasks[0]!, blockedBy: [blocker], openBlockerCount: 1, blocked: true };
    const { render, updates } = fixture({ lookup: () => blocked });
    const slot = render();
    await ready(slot);
    for (const confirm of [false, true]) {
      run("task-change-status");
      fireEvent.keyDown(await slot.findByRole("menuitem", { name: "In Progress" }), {
        key: "Enter",
      });
      await slot.findByRole("dialog", { name: "TSK-1 is blocked" });
      expect(updates).toEqual([]);
      fireEvent.click(slot.getByRole("button", { name: confirm ? "Start anyway" : "Cancel" }));
    }
    await waitFor(() => expect(updates).toEqual([{ taskId: tasks[0]!.id, status: "in_progress" }]));
  });

  it.each(
    ["route", "unmount", "hidden"].flatMap((change) =>
      ["task-change-status", "task-set-due-date"].flatMap((id) =>
        [false, true].map((afterFirstFrame) => ({ change, id, afterFirstFrame })),
      ),
    ),
  )(
    "cancels $id palette activation after $change changes with first frame run=$afterFirstFrame",
    async ({ change, id, afterFirstFrame }) => {
      const { render, updates } = fixture();
      const slot = render();
      await ready(slot);
      const frames: FrameRequestCallback[] = [];
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
      const cancel = vi.spyOn(window, "cancelAnimationFrame");
      run(id);
      expect(frames).toHaveLength(1);
      if (afterFirstFrame) act(() => frames[0]!(0));
      if (change === "route") slot.rerender(<Panel subPath="task/TSK-2" />);
      else if (change === "unmount") slot.unmount();
      else slot.container.hidden = true;
      if (change !== "hidden") expect(cancel).toHaveBeenCalled();
      act(() => {
        if (!afterFirstFrame) frames[0]!(0);
        frames[1]!(16);
      });
      expect(document.querySelector('[role="menu"]')).toBeNull();
      expect(document.querySelector('input[aria-label="Due date"]')).toBeNull();
      expect(updates).toEqual([]);
      expect(slot.navigateCalls).toEqual([]);
    },
  );
  it.each(["inline", "rail"])(
    "opens only visible %s controls, focuses, cancels and saves the open task",
    async (layout) => {
      vi.mocked(HTMLElement.prototype.getClientRects).mockImplementation(function (
        this: HTMLElement,
      ) {
        const owner = this.closest<HTMLElement>("[data-properties-layout]");
        return (owner && owner.dataset.propertiesLayout !== layout
          ? []
          : [{ width: 900, height: 600 }]) as unknown as DOMRectList;
      });
      const { render, updates } = fixture();
      const slot = render();
      await ready(slot);
      const properties = slot.container.querySelector<HTMLElement>(
        `[data-properties-layout="${layout}"]`,
      )!;
      for (const [id, triggerName, role, choice, update] of [
        ["task-change-status", "Todo", "menuitem", "Done", { status: "done" }],
        ["task-set-priority", "No priority", "menuitem", "High", { priority: "high" }],
        ["task-edit-labels", "Edit labels", "option", "frontend", { labelIds: [label.id] }],
      ] as const) {
        const trigger = within(properties).getByRole("button", { name: triggerName });
        fireEvent.keyDown(window, { key: "F9" });
        run(id);
        const option = await slot.findByRole(role, { name: choice });
        await waitFor(() =>
          expect(
            option.closest('[role="menu"], [role="dialog"]')?.contains(document.activeElement),
          ).toBe(true),
        );
        expect(slot.getAllByRole(role, { name: choice })).toHaveLength(1);
        expect(updates).toEqual([]);
        fireEvent.keyDown(document.activeElement!, { key: "Escape" });
        await waitFor(() => expect(slot.queryByRole(role, { name: choice })).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(trigger));
        expect(updates).toEqual([]);
        run(id);
        const selected = await slot.findByRole(role, { name: choice });
        if (role === "option")
          fireEvent.keyDown(slot.getByPlaceholderText("Add labels…"), { key: "Enter" });
        else fireEvent.keyDown(selected, { key: "Enter" });
        await waitFor(() => expect(updates).toEqual([{ taskId: tasks[0]!.id, ...update }]));
        updates.splice(0);
        if (role === "option") fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      }
      expect(slot.navigateCalls).toEqual([]);
    },
  );
});
