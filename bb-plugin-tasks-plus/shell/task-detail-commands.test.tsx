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
const bbProjects = [
  { id: "proj_first", name: "First workspace" },
  { id: "proj_second", name: "Second workspace" },
];
const linkedProjectCommand = "task-change-linked-bb-project";
const propertyIds = [
  "task-change-status",
  "task-set-priority",
  "task-edit-labels",
  "task-set-due-date",
  linkedProjectCommand,
];
const navigationIds = ["task-previous", "task-next", "task-back"];
const taskCommandIds = [...propertyIds, ...navigationIds];

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
function fixture({
  lookup,
  projectLookup,
  siblingLookup,
  taskRecords = tasks,
}: {
  lookup?: (key: unknown) => unknown;
  projectLookup?: () => unknown;
  siblingLookup?: (input: Record<string, unknown>) => unknown;
  taskRecords?: typeof tasks;
} = {}) {
  const records = taskRecords.map((task) => ({ ...task }));
  const tracker = { ...project, linkedBbProjectId: "proj_first" as string | null };
  const projectUpdates: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const rpc = {
    listProjects: () => (projectLookup ? projectLookup() : { projects: [{ ...tracker }] }),
    listFolders: () => ({ folders: [] }),
    listLabels: () => ({ labels: [label] }),
    listPresets: () => ({ presets: [] }),
    sidebarSummary: () => ({ projects: [] }),
    listTasks: vi.fn((raw: unknown) => {
      const input = rpcInput(raw);
      if (input.parentTaskId === null && siblingLookup) return siblingLookup(input);
      return { tasks: input.parentTaskId ? [] : records, nextCursor: null };
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
    listBbProjects: vi.fn(() => ({ bbProjects })),
    updateProject: vi.fn((raw: unknown) => {
      const input = rpcInput(raw);
      projectUpdates.push(input);
      Object.assign(tracker, input);
      return { project: { ...tracker } };
    }),
    delegate: vi.fn(),
    updateTask: (raw: unknown) => {
      const input = rpcInput(raw);
      updates.push(input);
      const task = records.find((task) => task.id === input.taskId)!;
      Object.assign(task, input);
      return { ok: true, task: { ...task } };
    },
  };
  const render = (subPath = "task/TSK-1") => renderSlot(app.navPanels[0]!, { subPath }, { rpc });
  return { render, rpc, updates, projectUpdates, tracker };
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
    for (const id of taskCommandIds) expect(available(id)).toBe(false);
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
      for (const id of taskCommandIds) {
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
    for (const id of taskCommandIds) {
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
    for (const id of taskCommandIds) {
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
      for (const id of taskCommandIds) {
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
    for (const id of ["task-change-status", "task-next", "task-back"]) {
      expect(available(id)).toBe(true);
    }
    const second = render("task/TSK-2");
    await waitFor(() =>
      expect(second.container.querySelector('[aria-label="Task title"]')).not.toBeNull(),
    );
    for (const id of ["task-change-status", ...navigationIds]) {
      expect(available(id)).toBe(false);
      run(id);
    }
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(first.navigateCalls).toEqual([]);
    expect(second.navigateCalls).toEqual([]);
    second.unmount();
    for (const id of ["task-change-status", "task-next", "task-back"]) {
      expect(available(id)).toBe(true);
    }
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

describe("task navigation commands", () => {
  let frames: FrameRequestCallback[];
  beforeEach(() => {
    frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
  });
  const flush = () =>
    act(() => {
      while (frames.length) frames.shift()!(0);
    });
  const expectNoWrites = ({ updates, projectUpdates, rpc }: ReturnType<typeof fixture>) => {
    expect(updates).toEqual([]);
    expect(projectUpdates).toEqual([]);
    expect(rpc.delegate).not.toHaveBeenCalled();
  };

  it("shares status-grouped pager order and retargets after the panel actually changes task", async () => {
    const taskRecords = [
      makeTask({ ...tasks[0]!, id: "task-4", key: "TSK-4", number: 4, status: "done" }),
      { ...tasks[1]!, dueDate: "2026-08-02" },
      makeTask({ ...tasks[0]!, id: "task-3", key: "TSK-3", number: 3, status: "backlog" }),
      { ...tasks[0]!, dueDate: "2026-08-01" },
    ];
    const f = fixture({ taskRecords });
    const slot = f.render("task/TSK-2");
    await ready(slot, "TSK-2");
    await waitFor(() => expect(available("task-next")).toBe(true));
    expect(available("task-previous")).toBe(true);
    run("task-previous");
    flush();
    await waitFor(() =>
      expect(slot.navigateCalls).toEqual([
        { method: "toPluginPanel", path: "tasks", options: { subPath: "task/TSK-3" } },
      ]),
    );
    const listedNext = command("task-next");
    run("task-next");
    flush();
    await waitFor(() =>
      expect(slot.navigateCalls.at(-1)).toEqual({
        method: "toPluginPanel",
        path: "tasks",
        options: { subPath: "task/TSK-1" },
      }),
    );
    slot.rerender(<Panel subPath="task/TSK-1" />);
    await ready(slot);
    act(() => void listedNext.run(context));
    flush();
    await waitFor(() =>
      expect(slot.navigateCalls.at(-1)).toEqual({
        method: "toPluginPanel",
        path: "tasks",
        options: { subPath: "task/TSK-4" },
      }),
    );
    run("task-previous");
    flush();
    await waitFor(() =>
      expect(slot.navigateCalls.at(-1)).toEqual({
        method: "toPluginPanel",
        path: "tasks",
        options: { subPath: "task/TSK-2" },
      }),
    );
    run("task-set-due-date");
    flush();
    const dueDate = await slot.findByLabelText("Due date");
    expect((dueDate as HTMLInputElement).value).toBe("2026-08-01");
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Task 1");
    expect(
      f.rpc.listTasks.mock.calls
        .map(([raw]) => rpcInput(raw))
        .filter((input) => input.parentTaskId === null),
    ).toEqual([{ projectId: project.id, parentTaskId: null, limit: 500 }]);
    expectNoWrites(f);
  });

  it.each([
    ["all", "all", false],
    ["active", "active", false],
    [`${project.id}?view=list&task=TSK-2`, `${project.id}?view=list&task=TSK-2`, true],
    [`${project.id}?view=board`, `${project.id}?view=board`, true],
  ] as const)(
    "keeps %s pager scope and Back destination after paging",
    async (origin, destination, scoped) => {
      const f = fixture();
      const slot = f.render(origin);
      if (origin.includes("&task=")) await slot.findByRole("textbox", { name: "Task title" });
      else await slot.findByRole("button", { name: "Open TSK-1: Task 1" });
      f.rpc.listTasks.mockClear();
      slot.rerender(<Panel subPath="task/TSK-1" />);
      await ready(slot);
      await waitFor(() => expect(available("task-next")).toBe(true));
      expect(
        f.rpc.listTasks.mock.calls
          .map(([raw]) => rpcInput(raw))
          .filter((input) => input.parentTaskId === null),
      ).toEqual([
        scoped
          ? { projectId: project.id, parentTaskId: null, limit: 500 }
          : { parentTaskId: null, limit: 500 },
      ]);
      run("task-next");
      flush();
      await waitFor(() =>
        expect(slot.navigateCalls.at(-1)).toEqual({
          method: "toPluginPanel",
          path: "tasks",
          options: { subPath: "task/TSK-2" },
        }),
      );
      slot.rerender(<Panel subPath="task/TSK-2" />);
      await ready(slot, "TSK-2");
      run("task-back");
      flush();
      await waitFor(() =>
        expect(slot.navigateCalls.at(-1)).toEqual({
          method: "toPluginPanel",
          path: "tasks",
          options: { subPath: destination },
        }),
      );
      fireEvent.click(slot.getByRole("button", { name: "Back (Esc)" }));
      await waitFor(() => expect(slot.navigateCalls).toHaveLength(3));
      fireEvent.keyDown(slot.getByRole("main", { name: "Tasks" }), { key: "Escape" });
      await waitFor(() =>
        expect(slot.navigateCalls.slice(1)).toEqual([
          { method: "toPluginPanel", path: "tasks", options: { subPath: destination } },
          { method: "toPluginPanel", path: "tasks", options: { subPath: destination } },
          { method: "toPluginPanel", path: "tasks", options: { subPath: destination } },
        ]),
      );
      expectNoWrites(f);
    },
  );

  it("keeps commands usable with hidden narrow pager controls and uses All for direct-link Back", async () => {
    const f = fixture();
    const slot = f.render();
    await ready(slot);
    await waitFor(() => expect(available("task-next")).toBe(true));
    const pager = slot.getByRole("button", { name: "Next task" }).parentElement!;
    pager.style.display = "none";
    vi.mocked(HTMLElement.prototype.getClientRects).mockImplementation(function (
      this: HTMLElement,
    ) {
      return (this.closest(".tabular-nums, [data-properties-layout='rail']")
        ? []
        : [{ width: 900, height: 600 }]) as unknown as DOMRectList;
    });
    expect(pager.getClientRects()).toHaveLength(0);
    expect(slot.getByRole("main", { name: "Tasks" }).getClientRects()).toHaveLength(1);
    expect(available("task-next")).toBe(true);
    run("task-next");
    flush();
    await waitFor(() =>
      expect(slot.navigateCalls).toEqual([
        { method: "toPluginPanel", path: "tasks", options: { subPath: "task/TSK-2" } },
      ]),
    );
    slot.rerender(<Panel subPath="task/TSK-2" />);
    await ready(slot, "TSK-2");
    expect(available("task-previous")).toBe(true);
    expect(available("task-back")).toBe(true);
    run("task-back");
    flush();
    await waitFor(() =>
      expect(slot.navigateCalls.at(-1)).toEqual({
        method: "toPluginPanel",
        path: "tasks",
        options: { subPath: "all" },
      }),
    );
    expectNoWrites(f);
  });

  it.each([
    ["TSK-1", "task-previous", "task-next", "task/TSK-2"],
    ["TSK-2", "task-next", "task-previous", "task/TSK-1"],
  ])("makes the %s boundary a no-op without replay", async (key, absent, present, destination) => {
    const f = fixture();
    const slot = f.render(`task/${key}`);
    await ready(slot, key);
    await waitFor(() => expect(available(present)).toBe(true));
    expect(available(absent)).toBe(false);
    run(absent);
    flush();
    expect(slot.navigateCalls).toEqual([]);
    slot.rerender(<Panel subPath={destination} />);
    await ready(slot, destination.slice(5));
    flush();
    expect(slot.navigateCalls).toEqual([]);
    run(absent);
    flush();
    await waitFor(() =>
      expect(slot.navigateCalls).toEqual([
        { method: "toPluginPanel", path: "tasks", options: { subPath: `task/${key}` } },
      ]),
    );
    expectNoWrites(f);
  });

  it.each(["single", "empty", "absent", "error"])(
    "rejects unknown or absent destinations for %s siblings",
    async (state) => {
      const f = fixture({
        siblingLookup: () => {
          if (state === "error") throw new Error("Sibling fixture unavailable");
          return {
            tasks: state === "single" ? [tasks[0]] : state === "absent" ? [tasks[1]] : [],
            nextCursor: null,
          };
        },
      });
      const slot = f.render();
      await ready(slot);
      expect(available("task-back")).toBe(true);
      for (const id of ["task-previous", "task-next"]) {
        expect(available(id)).toBe(false);
        run(id);
        flush();
      }
      expect(slot.navigateCalls).toEqual([]);
      run("task-back");
      flush();
      await waitFor(() =>
        expect(slot.navigateCalls).toEqual([
          { method: "toPluginPanel", path: "tasks", options: { subPath: "all" } },
        ]),
      );
      expectNoWrites(f);
    },
  );

  it("keeps retained sibling destinations usable during refresh", async () => {
    let resolveSiblings!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveSiblings = resolve;
    });
    const siblingLookup = vi.fn((): unknown => ({ tasks, nextCursor: null }));
    const f = fixture({ siblingLookup });
    const slot = f.render();
    await ready(slot);
    await waitFor(() => expect(available("task-next")).toBe(true));
    siblingLookup.mockImplementation(() => pending);
    await act(async () => slot.behavior.emitRealtime("tasks:changed", {}));
    await ready(slot);
    expect(siblingLookup).toHaveBeenCalledTimes(2);
    expect((slot.getByRole("button", { name: "Next task" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(available("task-next")).toBe(true);
    run("task-next");
    flush();
    await waitFor(() =>
      expect(slot.navigateCalls).toEqual([
        { method: "toPluginPanel", path: "tasks", options: { subPath: "task/TSK-2" } },
      ]),
    );
    await act(async () => resolveSiblings({ tasks: [tasks[1], tasks[0]], nextCursor: null }));
    await waitFor(() => expect(available("task-next")).toBe(false));
    expect(available("task-previous")).toBe(true);
    expectNoWrites(f);
  });

  it("never queues navigation while inventory or initial siblings are pending", async () => {
    let resolveProjects!: (value: unknown) => void;
    let resolveSiblings!: (value: unknown) => void;
    const projects = new Promise((resolve) => {
      resolveProjects = resolve;
    });
    const siblings = new Promise((resolve) => {
      resolveSiblings = resolve;
    });
    const f = fixture({ projectLookup: () => projects, siblingLookup: () => siblings });
    const slot = f.render();
    await ready(slot);
    const invokeUnavailable = () => {
      for (const id of ["task-previous", "task-next"]) {
        expect(available(id)).toBe(false);
        run(id);
      }
      flush();
    };
    invokeUnavailable();
    await act(async () => resolveProjects({ projects: [project] }));
    invokeUnavailable();
    await act(async () => resolveSiblings({ tasks, nextCursor: null }));
    await waitFor(() => expect(available("task-next")).toBe(true));
    flush();
    expect(slot.navigateCalls).toEqual([]);
    run("task-next");
    flush();
    await waitFor(() =>
      expect(slot.navigateCalls).toEqual([
        { method: "toPluginPanel", path: "tasks", options: { subPath: "task/TSK-2" } },
      ]),
    );
    expectNoWrites(f);
  });

  it.each(["route", "task", "unmount", "hidden", "loading", "ambiguous"])(
    "rejects deferred navigation after %s changes",
    async (change) => {
      const f = fixture({
        lookup: (key) =>
          key === "TSK-2" && change === "loading"
            ? new Promise(() => {})
            : tasks.find((task) => task.key === key),
      });
      const slot = f.render();
      await ready(slot);
      await waitFor(() => expect(available("task-next")).toBe(true));
      run(change === "unmount" ? "task-back" : "task-next");
      expect(frames).toHaveLength(1);
      act(() => frames.shift()!(0));
      let second: ReturnType<typeof f.render> | undefined;
      if (change === "route") slot.rerender(<Panel subPath="all" />);
      if (change === "unmount") slot.unmount();
      if (change === "hidden") slot.container.hidden = true;
      if (change === "loading") slot.rerender(<Panel subPath="task/TSK-2" />);
      if (change === "task") {
        slot.rerender(<Panel subPath="task/TSK-2" />);
        await ready(slot, "TSK-2");
      }
      if (change === "ambiguous") {
        second = f.render();
        await second.findByRole("textbox", { name: "Task title" });
      }
      flush();
      expect(slot.navigateCalls).toEqual([]);
      if (second) expect(second.navigateCalls).toEqual([]);
      second?.unmount();
      expectNoWrites(f);
    },
  );
});

describe("linked BB project command", () => {
  it.each(["pending", "missing", "error"])("rejects a %s tracker project", async (state) => {
    const { render, projectUpdates } = fixture({
      projectLookup: () => {
        if (state === "pending") return new Promise(() => {});
        if (state === "error") throw new Error("Tracker unavailable");
        return { projects: [] };
      },
    });
    const slot = render();
    await ready(slot);
    expect(available(linkedProjectCommand)).toBe(false);
    run(linkedProjectCommand);
    await act(async () => {});
    expect(slot.queryByLabelText("Linked bb project")).toBeNull();
    expect(projectUpdates).toEqual([]);
  });

  it("becomes available after the tracker loads without replaying an earlier invocation", async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const { render, projectUpdates } = fixture({ projectLookup: () => pending });
    const slot = render();
    await ready(slot);
    expect(available(linkedProjectCommand)).toBe(false);
    run(linkedProjectCommand);
    await act(async () => resolve({ projects: [project] }));
    await waitFor(() => expect(available(linkedProjectCommand)).toBe(true));
    expect(slot.queryByLabelText("Linked bb project")).toBeNull();
    expect(projectUpdates).toEqual([]);
    run(linkedProjectCommand);
    expect((await slot.findByLabelText("Linked bb project")).textContent).toBe("Not linked");
  });

  it("retargets a listed command to the newly shown task's tracker", async () => {
    const otherProject = { ...project, id: "other-tracker", name: "Other tracker" };
    const { render, projectUpdates, updates, rpc } = fixture({
      lookup: (key) => (key === "TSK-2" ? { ...tasks[1], projectId: otherProject.id } : tasks[0]),
      projectLookup: () => ({ projects: [project, otherProject] }),
    });
    const slot = render();
    await ready(slot);
    const listed = command(linkedProjectCommand);
    expect(listed.isAvailable?.(context)).toBe(true);
    slot.rerender(<Panel subPath="task/TSK-2" />);
    await ready(slot, "TSK-2");
    act(() => void listed.run(context));
    const select = await slot.findByLabelText("Linked bb project");
    expect(slot.getByText("Tracker project: Other tracker")).toBeDefined();
    fireEvent.click(select);
    fireEvent.click(await slot.findByRole("option", { name: "First workspace" }));
    fireEvent.click(slot.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(projectUpdates).toEqual([
        { projectId: "other-tracker", linkedBbProjectId: "proj_first" },
      ]),
    );
    expect(updates).toEqual([]);
    expect(rpc.delegate).not.toHaveBeenCalled();
    expect(slot.navigateCalls).toEqual([]);
  });

  it.each(["inline", "rail"])("edits only the shared tracker link in %s", async (layout) => {
    vi.mocked(HTMLElement.prototype.getClientRects).mockImplementation(function (
      this: HTMLElement,
    ) {
      const owner = this.closest<HTMLElement>("[data-properties-layout]");
      return (owner && owner.dataset.propertiesLayout !== layout
        ? []
        : [{ width: 900, height: 600 }]) as unknown as DOMRectList;
    });
    const { render, rpc, updates, projectUpdates, tracker } = fixture();
    const slot = render();
    await ready(slot);
    await waitFor(() => expect(available(linkedProjectCommand)).toBe(true));
    const properties = slot.container.querySelector<HTMLElement>(
      `[data-properties-layout="${layout}"]`,
    )!;
    const trigger = within(properties).getByRole("button", { name: "Edit dispatch target" });
    fireEvent.keyDown(document, { key: "F9" });
    run(linkedProjectCommand);
    const select = await slot.findByRole("combobox", { name: "Linked bb project" });
    expect(slot.getAllByRole("combobox", { name: "Linked bb project" })).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toBe(select));
    expect(select.textContent).toBe("First workspace");
    expect(slot.getByText("Tracker project: Command fixture")).toBeDefined();
    expect(slot.getByText("This link applies to all tasks in Command fixture.")).toBeDefined();
    expect(projectUpdates).toEqual([]);
    fireEvent.click(select);
    fireEvent.click(await slot.findByRole("option", { name: "Second workspace" }));
    fireEvent.keyDown(select, { key: "Escape" });
    await waitFor(() => expect(slot.queryByLabelText("Linked bb project")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(projectUpdates).toEqual([]);
    run(linkedProjectCommand);
    const reopened = await slot.findByLabelText("Linked bb project");
    expect(reopened.textContent).toBe("First workspace");
    fireEvent.click(reopened);
    fireEvent.click(await slot.findByRole("option", { name: "Second workspace" }));
    rpc.updateProject.mockImplementationOnce(() => {
      throw new Error("Link save failed");
    });
    fireEvent.click(slot.getByRole("button", { name: "Save" }));
    await slot.findByText("Link save failed");
    expect(slot.getByLabelText("Linked bb project").textContent).toBe("Second workspace");
    expect(projectUpdates).toEqual([]);
    fireEvent.click(slot.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(projectUpdates).toEqual([{ projectId: project.id, linkedBbProjectId: "proj_second" }]),
    );
    await waitFor(() => expect(slot.queryByLabelText("Linked bb project")).toBeNull());
    expect(tracker.linkedBbProjectId).toBe("proj_second");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    slot.unmount();
    const reloaded = render("task/TSK-2");
    await ready(reloaded, "TSK-2");
    run(linkedProjectCommand);
    expect((await reloaded.findByLabelText("Linked bb project")).textContent).toBe(
      "Second workspace",
    );
    fireEvent.click(reloaded.getByRole("button", { name: "Unlink" }));
    await waitFor(() =>
      expect(projectUpdates).toEqual([
        { projectId: project.id, linkedBbProjectId: "proj_second" },
        { projectId: project.id, linkedBbProjectId: null },
      ]),
    );
    expect(tracker.linkedBbProjectId).toBeNull();
    expect(rpc.listBbProjects).toHaveBeenCalledTimes(2);
    expect(updates).toEqual([]);
    expect(rpc.delegate).not.toHaveBeenCalled();
    expect(reloaded.navigateCalls).toEqual([]);
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
      ["task-change-status", "task-set-due-date", linkedProjectCommand].flatMap((id) =>
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
      expect(document.querySelector('[aria-label="Linked bb project"]')).toBeNull();
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
