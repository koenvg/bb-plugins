// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeTask, rpcInput } from "../../test-fixtures.js";
import type { Label, Task } from "../../shared/contract.js";

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
window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};

const app = await loadPluginApp(() => import("../../app"));

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

const PROJECT_ID = "01HZZZZZZZZZZZZZZZZZZZZZP1";
const project = {
  id: PROJECT_ID,
  name: "Tasks Plugin",
  prefix: "TSK",
  nextTaskNumber: 9,
  color: "blue",
  folderId: null,
  linkedBbProjectId: null,
  createdAt: "2026-07-15T00:00:00.000Z",
};
const label = {
  id: "01HZZZZZZZZZZZZZZZZZZZZZL1",
  projectId: PROJECT_ID,
  name: "frontend",
  color: "#00f",
  createdAt: "2026-07-15T00:00:00.000Z",
} as Label;
const preset = {
  id: "01HZZZZZZZZZZZZZZZZZZZZZE1",
  name: "Default env",
  providerId: "claude-code",
  modelId: "claude-sonnet-5",
  reasoningLevel: "medium",
  serviceTier: null,
  permissionMode: "accept-edits",
  environmentKind: "project-default",
  baseBranch: null,
  machineId: null,
  instructions: "",
  builtin: false,
  createdAt: "2026-07-15T00:00:00.000Z",
};

function task(number: number, status: Task["status"]): Task {
  return makeTask({
    id: `01HZZZZZZZZZZZZZZZZZZZZZT${number}`,
    projectId: PROJECT_ID,
    number,
    key: `TSK-${number}`,
    title: `Title ${number}`,
    position: number,
    status,
  });
}

const TASKS = [task(1, "todo"), task(2, "todo"), task(3, "in_progress")];

function render(
  taskKey: string,
  { presets = [preset], calls = [] as string[], delegate = () => ({ ok: true }) as unknown } = {},
) {
  return renderSlot(
    app.navPanels[0]!,
    { subPath: `task/${taskKey}` },
    {
      rpc: {
        listProjects: () => ({ projects: [project] }),
        listFolders: () => ({ folders: [] }),
        listPresets: () => ({ presets }),
        sidebarSummary: () => ({ projects: [] }),
        listLabels: () => ({ labels: [label] }),
        listTasks: (raw) => {
          const input = rpcInput(raw);
          return {
            tasks: TASKS.filter(
              (entry) =>
                input.parentTaskId === undefined || entry.parentTaskId === input.parentTaskId,
            ),
            nextCursor: null,
          };
        },
        getTaskByKey: (raw) => ({
          task: TASKS.find((entry) => entry.key === rpcInput(raw).taskKey) ?? null,
        }),
        getTask: () => ({ task: null }),
        listAttachments: () => ({ attachments: [] }),
        listTaskThreads: () => ({ taskThreads: [] }),
        listTaskPullRequests: () => ({
          pullRequests: [],
          unavailableThreadIds: [],
        }),
        getTaskActivity: () => ({ entries: [] }),
        listBbProjects: () => ({ bbProjects: [] }),
        delegate: () => {
          calls.push("delegate");
          return delegate();
        },
      },
    },
  );
}

async function ready(slot: ReturnType<typeof render>, position: string) {
  await slot.findByText(position);
}

describe("task detail pager keys", () => {
  it("opens the next task on ]", async () => {
    const slot = render("TSK-1");
    await ready(slot, "1 / 3");
    fireEvent.keyDown(window, { key: "]" });
    expect(slot.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: "task/TSK-2" },
    });
  });

  it("opens the previous task on [", async () => {
    const slot = render("TSK-2");
    await ready(slot, "2 / 3");
    fireEvent.keyDown(window, { key: "[" });
    expect(slot.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: "task/TSK-1" },
    });
  });

  it("stays on the last task on ] and on the first task on [", async () => {
    const last = render("TSK-3");
    await ready(last, "3 / 3");
    fireEvent.keyDown(window, { key: "]" });
    expect(last.navigateCalls).toEqual([]);
    cleanup();

    const first = render("TSK-1");
    await ready(first, "1 / 3");
    fireEvent.keyDown(window, { key: "[" });
    expect(first.navigateCalls).toEqual([]);
  });
});

describe("task detail property keys", () => {
  it("opens one status menu on s", async () => {
    const slot = render("TSK-1");
    await ready(slot, "1 / 3");
    fireEvent.keyDown(window, { key: "s" });
    const menus = await slot.findAllByRole("menu");
    expect(menus).toHaveLength(1);
    expect(menus[0]!.textContent).toContain("In Review");
  });

  it("opens one priority menu on p", async () => {
    const slot = render("TSK-1");
    await ready(slot, "1 / 3");
    fireEvent.keyDown(window, { key: "p" });
    const menus = await slot.findAllByRole("menu");
    expect(menus).toHaveLength(1);
    expect(menus[0]!.textContent).toContain("Urgent");
  });

  it("opens the labels picker on l", async () => {
    const slot = render("TSK-1");
    await ready(slot, "1 / 3");
    fireEvent.keyDown(window, { key: "l" });
    expect(await slot.findByRole("option", { name: "frontend" })).toBeDefined();
  });

  it("opens the dispatch preset menu on d without dispatching", async () => {
    const calls: string[] = [];
    const slot = render("TSK-1", { calls });
    await ready(slot, "1 / 3");
    await waitFor(() => expect(slot.getAllByText("Default env").length).toBeGreaterThan(0));
    fireEvent.keyDown(window, { key: "d" });
    const menu = await slot.findByRole("menu");
    expect(menu.textContent).toContain("Dispatch with preset");
    expect(calls).toEqual([]);
  });

  it("does not open the preset menu later when d was pressed during a dispatch", async () => {
    let finish: (value: unknown) => void = () => {};
    const slot = render("TSK-1", {
      delegate: () => new Promise((resolve) => (finish = resolve)),
    });
    await ready(slot, "1 / 3");
    const [dispatchButton] = await slot.findAllByRole("button", {
      name: "Default env",
    });
    fireEvent.click(dispatchButton!);
    await slot.findAllByText("Dispatching…");
    fireEvent.keyDown(window, { key: "d" });
    finish({ ok: true });
    await waitFor(() => expect(slot.queryAllByText("Dispatching…")).toHaveLength(0));
    expect(slot.queryByRole("menu")).toBeNull();
  });

  it("ignores d when there are no presets", async () => {
    const slot = render("TSK-1", { presets: [] });
    await ready(slot, "1 / 3");
    await slot.findAllByText("Add a preset…");
    fireEvent.keyDown(window, { key: "d" });
    expect(slot.queryByRole("menu")).toBeNull();
  });
});

describe("task detail comment key", () => {
  it("focuses the comment box on m and lets c be typed there", async () => {
    const slot = render("TSK-1");
    await ready(slot, "1 / 3");
    const activity = await slot.findByRole("region", { name: "Activity" });
    await waitFor(() => expect(activity.querySelector('[contenteditable="true"]')).not.toBeNull());
    fireEvent.keyDown(window, { key: "m" });
    await waitFor(() => expect(activity.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement!, { key: "c" });
    expect(slot.queryByRole("dialog")).toBeNull();
  });
});
