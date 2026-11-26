// @vitest-environment jsdom
import { fail as missingValue } from "node:assert/strict";
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { ComponentProps } from "react";
import type { Task, TaskMutationResult } from "../../shared/contract.js";
import { makeTask } from "../../test-fixtures.js";
import { TasksRefreshProvider } from "../../shell/refresh.js";
import { ListView } from "./index.js";
import * as listDates from "./lib.js";

window.matchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
});
window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const List = (props: ComponentProps<typeof ListView>) => {
  return (
    <TasksRefreshProvider>
      <ListView {...props} />
    </TasksRefreshProvider>
  );
};

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function fixture(projectId: string | null, status: Task["status"] = "backlog") {
  const moved = makeTask({
    id: "a-moving",
    projectId: "a",
    key: "A-1",
    title: "Task 1",
    status,
    position: 1024,
  });
  const destination: Task["status"] = status === "backlog" ? "done" : "backlog";
  // Project order matters in All projects. A task must not move after project B.
  const tasks = [
    moved,
    ...Array.from({ length: 80 }, (_, index) =>
      makeTask({
        id: `a-${index}`,
        projectId: "a",
        key: `A-${index + 2}`,
        status: destination,
        position: (index + 1) * 1024,
        dueDate: "2026-07-10",
      }),
    ),
    ...(projectId === null
      ? [makeTask({ id: "b-1", projectId: "b", key: "B-1", status: destination, position: 1024 })]
      : []),
  ];
  let finishSave!: (result: TaskMutationResult) => void;
  let finishRefresh!: (result: { tasks: Task[]; nextCursor: null }) => void;
  let refresh = false;
  const context = vi.fn((commit: () => void) => commit());
  const slot = renderSlot(
    { component: List },
    { projectId, onRequestContextChange: context },
    {
      rpc: {
        listProjects: () => ({ projects: [] }),
        listTasks: () =>
          refresh
            ? (() => {
                const { promise, resolve } = Promise.withResolvers<unknown>();
                finishRefresh = resolve;
                return promise;
              })()
            : { tasks, nextCursor: null },
        listTaskWorkStatus: () => ({ byTaskId: {} }),
        updateTask: () =>
          (() => {
            const { promise, resolve } = Promise.withResolvers<unknown>();
            finishSave = resolve;
            return promise;
          })(),
      },
    },
  );
  const order = () =>
    Array.from(slot.container.querySelectorAll("[data-task-key]"), (row) =>
      row.getAttribute("data-task-key"),
    );
  const expected = [
    ...tasks
      .slice(1)
      .filter((task) => task.projectId === "a")
      .map((task) => task.key),
    moved.key,
    ...tasks.filter((task) => task.projectId === "b").map((task) => task.key),
  ];
  return {
    slot,
    moved,
    tasks,
    destination,
    order,
    expected,
    context,
    save: (result: TaskMutationResult) => act(() => Promise.try(() => finishSave(result))),
    async refetch(saved: Task) {
      refresh = true;
      await slot.behavior.emitRealtime("tasks:changed", {});
      await waitFor(() => expect(finishRefresh).toBeTypeOf("function"));
      expect(order()).toEqual(expected);
      const byKey = new Map([...tasks.slice(1), saved].map((task) => [task.key, task]));
      await act(() =>
        Promise.try(() =>
          finishRefresh({
            tasks: expected.map((key) =>
              structuredClone(byKey.get(key) ?? missingValue("Expected byKey.get(key)")),
            ),
            nextCursor: null,
          }),
        ),
      );
    },
  };
}

async function changeStatus(f: ReturnType<typeof fixture>) {
  await f.slot.findByRole("button", { name: "Open A-1: Task 1" });
  const row =
    f.slot.container.querySelector<HTMLElement>('[data-task-key="A-1"]') ??
    missingValue("Expected a non-null value");
  fireEvent.pointerDown(within(row).getByRole("button", { name: /Change status/ }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(
    await f.slot.findByRole("menuitem", { name: f.destination === "done" ? /Done/ : /Backlog/ }),
  );
}

it.each([null, "a"])(
  "keeps Manual placement stable through save and delayed refresh in scope %s",
  async (projectId) => {
    const formatDueDate = vi.spyOn(listDates, "formatDueDate");
    const f = fixture(projectId);
    await waitFor(() => expect(formatDueDate).toHaveBeenCalled());
    await waitFor(() => expect(f.slot.queryByText("Agent activity loading")).toBeNull());
    formatDueDate.mockClear();
    await changeStatus(f);
    await waitFor(() => expect(f.order()).toEqual(f.expected));
    expect(f.context).toHaveBeenCalledTimes(1);
    expect(f.slot.container.querySelector('[data-task-key="A-1"]')?.getAttribute("aria-busy")).toBe(
      "true",
    );
    const saved = { ...f.moved, status: f.destination, position: 81 * 1024 };
    await f.save({ ok: true, task: saved });
    expect(f.order()).toEqual(f.expected);
    await f.refetch(saved);
    expect(formatDueDate.mock.calls.filter(([date]) => date === "2026-07-10")).toHaveLength(0);
    await waitFor(() => expect(f.order()).toEqual(f.expected));
  },
);

it("keeps placement stable when the refetch arrives before the save response", async () => {
  const f = fixture(null);
  await changeStatus(f);
  await waitFor(() => expect(f.order()).toEqual(f.expected));
  const saved = { ...f.moved, status: f.destination, position: 81 * 1024 };
  await f.refetch(saved);
  expect(f.order()).toEqual(f.expected);
  await f.save({ ok: true, task: saved });
  await waitFor(() => expect(f.order()).toEqual(f.expected));
});

it("appends a reverse status move and restores the original order on failure", async () => {
  const f = fixture(null, "done");
  const original = [...f.tasks.slice(1).map((task) => task.key), f.moved.key];
  await f.slot.findByText("A-1");
  expect(f.order()).toEqual(original);
  await changeStatus(f);
  await waitFor(() => expect(f.order()).toEqual(f.expected));
  await f.save({
    ok: false,
    error: { code: "task_parent_invalid", message: "Status could not be saved" },
  });
  await waitFor(() => expect(f.order()).toEqual(original));
  await f.slot.findByText("Status could not be saved");
});

it("restores row focus without scrolling when the status menu closes", async () => {
  const f = fixture(null);
  const focus = vi.spyOn(HTMLElement.prototype, "focus");
  await f.slot.findByText("A-1");
  const row =
    f.slot.container.querySelector<HTMLElement>('[data-task-key="A-1"]') ??
    missingValue("Expected a non-null value");
  fireEvent.pointerDown(within(row).getByRole("button", { name: /Change status/ }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.keyDown(await f.slot.findByRole("menuitem", { name: /Done/ }), { key: "Escape" });
  await waitFor(() =>
    expect(document.activeElement).toBe(within(row).getByRole("button", { name: /Open A-1/ })),
  );
  const index = focus.mock.contexts.lastIndexOf(document.activeElement);
  expect(focus.mock.calls[index]).toEqual([{ preventScroll: true }]);
});
