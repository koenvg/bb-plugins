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
const label: Label = {
  id: "01HZZZZZZZZZZZZZZZZZZZZZL1",
  projectId: PROJECT_ID,
  name: "frontend",
  color: "#00f",
  createdAt: "2026-07-15T00:00:00.000Z",
} as Label;

function task(number: number, overrides: Partial<Task> = {}): Task {
  return makeTask({
    id: `01HZZZZZZZZZZZZZZZZZZZZZT${number}`,
    projectId: PROJECT_ID,
    number,
    key: `TSK-${number}`,
    title: `Title ${number}`,
    position: number,
    ...overrides,
  });
}

const TASKS = [
  task(1, { status: "todo" }),
  task(2, { status: "todo" }),
  task(3, { status: "in_progress" }),
  task(4, { status: "todo", parentTaskId: "01HZZZZZZZZZZZZZZZZZZZZZT1" }),
];

function render(updates: Record<string, unknown>[] = []) {
  return renderSlot(
    app.navPanels[0]!,
    { subPath: PROJECT_ID },
    {
      rpc: {
        listProjects: () => ({ projects: [project] }),
        listFolders: () => ({ folders: [] }),
        listPresets: () => ({ presets: [] }),
        sidebarSummary: () => ({ projects: [] }),
        listLabels: () => ({ labels: [label] }),
        listTasks: () => ({ tasks: TASKS, nextCursor: null }),
        getTaskByKey: () => ({ task: null }),
        listTaskThreads: () => ({ taskThreads: [] }),
        updateTask: (raw) => {
          const input = rpcInput(raw);
          updates.push(input);
          const current = TASKS.find((entry) => entry.id === input.taskId)!;
          return { ok: true, task: { ...current, ...input } };
        },
      },
    },
  );
}

function focusedRowName() {
  return document.activeElement?.getAttribute("aria-label");
}

function press(key: string) {
  fireEvent.keyDown(document.activeElement ?? window, { key });
}

describe("list keyboard navigation", () => {
  it("focuses the first row on the first press", async () => {
    const slot = render();
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    press("j");
    expect(focusedRowName()).toBe("Open TSK-1: Title 1");
  });

  it("moves through visible rows with j/k and arrows, including expanded subtasks", async () => {
    const slot = render();
    fireEvent.click(
      await slot.findByRole("button", { name: "Expand subtasks of TSK-1" }),
    );
    await slot.findByRole("button", { name: "Open TSK-4: Title 4" });
    press("j");
    press("j");
    expect(focusedRowName()).toBe("Open TSK-4: Title 4");
    press("ArrowDown");
    expect(focusedRowName()).toBe("Open TSK-2: Title 2");
    press("k");
    press("ArrowUp");
    expect(focusedRowName()).toBe("Open TSK-1: Title 1");
  });

  it("keeps focus on the first and last rows at the list ends", async () => {
    const slot = render();
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    press("j");
    press("k");
    expect(focusedRowName()).toBe("Open TSK-1: Title 1");
    press("j");
    press("j");
    press("j");
    expect(focusedRowName()).toBe("Open TSK-3: Title 3");
  });

  it("continues from the row that holds focus when focus is on a row control", async () => {
    const slot = render();
    const expand = await slot.findByRole("button", {
      name: "Expand subtasks of TSK-1",
    });
    expand.focus();
    press("j");
    expect(focusedRowName()).toBe("Open TSK-2: Title 2");
  });

  it.each(["o", "Enter"])("opens the focused task with %s", async (key) => {
    const slot = render();
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    press("j");
    press("j");
    press(key);
    expect(slot.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: "task/TSK-2" },
    });
  });

  it("leaves Enter alone when no row has focus", async () => {
    const slot = render();
    const button = await slot.findByRole("button", { name: /new task/i });
    button.focus();
    const event = fireEvent.keyDown(button, { key: "Enter" });
    expect(event).toBe(true);
    expect(slot.navigateCalls).toEqual([]);
  });
});

describe("list row menus from the keyboard", () => {
  it("opens the status menu on s and returns focus to the row on Escape", async () => {
    const slot = render();
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    press("j");
    press("s");
    const menu = await slot.findByRole("menu");
    expect(menu.textContent).toContain("Change status");
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(slot.queryByRole("menu")).toBeNull());
    await waitFor(() =>
      expect(focusedRowName()).toBe("Open TSK-1: Title 1"),
    );
  });

  it("opens the priority menu on p", async () => {
    const slot = render();
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    press("j");
    press("p");
    const menu = await slot.findByRole("menu");
    expect(menu.textContent).toContain("Set priority");
  });

  it("opens the labels menu on l and saves a toggled label", async () => {
    const updates: Record<string, unknown>[] = [];
    const slot = render(updates);
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    press("j");
    press("l");
    fireEvent.click(await slot.findByRole("option", { name: "frontend" }));
    await waitFor(() =>
      expect(updates).toContainEqual({
        taskId: TASKS[0]!.id,
        labelIds: [label.id],
      }),
    );
  });
});
