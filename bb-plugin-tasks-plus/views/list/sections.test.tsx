// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { ListView, type VisibleTaskOrder } from "./index.js";
import { visibleTreeTasks } from "./selection-tree.js";
import {
  loadListPreference,
  sanitizeListPreference,
  storeListPreference,
} from "./list-preference.js";
import { loadExpandedTasks, storeExpandedTasks } from "./expanded-tasks.js";
import { TASK_STATUSES } from "../../shared/contract.js";
import { STATUS_LABELS } from "./lib.js";
import { makeTask } from "../../test-fixtures.js";
import { TasksRefreshProvider } from "../../shell/refresh.js";
import type { ComponentProps } from "react";

function List(props: ComponentProps<typeof ListView>) {
  return (
    <TasksRefreshProvider>
      <ListView {...props} />
    </TasksRefreshProvider>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const parent = makeTask({ id: "parent", key: "TSK-1", title: "Parent", status: "todo" });
const child = makeTask({ id: "child", key: "TSK-2", title: "Child", parentTaskId: parent.id });
const other = makeTask({ id: "other", key: "TSK-3", title: "Other", status: "done" });
const rpc = {
  listProjects: () => ({ projects: [] }),
  listLabels: () => ({ labels: [] }),
  listTaskThreads: () => ({ taskThreads: [] }),
  listTasks: () => ({ tasks: [parent, child, other], nextCursor: null }),
};
const rows = (slot: ReturnType<typeof renderSlot>) =>
  [...slot.container.querySelectorAll<HTMLElement>("[data-task-key]")].map(
    (el) => el.dataset.taskKey,
  );

it("loads expanded defaults and sanitizes additive section choices without losing legacy fields", () => {
  expect(loadListPreference("all").collapsedStatuses).toEqual([]);
  const legacy = {
    filters: { statuses: ["todo"], priorities: ["high"], labelNames: [] },
    sort: "priority",
  };
  expect(sanitizeListPreference(legacy)).toEqual({ ...legacy, collapsedStatuses: [] });
  const preference = sanitizeListPreference({
    ...legacy,
    collapsedStatuses: ["todo", "bogus", "todo", 5, "backlog"],
  });
  expect(preference.collapsedStatuses).toEqual(["todo", "backlog"]);
  storeListPreference("all", preference);
  expect(loadListPreference("all")).toEqual(preference);
});

it("excludes collapsed entries from visible order without changing tree entries or counts", () => {
  const tree = {
    groups: [
      {
        status: "todo" as const,
        collapsed: true,
        entries: [
          {
            task: parent,
            children: [child],
            dimmed: false,
            subDone: 0,
            subTotal: 0,
            autoExpand: false,
            expanded: true,
          },
        ],
      },
      {
        status: "done" as const,
        collapsed: false,
        entries: [
          {
            task: other,
            children: [],
            dimmed: false,
            subDone: 0,
            subTotal: 0,
            autoExpand: false,
            expanded: false,
          },
        ],
      },
    ],
    count: 3,
  };
  expect(visibleTreeTasks(tree)).toEqual([other]);
  expect(tree.groups[0]!.entries).toHaveLength(1);
  expect(tree.count).toBe(3);
});

it("keeps headers, counts and saved subtask state while hiding rows and saving All tasks choices", async () => {
  storeExpandedTasks("all", new Set([parent.id]), new Set([parent.id]));
  const report = vi.fn<(order: VisibleTaskOrder) => void>();
  const open = vi.fn();
  const props = { projectId: null, onVisibleOrderChange: report, onRequestSelection: open };
  const slot = renderSlot({ component: List }, props, { rpc });
  await slot.findByText("TSK-2");
  const header = slot.getByRole("button", { name: "Todo" });
  expect(header.getAttribute("aria-expanded")).toBe("true");
  expect(header.textContent).toContain("1");
  expect(slot.getByText("3 tasks")).toBeTruthy();
  fireEvent.click(header);
  await waitFor(() => expect(rows(slot)).toEqual(["TSK-3"]));
  expect(header.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(header);
  expect(report.mock.calls.at(-1)?.[0]).toEqual({ keys: ["TSK-3"], settled: true });
  expect(slot.getByText("3 tasks")).toBeTruthy();
  expect(loadExpandedTasks("all").has(parent.id)).toBe(true);
  expect(loadListPreference("all").collapsedStatuses).toEqual(["todo"]);
  expect(open).not.toHaveBeenCalled();
  slot.lifecycle.unmount();
  const remount = renderSlot({ component: List }, props, { rpc });
  const restored = await remount.findByRole("button", { name: "Todo" });
  expect(restored.getAttribute("aria-expanded")).toBe("false");
  expect(rows(remount)).toEqual(["TSK-3"]);
  fireEvent.click(restored);
  await remount.findByText("TSK-2");
  expect(loadListPreference("all").collapsedStatuses).toEqual([]);
});

it("gives every status a native header and retains an all-collapsed non-empty list", async () => {
  const records = TASK_STATUSES.map((status, index) =>
    makeTask({ id: `t${index}`, key: `TSK-${index + 1}`, status }),
  );
  const slot = renderSlot(
    { component: List },
    { projectId: null },
    {
      rpc: { ...rpc, listTasks: () => ({ tasks: records, nextCursor: null }) },
    },
  );
  await slot.findByText("TSK-1");
  for (const status of TASK_STATUSES) {
    const header = slot.getByRole("button", { name: STATUS_LABELS[status] });
    expect(header.tagName).toBe("BUTTON");
    expect(header.getAttribute("type")).toBe("button");
    expect(header.querySelector("svg")).not.toBeNull();
    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
  }
  expect(rows(slot)).toEqual([]);
  expect(slot.queryByText("No tasks yet")).toBeNull();
  expect(slot.queryByText("No tasks match these filters")).toBeNull();
  expect(slot.container.querySelectorAll("[data-status-group-header]")).toHaveLength(
    TASK_STATUSES.length,
  );
});

it("stages section changes through the context-change contract", async () => {
  let commit: (() => void) | undefined;
  const slot = renderSlot(
    { component: List },
    {
      projectId: null,
      onRequestContextChange: (next) => {
        commit = next;
      },
    },
    { rpc },
  );
  await slot.findByText("TSK-1");
  const header = slot.getByRole("button", { name: "Todo" });
  fireEvent.click(header);
  expect(header.getAttribute("aria-expanded")).toBe("true");
  expect(loadListPreference("all").collapsedStatuses).toEqual([]);
  await act(async () => commit?.());
  expect(header.getAttribute("aria-expanded")).toBe("false");
  expect(loadListPreference("all").collapsedStatuses).toEqual(["todo"]);
});
