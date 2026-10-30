// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { aggregateTaskStats } from "../shared/task-stats.js";
import {
  statsProjects,
  statsInputs,
  interruptedInputs,
  canceledInput,
  statsDetailTasks,
} from "../tests/stats-data.js";
import { rpcInput } from "../test-fixtures.js";
import {
  BROWSE_PREFERENCE_STORAGE_KEY,
  browsePreference,
  resetBrowsePreferenceStateForTest,
} from "./browse-preference.js";

const app = await loadPluginApp(() => import("../app"));
const panel = app.navPanels[0]!;
const Panel = panel.component;
const { parseTasksRoute, tasksRouteToSubPath } = await import("./routes.js");
const { formatStatsDuration } = await import("../views/stats/index.js");

beforeEach(() => {
  localStorage.clear();
  resetBrowsePreferenceStateForTest();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const inputs = [...statsInputs, ...interruptedInputs, canceledInput];
const tasks = statsDetailTasks(inputs);
const rpc = {
  listProjects: () => ({ projects: statsProjects }),
  listFolders: () => ({ folders: [] }),
  listPresets: () => ({ presets: [] }),
  listLabels: () => ({ labels: [] }),
  listAttachments: () => ({ attachments: [] }),
  listTaskThreads: () => ({ taskThreads: [] }),
  listTaskPullRequests: () => ({ pullRequests: [], unavailableThreadIds: [] }),
  listTasks: () => ({ tasks: [], nextCursor: null }),
  getTaskByKey: (raw: unknown) => ({
    task: tasks.find((task) => task.key === rpcInput(raw).taskKey) ?? null,
  }),
  getTaskStats: (raw: unknown) => {
    const { projectId, includeInterrupted } = rpcInput(raw);
    return aggregateTaskStats(
      inputs.filter((task) => !projectId || task.projectId === projectId),
      statsProjects.filter((project) => !projectId || project.id === projectId),
      includeInterrupted === true,
    );
  },
};
function open(subPath = "stats", overrides = {}) {
  return renderSlot(panel, { subPath }, { rpc: { ...rpc, ...overrides } });
}
function destination(subPath: string) {
  return { method: "toPluginPanel", path: "tasks", options: { subPath } };
}

function measures(container: HTMLElement) {
  return Array.from(container.querySelectorAll(".stats-summary dd"), (node) => node.textContent);
}

describe("Stats in the production shell", () => {
  it("round-trips the explicit Stats route and project scope", () => {
    for (const route of [
      { kind: "stats" },
      { kind: "stats", projectId: statsProjects[0]!.id },
    ] as const)
      expect(parseTasksRoute(tasksRouteToSubPath(route))).toEqual(route);
    expect(parseTasksRoute(`stats%3Fproject%3D${statsProjects[0]!.id}`)).toEqual({
      kind: "stats",
      projectId: statsProjects[0]!.id,
    });
    expect(parseTasksRoute("stats?project=")).toEqual({ kind: "stats" });
  });

  it("shows summary, all priority rows, five ranked links and invariant interrupted disclosure", async () => {
    const slot = open();
    await slot.findByText("Slowest completed tasks");
    expect(measures(slot.container)).toEqual(["1d 4h", "1d 7.6h", "10"]);
    expect(
      slot.getByRole("table", { name: "By priority duration statistics" }).textContent,
    ).toContain("No priority0No dataNo data");
    expect(slot.container.querySelectorAll(".stats-slowest button")).toHaveLength(5);
    expect(slot.getByText("1 canceled task excluded.").textContent).toBe(
      "1 canceled task excluded.",
    );
    fireEvent.click(slot.getByRole("button", { name: "Show tasks" }));
    expect(
      (
        await slot.findByRole("button", {
          name: "Open DEV-11: Move task attachments into the detail panel",
        })
      ).textContent,
    ).toContain("7d 8h");
    expect(measures(slot.container)).toEqual(["1d 4h", "1d 7.6h", "10"]);
    fireEvent.click(slot.getByRole("button", { name: "Hide tasks" }));
    expect(slot.queryByText("Interrupted tasks")).toBeNull();
    expect(slot.getByText("How duration works").textContent).toBe("How duration works");
    expect(slot.queryByText("TASK DURATION")).toBeNull();
  });

  it("navigates project filters and restores the filtered route on detail Back", async () => {
    const project = statsProjects[2]!;
    const subPath = `stats?project=${project.id}`;
    const slot = open();
    await slot.findByText("Slowest completed tasks");
    fireEvent.click(slot.getByRole("combobox", { name: "Project" }));
    fireEvent.click(await slot.findByRole("option", { name: project.name }));
    expect(slot.navigateCalls).toContainEqual(destination(subPath));
    slot.lifecycle.rerender(<Panel subPath={subPath} />);
    await slot.findByText("Only 2 tasks so far. Treat these numbers as an early indication.");
    expect(measures(slot.container)).toEqual(["1d", "1d", "2"]);
    fireEvent.click(
      slot.getByRole("button", {
        name: "Open LAB-9: Show a useful message when no sample tasks exist",
      }),
    );
    expect(slot.navigateCalls).toContainEqual(destination("task/LAB-9"));
    slot.lifecycle.rerender(<Panel subPath="task/LAB-9" />);
    await slot.findByRole("textbox", { name: "Task title" });
    await waitFor(() =>
      expect(
        slot.rpcCalls.filter((call) => call.method === "listTasks").map((call) => call.input),
      ).toContainEqual({ projectId: project.id, parentTaskId: null, limit: 500 }),
    );
    fireEvent.click(slot.getByRole("button", { name: "Back (Esc)" }));
    expect(slot.navigateCalls.at(-1)).toEqual(destination(subPath));
  });

  it("renders explicit no-data measures with no projects and still exposes Stats from empty Tasks", async () => {
    const empty = {
      listProjects: () => ({ projects: [] }),
      getTaskStats: () => aggregateTaskStats([], []),
    };
    const slot = open("all", empty);
    await slot.findByText("No projects yet");
    fireEvent.click(slot.getByRole("button", { name: "Stats" }));
    expect(slot.navigateCalls).toContainEqual(destination("stats"));
    slot.lifecycle.rerender(<Panel subPath="stats" />);
    await slot.findByText("No duration data yet");
    expect(measures(slot.container)).toEqual(["No data", "No data", "0"]);
    expect(slot.queryByText("No projects yet")).toBeNull();
    expect(slot.queryByText("Slowest completed tasks")).toBeNull();
  });

  it("reserves loading summary space, reports errors and recovers with Retry and refresh", async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const query = vi
      .fn()
      .mockReturnValueOnce(pending)
      .mockRejectedValueOnce(new Error("Stats unavailable"))
      .mockImplementation(rpc.getTaskStats);
    const slot = open("stats", { getTaskStats: query });
    expect(slot.getByRole("status").textContent).toBe("Loading stats…");
    expect(slot.container.querySelectorAll(".stats-summary dd")).toHaveLength(3);
    await act(async () => resolve(rpc.getTaskStats({})));
    await slot.findByText("Slowest completed tasks");
    fireEvent.click(slot.getByRole("button", { name: "Refresh tasks" }));
    expect((await slot.findByRole("alert")).textContent).toContain("Stats unavailable");
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    await slot.findByText("Slowest completed tasks");
    expect(measures(slot.container)).toEqual(["1d 4h", "1d 7.6h", "10"]);
    await act(async () => slot.behavior.emitRealtime("tasks:changed", {}));
    await waitFor(() => expect(query).toHaveBeenCalledTimes(4));
  });

  it("does not label retained all-project measures as a newly selected project", async () => {
    const slot = open("stats", {
      getTaskStats: (raw: unknown) =>
        rpcInput(raw).projectId ? new Promise(() => {}) : rpc.getTaskStats(raw),
    });
    await slot.findByText("Slowest completed tasks");
    slot.lifecycle.rerender(<Panel subPath={`stats?project=${statsProjects[2]!.id}`} />);
    expect(slot.getByRole("status").textContent).toBe("Loading stats…");
    expect(measures(slot.container)).toEqual(["", "", ""]);
  });

  it("keeps browse preference and board preference when using the Stats tab and menu", async () => {
    const project = statsProjects[0]!;
    browsePreference().store({ kind: "project", projectId: project.id });
    const before = localStorage.getItem(BROWSE_PREFERENCE_STORAGE_KEY);
    const slot = open(`${project.id}?view=list`);
    fireEvent.click(await slot.findByRole("button", { name: "Board" }));
    slot.lifecycle.rerender(<Panel subPath={`${project.id}?view=board`} />);
    fireEvent.click(await slot.findByRole("button", { name: "Stats" }));
    expect(slot.navigateCalls.at(-1)).toEqual(destination(`stats?project=${project.id}`));
    slot.lifecycle.rerender(<Panel subPath={`stats?project=${project.id}`} />);
    await slot.findByText("Slowest completed tasks");
    expect(localStorage.getItem(BROWSE_PREFERENCE_STORAGE_KEY)).toBe(before);
    fireEvent.keyDown(slot.getByRole("button", { name: "Tasks navigation" }), { key: "ArrowDown" });
    expect((await slot.findByRole("menuitem", { name: "Stats" })).textContent).toContain("Stats");
    fireEvent.keyDown(slot.getByRole("menu"), { key: "Escape" });
    fireEvent.click(
      within(slot.getByRole("navigation", { name: "Tasks views" })).getByRole("button", {
        name: "Tasks",
      }),
    );
    expect(slot.navigateCalls.at(-1)).toEqual(destination(project.id));
    slot.lifecycle.rerender(<Panel subPath={project.id} />);
    expect((await slot.findByRole("button", { name: "Board" })).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("holds detail Back to Stats until the pending description save succeeds", async () => {
    const task = tasks.find((task) => task.key === "LAB-9")!;
    const subPath = `stats?project=${task.projectId}`;
    let resolve!: (value: unknown) => void;
    const save = new Promise((done) => {
      resolve = done;
    });
    const updateTask = vi.fn().mockReturnValue(save);
    const slot = open(subPath, { updateTask });
    await slot.findByText("Slowest completed tasks");
    fireEvent.click(slot.getByRole("button", { name: `Open ${task.key}: ${task.title}` }));
    slot.lifecycle.rerender(<Panel subPath={`task/${task.key}`} />);
    await slot.findByRole("textbox", { name: "Task title" });
    await act(async () => {
      const editor = slot.container.querySelector<HTMLElement>(".tiptap")!;
      editor.innerHTML = "<p>Unsaved Stats draft</p>";
      fireEvent.input(editor);
    });
    const before = slot.navigateCalls.length;
    fireEvent.click(slot.getByRole("button", { name: "Back (Esc)" }));
    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith({
        taskId: task.id,
        description: "Unsaved Stats draft",
      }),
    );
    expect(slot.navigateCalls).toHaveLength(before);
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe(task.title);
    await act(async () =>
      resolve({ ok: true, task: { ...task, description: "Unsaved Stats draft" } }),
    );
    await waitFor(() => expect(slot.navigateCalls.at(-1)).toEqual(destination(subPath)));
  });

  it.each([1, 2, 3, 4])("warns for a sample of %s completed tasks", async (count) => {
    const slot = open("stats", {
      getTaskStats: () => aggregateTaskStats(statsInputs.slice(0, count), statsProjects),
    });
    const warning = `Only ${count} ${count === 1 ? "task" : "tasks"} so far. Treat these numbers as an early indication.`;
    expect((await slot.findByText(warning)).textContent).toBe(warning);
    expect(slot.container.querySelectorAll(".stats-slowest button")).toHaveLength(count);
  });

  it.each([
    [null, "No data"],
    [0, "0s"],
    [5, "<1s"],
    [1000, "1s"],
    [90000, "1.5m"],
    [5400000, "1.5h"],
    [100800000, "1d 4h"],
  ] as const)("formats %s without conflating zero and missing", (value, expected) => {
    expect(formatStatsDuration(value)).toBe(expected);
  });
});
