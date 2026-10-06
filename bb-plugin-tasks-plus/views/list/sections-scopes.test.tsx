// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { ListView, type VisibleTaskOrder } from "./index.js";
import { DEFAULT_LIST_PREFERENCE, loadListPreference } from "./list-preference.js";
import { TasksRefreshProvider } from "../../shell/refresh.js";
import { makeTask, rpcInput } from "../../test-fixtures.js";
import { EXPANDED_TASKS_STORAGE_KEY, storeExpandedTasks } from "./expanded-tasks.js";

import { COMPACT_VIEWPORT_QUERY } from "@/components/ui/hooks/use-compact-viewport";

beforeEach(() => {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: query === COMPACT_VIEWPORT_QUERY,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }));
});

const A = "project-a";
const B = "project-b";
const records = [
  makeTask({ id: "a-todo", projectId: A, key: "ALP-1", status: "todo" }),
  makeTask({ id: "a-work", projectId: A, key: "ALP-2", status: "in_progress" }),
  makeTask({ id: "a-done", projectId: A, key: "ALP-3", status: "done" }),
  makeTask({ id: "b-todo", projectId: B, key: "BET-1", status: "todo" }),
  makeTask({ id: "b-work", projectId: B, key: "BET-2", status: "in_progress" }),
  makeTask({ id: "b-done", projectId: B, key: "BET-3", status: "done" }),
];
const scopes = [
  { name: "all" as const, projectId: null, activeOnly: false },
  { name: "active" as const, projectId: null, activeOnly: true },
  { name: `project:${A}` as const, projectId: A, activeOnly: false },
  { name: `project:${B}` as const, projectId: B, activeOnly: false },
];
function List({
  scope,
  report,
}: {
  scope: (typeof scopes)[number];
  report: (scope: string, order: VisibleTaskOrder) => void;
}) {
  return (
    <TasksRefreshProvider>
      <ListView
        projectId={scope.projectId}
        activeOnly={scope.activeOnly}
        onVisibleOrderChange={(order) => report(scope.name, order)}
      />
    </TasksRefreshProvider>
  );
}
const rpc = {
  listProjects: () => ({ projects: [] }),
  listLabels: () => ({ labels: [] }),
  listTaskThreads: () => ({ taskThreads: [] }),
  listTasks: (raw: unknown) => {
    const input = rpcInput(raw);
    return {
      tasks: records.filter(
        (task) =>
          (!input.projectId || task.projectId === input.projectId) &&
          (!input.activeOnly || task.status !== "done"),
      ),
      nextCursor: null,
    };
  },
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const rows = (slot: ReturnType<typeof renderSlot>) =>
  [...slot.container.querySelectorAll<HTMLElement>("[data-task-key]")].map(
    (el) => el.dataset.taskKey,
  );

it("keeps four section choices independent through scope transitions and remount, with no settled order from the prior scope", async () => {
  const report = vi.fn<(scope: string, order: VisibleTaskOrder) => void>();
  const slot = renderSlot({ component: List }, { scope: scopes[0]!, report }, { rpc });
  await slot.findByText("ALP-1");
  fireEvent.click(slot.getByRole("button", { name: "Todo" }));
  slot.lifecycle.rerender(<List scope={scopes[1]!} report={report} />);
  await slot.findByText("ALP-1");
  fireEvent.click(slot.getByRole("button", { name: "In Progress" }));
  slot.lifecycle.rerender(<List scope={scopes[2]!} report={report} />);
  await slot.findByText("ALP-1");
  fireEvent.click(slot.getByRole("button", { name: "Done" }));
  slot.lifecycle.rerender(<List scope={scopes[3]!} report={report} />);
  await slot.findByText("BET-1");
  // An explicit expanded choice in B differs from all three other scopes.
  fireEvent.click(slot.getByRole("button", { name: "Todo" }));
  fireEvent.click(slot.getByRole("button", { name: "Todo" }));
  const expected = [
    ["ALP-2", "BET-2", "ALP-3", "BET-3"],
    ["ALP-1", "BET-1"],
    ["ALP-1", "ALP-2"],
    ["BET-1", "BET-2", "BET-3"],
  ];
  const choices = [["todo"], ["in_progress"], ["done"], []];
  for (const [index, scope] of scopes.entries()) {
    report.mockClear();
    slot.lifecycle.rerender(<List scope={scope} report={report} />);
    await waitFor(() =>
      expect(report.mock.calls.at(-1)).toEqual([
        scope.name,
        { keys: expected[index], settled: true },
      ]),
    );
    expect(
      report.mock.calls
        .filter(([, order]) => order.settled)
        .every(
          ([name, order]) =>
            name === scope.name && JSON.stringify(order.keys) === JSON.stringify(expected[index]),
        ),
    ).toBe(true);
    expect(rows(slot)).toEqual(expected[index]);
    expect(loadListPreference(scope.name)).toEqual({
      ...DEFAULT_LIST_PREFERENCE,
      collapsedStatuses: choices[index],
    });
  }
  slot.lifecycle.unmount();
  for (const [index, scope] of scopes.entries()) {
    const remount = renderSlot({ component: List }, { scope, report }, { rpc });
    await waitFor(() => expect(rows(remount)).toEqual(expected[index]));
    expect(loadListPreference(scope.name).collapsedStatuses).toEqual(choices[index]);
    remount.lifecycle.unmount();
  }
});

for (const scope of scopes) {
  it(`retains ${scope.name} choices, counts and saved children through sort, child-only filters, absence and clear`, async () => {
    const parent = makeTask({
      id: "parent",
      projectId: scope.projectId ?? A,
      key: "ALP-10",
      status: "done",
      priority: "low",
    });
    const child = makeTask({
      id: "child",
      projectId: parent.projectId,
      key: "ALP-11",
      parentTaskId: parent.id,
      status: "todo",
      priority: "high",
    });
    const other = makeTask({
      id: "other",
      projectId: parent.projectId,
      key: "ALP-12",
      status: "in_progress",
    });
    let current = [parent, child, other];
    const filteredRpc = {
      ...rpc,
      listTasks: (raw: unknown) => {
        const input = rpcInput(raw);
        return {
          tasks: current.filter(
            (task) =>
              (!input.activeOnly || task.status !== "done") &&
              (!Array.isArray(input.statuses) ||
                input.statuses.length === 0 ||
                input.statuses.includes(task.status)) &&
              (!Array.isArray(input.priorities) ||
                input.priorities.length === 0 ||
                input.priorities.includes(task.priority)),
          ),
          nextCursor: null,
        };
      },
    };
    storeExpandedTasks(scope.name, new Set([parent.id]), new Set([parent.id]));
    const expansion = window.localStorage.getItem(EXPANDED_TASKS_STORAGE_KEY);
    const report = vi.fn();
    const slot = renderSlot({ component: List }, { scope, report }, { rpc: filteredRpc });
    await slot.findByText("ALP-11");
    fireEvent.click(slot.getByRole("button", { name: "Done" }));
    fireEvent.click(slot.getByRole("button", { name: /Sort/ }));
    fireEvent.click(await slot.findByRole("menuitemcheckbox", { name: "Priority" }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(slot.getByRole("button", { name: /^Status/ }));
    fireEvent.click(await slot.findByRole("menuitemcheckbox", { name: /Todo/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    await slot.findByText("1 task");
    expect(slot.getByRole("button", { name: "Done" }).textContent).toContain("1");
    expect(rows(slot)).toEqual([]);
    expect(slot.getByRole("button", { name: "Done" }).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(slot.getByRole("button", { name: "Done" }));
    await slot.findByText("ALP-11");
    expect(rows(slot)).toEqual(["ALP-10", "ALP-11"]);
    expect(
      slot.container.querySelector('[data-task-key="ALP-10"]')?.getAttribute("data-dimmed"),
    ).toBe("true");
    fireEvent.click(slot.getByRole("button", { name: "Done" }));
    fireEvent.click(slot.getByRole("button", { name: "Clear" }));
    await slot.findByText("ALP-12");
    expect(slot.getByText(scope.activeOnly ? "2 tasks" : "3 tasks")).toBeTruthy();
    fireEvent.click(slot.getByRole("button", { name: /^Priority/ }));
    fireEvent.click(await slot.findByRole("menuitemcheckbox", { name: /Urgent/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    await slot.findByText("No tasks match these filters");
    expect(slot.queryByRole("button", { name: "Done" })).toBeNull();
    expect(loadListPreference(scope.name).collapsedStatuses).toEqual(["done"]);
    current = [
      ...current,
      { ...parent, id: "second-parent", key: "ALP-13" },
      { ...child, id: "second-child", key: "ALP-14", parentTaskId: "second-parent" },
    ];
    await slot.behavior.emitRealtime("tasks:changed", {});
    fireEvent.click(slot.getByRole("button", { name: "Clear" }));
    const header = await slot.findByRole("button", { name: "Done" });
    await waitFor(() => expect(header.textContent).toContain("2"));
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(slot.getByText(scope.activeOnly ? "3 tasks" : "5 tasks")).toBeTruthy();
    expect(loadListPreference(scope.name)).toEqual({
      ...DEFAULT_LIST_PREFERENCE,
      sort: "priority",
      collapsedStatuses: ["done"],
    });
    expect(window.localStorage.getItem(EXPANDED_TASKS_STORAGE_KEY)).toBe(expansion);
    fireEvent.click(header);
    await slot.findByText("ALP-11");
    expect(window.localStorage.getItem(EXPANDED_TASKS_STORAGE_KEY)).toBe(expansion);
  });
}
