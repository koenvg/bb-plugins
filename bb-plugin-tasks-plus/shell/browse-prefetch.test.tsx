// @vitest-environment jsdom
import { act, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeTask, rpcInput } from "../test-fixtures.js";
import { EMPTY_FILTERS } from "../views/list/filter-bar.js";
import { storeListPreference, type ListPreference } from "../views/list/list-preference.js";
import { storeExpandedTasks } from "../views/list/expanded-tasks.js";
import {
  acceptNavigation,
  deferred,
  Panel,
  project,
  row,
  setup,
  useWorkspaceTestLifecycle,
} from "./browse-workspace.test-support.js";

useWorkspaceTestLifecycle();
const records = [1, 2, 3, 4, 5, 6].map((n) =>
  makeTask({
    id: `task-${n}`,
    projectId: project.id,
    key: `TSK-${n}`,
    number: n,
    title: `Title ${n}`,
    description: `Description ${n}`,
    position: n * 1024,
    status: n === 5 ? "done" : "todo",
    priority: n === 3 || n === 4 ? "urgent" : n === 2 || n === 5 ? "high" : "low",
    parentTaskId: n === 3 ? "task-2" : null,
  }),
);
function fixture(subPath: string, overrides: Record<string, (raw: unknown) => unknown> = {}) {
  return setup(subPath, {
    listTasks: (raw) => ({ tasks: rpcInput(raw).parentTaskId ? [] : records, nextCursor: null }),
    getTaskByKey: (raw) => ({ task: records.find((t) => t.key === rpcInput(raw).taskKey) ?? null }),
    ...overrides,
  });
}
const keysRead = (slot: ReturnType<typeof setup>) =>
  slot.inspection.rpcCalls
    .filter((call) => call.method === "getTaskByKey")
    .map((call) => rpcInput(call.input).taskKey);
const preference = (patch: Partial<ListPreference> = {}): ListPreference => ({
  filters: EMPTY_FILTERS,
  sort: "manual",
  collapsedStatuses: [],
  ...patch,
});

