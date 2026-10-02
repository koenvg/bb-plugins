// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeTask, rpcInput } from "../test-fixtures.js";
import type { Task } from "../shared/contract.js";
import { SHORTCUTS } from "./shortcuts.js";

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

const app = await loadPluginApp(() => import("../app"));
const { loadViewMode } = await import("./view-preference.js");

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const PROJECT_ID = "01HZZZZZZZZZZZZZZZZZZZZZP1";

const project = {
  id: PROJECT_ID,
  name: "Tasks Plugin",
  prefix: "TSK",
  nextTaskNumber: 5,
  color: "blue",
  folderId: null,
  linkedBbProjectId: null,
  createdAt: "2026-07-15T00:00:00.000Z",
};

function task(key: string, status: Task["status"], position: number): Task {
  return makeTask({
    id: `01HZZZZZZZZZZZZZZZZZZZZ${key.replace("-", "")}`,
    projectId: PROJECT_ID,
    number: position,
    key,
    title: `Title ${key}`,
    status,
    position,
  });
}

function rpc(tasks: Task[] = [], overrides: Record<string, unknown> = {}) {
  return {
    listProjects: () => ({ projects: [project] }),
    listFolders: () => ({ folders: [] }),
    listPresets: () => ({ presets: [] }),
    sidebarSummary: () => ({ projects: [] }),
    listTasks: () => ({ tasks }),
    listLabels: () => ({ labels: [] }),
    getTaskByKey: (input: unknown) => ({
      task: tasks.find((entry) => entry.key === rpcInput(input).taskKey) ?? null,
    }),
    listAttachments: () => ({ attachments: [] }),
    listTaskThreads: () => ({ taskThreads: [] }),
    listComments: () => ({ comments: [] }),
    listTaskPullRequests: () => ({ pullRequests: [], unavailableThreadIds: [] }),
    ...overrides,
  };
}

function open(subPath: string, tasks: Task[] = []) {
  return renderSlot(app.navPanels[0]!, { subPath }, { rpc: rpc(tasks) });
}

describe("panel shortcuts", () => {
  it("opens the help dialog on ? and lists every shortcut by scope", async () => {
    const slot = open("all");
    await slot.findByText("All projects");
    fireEvent.keyDown(window, { key: "?", shiftKey: true });
    const dialog = await slot.findByRole("dialog", {
      name: "Keyboard shortcuts",
    });
    for (const heading of ["Anywhere", "List", "Board", "Task"]) {
      expect(slot.getByRole("heading", { name: heading })).toBeDefined();
    }
    expect(dialog.querySelectorAll("dt")).toHaveLength(SHORTCUTS.length);
  });

  it("returns focus to the previous element when the help dialog closes", async () => {
    const slot = open("all");
    const newTask = await slot.findByRole("button", { name: /new task/i });
    newTask.focus();
    fireEvent.keyDown(newTask, { key: "?" });
    const dialog = await slot.findByRole("dialog", {
      name: "Keyboard shortcuts",
    });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(newTask));
  });

  it("does not open the new-task dialog when Cmd is held", async () => {
    const slot = open("all");
    await slot.findByText("All projects");
    fireEvent.keyDown(window, { key: "c", metaKey: true });
    expect(slot.queryByRole("dialog")).toBeNull();
  });

  it("switches a project list to the board on v and remembers it", async () => {
    const slot = open(`${PROJECT_ID}?view=list`);
    await slot.findByRole("button", { name: "Board" });
    fireEvent.keyDown(window, { key: "v" });
    expect(slot.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: `${PROJECT_ID}?view=board` },
    });
    expect(loadViewMode(PROJECT_ID)).toBe("board");
  });

  it("ignores v where there is no board", async () => {
    const slot = open("all");
    await slot.findByText("All projects");
    fireEvent.keyDown(window, { key: "v" });
    expect(slot.navigateCalls).toEqual([]);
  });

  it("ignores keys pressed while focus is in another pane", async () => {
    const slot = open("all");
    await slot.findByText("All projects");
    const otherPane = document.createElement("button");
    document.body.append(otherPane);
    otherPane.focus();
    fireEvent.keyDown(otherPane, { key: "c" });
    expect(slot.queryByRole("dialog")).toBeNull();
    otherPane.remove();
  });
});
