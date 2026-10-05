// @vitest-environment jsdom
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginCommandContext } from "@get-bb/plugin-sdk/app";

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
const { TASKS_COMMANDS } = await import("./commands.js");

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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const tasksPanel = app.navPanels[0]!;
const sidebarAccessory = {
  component: tasksPanel.experimental_sidebarAccessory!,
};

const rpc = {
  sidebarOpenTaskCount: () => ({ openTaskCount: 0 }),
  listProjects: () => ({ projects: [] }),
  listFolders: () => ({ folders: [] }),
  listPresets: () => ({ presets: [] }),
  sidebarSummary: () => ({ projects: [] }),
  listTasks: () => ({ tasks: [], nextCursor: null }),
};

const context: PluginCommandContext = {
  threadId: null,
  projectId: null,
  openPanel: () => false,
};

function command(id: string) {
  const found = TASKS_COMMANDS.find((entry) => entry.id === id);
  if (!found) throw new Error(`no command ${id}`);
  return found;
}

function run(id: string) {
  act(() => void command(id).run(context));
}

describe("tasks palette commands", () => {
  it("registers the six commands without default keys", () => {
    expect(TASKS_COMMANDS.map((entry) => entry.title)).toEqual([
      "Tasks: New task",
      "Tasks: Go to All tasks",
      "Tasks: Go to Active tasks",
      "Tasks: Go to Manage",
      "Tasks: Show keyboard shortcuts",
      "Tasks: Switch project",
    ]);
    for (const entry of TASKS_COMMANDS) {
      expect(entry.defaultShortcut).toBeUndefined();
    }
  });

  it("are hidden until a tasks surface can navigate", () => {
    expect(command("go-all").isAvailable?.(context)).toBe(false);
    renderSlot(sidebarAccessory, {}, { rpc });
    expect(command("go-all").isAvailable?.(context)).toBe(true);
  });

  it.each([
    ["go-all", "all"],
    ["go-active", "active"],
    ["go-manage", "manage"],
  ])("%s opens the tasks panel on %s", (id, subPath) => {
    const slot = renderSlot(sidebarAccessory, {}, { rpc });
    run(id);
    expect(slot.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath },
    });
  });

  it("opens the panel and then the new-task dialog once when the panel was closed", async () => {
    const sidebar = renderSlot(sidebarAccessory, {}, { rpc });
    run("new-task");
    expect(sidebar.navigateCalls).toContainEqual(
      expect.objectContaining({ method: "toPluginPanel", path: "tasks" }),
    );
    const panel = renderSlot(tasksPanel, { subPath: "all" }, { rpc });
    expect(await panel.findByRole("dialog")).toBeDefined();
    expect(panel.getAllByRole("dialog")).toHaveLength(1);
  });

  it("shows the help dialog in an open panel without navigating", async () => {
    const panel = renderSlot(tasksPanel, { subPath: "all" }, { rpc });
    await panel.findByText("No projects yet");
    run("show-shortcuts");
    expect(await panel.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeDefined();
    expect(panel.navigateCalls).toEqual([]);
  });
  it("opens the panel and delivers one project picker when Tasks was closed", async () => {
    const sidebar = renderSlot(sidebarAccessory, {}, { rpc });
    run("switch-project");
    expect(sidebar.inspection.navigateCalls).toContainEqual(
      expect.objectContaining({ method: "toPluginPanel", path: "tasks" }),
    );
    const panel = renderSlot(tasksPanel, { subPath: "all" }, { rpc });
    await panel.findByRole("dialog", { name: "Switch project" });
    expect(panel.getAllByRole("dialog")).toHaveLength(1);
    run("switch-project");
    expect(panel.getAllByRole("dialog")).toHaveLength(1);
    expect(panel.inspection.navigateCalls).toEqual([]);
  });
});