describe("prefetch from the rendered visible order", () => {
  it.each([
    {
      name: "expanded manual order",
      expanded: true,
      selected: 2,
      patch: {},
      expected: ["TSK-2", "TSK-1", "TSK-3"],
    },
    {
      name: "collapsed child order",
      expanded: false,
      selected: 2,
      patch: {},
      expected: ["TSK-2", "TSK-1", "TSK-4"],
    },
    {
      name: "priority sorted order",
      expanded: true,
      selected: 2,
      patch: { sort: "priority" as const },
      expected: ["TSK-2", "TSK-4", "TSK-3"],
    },
    {
      name: "filtered child with dimmed parent",
      expanded: true,
      selected: 3,
      patch: { filters: { ...EMPTY_FILTERS, priorities: ["urgent" as const] } },
      expected: ["TSK-3", "TSK-2", "TSK-4"],
    },
    {
      name: "collapsed status order",
      expanded: true,
      selected: 5,
      patch: { collapsedStatuses: ["todo" as const] },
      expected: ["TSK-5"],
    },
  ])("warms only immediate neighbors in $name", async ({ expanded, selected, patch, expected }) => {
    storeListPreference("all", preference(patch));
    storeExpandedTasks("all", new Set(expanded ? ["task-2"] : []), new Set(["task-2"]));
    const slot = fixture(`all?task=TSK-${selected}`);
    await slot.findByRole("textbox", { name: "Task title" });
    await waitFor(() => expect(keysRead(slot)).toEqual(expected));
    await act(async () => {});
    expect(keysRead(slot)).toEqual(expected);
    expect(slot.inspection.navigateCalls).toEqual([]);
    for (const method of [
      "listAttachments",
      "getTaskActivity",
      "listTaskThreads",
      "listTaskPullRequests",
    ]) {
      const calls = slot.inspection.rpcCalls.filter((call) => call.method === method);
      expect(calls, method).toHaveLength(1);
      expect(rpcInput(calls[0]!.input).taskId, method).toBe(`task-${selected}`);
    }
  });

  it("uses only the new scope after an unsettled scope change", async () => {
    const previous = deferred<unknown>();
    const nextList = deferred<unknown>();
    const slot = fixture("all?task=TSK-2", {
      listTasks: (raw) =>
        rpcInput(raw).activeOnly
          ? nextList.promise
          : { tasks: rpcInput(raw).parentTaskId ? [] : records, nextCursor: null },
      getTaskByKey: (raw) =>
        ["TSK-1", "TSK-4"].includes(String(rpcInput(raw).taskKey))
          ? previous.promise
          : { task: records.find((task) => task.key === rpcInput(raw).taskKey) },
    });
    await waitFor(() => expect(keysRead(slot)).toEqual(["TSK-2", "TSK-1", "TSK-4"]));
    slot.lifecycle.rerender(<Panel subPath="active?task=TSK-2" />);
    await act(async () => {});
    expect(keysRead(slot)).toEqual(["TSK-2", "TSK-1", "TSK-4"]);
    // Both old transports finish with unusable keys, but must not schedule the old order.
    await act(async () => previous.resolve({ task: null }));
    expect(keysRead(slot)).toEqual(["TSK-2", "TSK-1", "TSK-4"]);
    await act(async () => nextList.resolve({ tasks: [records[1], records[5]], nextCursor: null }));
    await waitFor(() => expect(keysRead(slot)).toEqual(["TSK-2", "TSK-1", "TSK-4", "TSK-6"]));
    expect(slot.queryByRole("button", { name: "Open TSK-1: Title 1" })).toBeNull();
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 2");
    expect(slot.inspection.navigateCalls).toEqual([]);
  });

  it("replaces neighbors when a filter hides a task and expands its matching sibling", async () => {
    const old = deferred<unknown>();
    const slot = fixture("all?task=TSK-2", {
      getTaskByKey: (raw) =>
        ["TSK-1", "TSK-4"].includes(String(rpcInput(raw).taskKey))
          ? old.promise
          : { task: records.find((task) => task.key === rpcInput(raw).taskKey) },
    });
    await waitFor(() => expect(keysRead(slot)).toEqual(["TSK-2", "TSK-1", "TSK-4"]));
    fireEvent.pointerDown(slot.getByRole("button", { name: "Priority" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await slot.findByRole("menuitemcheckbox", { name: /Urgent/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(slot.queryByRole("button", { name: "Open TSK-1: Title 1" })).toBeNull(),
    );
    await slot.findByRole("button", { name: "Open TSK-3: Title 3" });
    await act(async () => old.resolve({ task: null }));
    await waitFor(() => expect(keysRead(slot)).toEqual(["TSK-2", "TSK-1", "TSK-4", "TSK-3"]));
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 2");
  });

  it("does not issue reads from an unsettled or failed initial list", async () => {
    const pending = deferred<unknown>();
    const slot = fixture("all?task=TSK-2", {
      listTasks: async () => {
        await pending.promise;
        throw new Error("List offline");
      },
    });
    await act(async () => {});
    expect(keysRead(slot)).toEqual([]);
    await act(async () => pending.resolve({}));
    await slot.findByText("List offline");
    expect(keysRead(slot)).toEqual([]);
  });

  it("shows an adjacent task on its first visit without a loading gap or repeated lookup", async () => {
    const slot = fixture("all?task=TSK-2");
    await waitFor(() => expect(keysRead(slot)).toEqual(["TSK-2", "TSK-1", "TSK-4"]));
    await act(async () => {});
    fireEvent.click(row(slot, 4));
    await acceptNavigation(slot);
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 4");
    expect(slot.container.querySelector('[data-detail-key="TSK-4"]')?.textContent).toContain(
      "Description 4",
    );
    expect(slot.queryByText("Loading TSK-4…")).toBeNull();
    expect(keysRead(slot).filter((key) => key === "TSK-4")).toHaveLength(1);
  });

  it("waits for selected success and lets navigation share an issued adjacent read", async () => {
    const selected = deferred<unknown>();
    const next = deferred<unknown>();
    const slot = fixture("all?task=TSK-2", {
      getTaskByKey: (raw) =>
        rpcInput(raw).taskKey === "TSK-2"
          ? selected.promise
          : rpcInput(raw).taskKey === "TSK-4"
            ? next.promise
            : { task: records.find((task) => task.key === rpcInput(raw).taskKey) },
    });
    await slot.findByText("Loading TSK-2…");
    expect(keysRead(slot)).toEqual(["TSK-2"]);
    await act(async () => selected.resolve({ task: records[1] }));
    await waitFor(() => expect(keysRead(slot)).toEqual(["TSK-2", "TSK-1", "TSK-4"]));
    fireEvent.click(row(slot, 4));
    await acceptNavigation(slot);
    expect(slot.getByText("Loading TSK-4…")).toBeTruthy();
    expect(keysRead(slot).filter((key) => key === "TSK-4")).toHaveLength(1);
    await act(async () => next.resolve({ task: records[3] }));
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 4");
  });

  it("replaces collapse speculation and late hidden responses cannot navigate or steal focus", async () => {
    storeExpandedTasks("all", new Set(["task-2"]), new Set(["task-2"]));
    const hidden = deferred<unknown>();
    const slot = fixture("all?task=TSK-2", {
      getTaskByKey: (raw) =>
        rpcInput(raw).taskKey === "TSK-3"
          ? hidden.promise
          : { task: records.find((task) => task.key === rpcInput(raw).taskKey) },
    });
    await waitFor(() => expect(keysRead(slot)).toEqual(["TSK-2", "TSK-1", "TSK-3"]));
    fireEvent.click(slot.getByRole("button", { name: "Collapse subtasks of TSK-2" }));
    await waitFor(() =>
      expect(slot.queryByRole("button", { name: "Open TSK-3: Title 3" })).toBeNull(),
    );
    await waitFor(() => expect(keysRead(slot)).toContain("TSK-4"));
    row(slot, 2).focus();
    const focused = document.activeElement;
    const calls = slot.inspection.rpcCalls.length;
    const opens = slot.inspection.experimental_fixedTabOpenCalls.length;
    await act(async () => hidden.resolve({ task: records[2] }));
    expect(document.activeElement).toBe(focused);
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(slot.inspection.experimental_fixedTabOpenCalls).toHaveLength(opens);
    expect(slot.inspection.rpcCalls).toHaveLength(calls);
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 2");
  });

  it("does not reopen a parked native tab when speculation completes, and stops on unmount", async () => {
    const next = deferred<unknown>();
    const slot = fixture("all?task=TSK-2", {
      getTaskByKey: (raw) =>
        rpcInput(raw).taskKey === "TSK-4"
          ? next.promise
          : { task: records.find((task) => task.key === rpcInput(raw).taskKey) },
    });
    await waitFor(() => expect(keysRead(slot)).toEqual(["TSK-2", "TSK-1", "TSK-4"]));
    slot.lifecycle.rerender(<Panel subPath="all?task=TSK-2" ticketVisible={false} />);
    const opens = slot.inspection.experimental_fixedTabOpenCalls.length;
    await act(async () => next.resolve({ task: records[3] }));
    expect(slot.inspection.experimental_fixedTabOpenCalls).toHaveLength(opens);
    expect(slot.inspection.navigateCalls).toEqual([]);
    slot.lifecycle.unmount();
    await act(async () => {});
    const count = slot.inspection.rpcCalls.length;
    await slot.behavior.emitRealtime("tasks:changed", {});
    expect(slot.inspection.rpcCalls).toHaveLength(count);
  });
});
