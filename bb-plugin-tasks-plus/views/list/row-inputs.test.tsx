// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { ComponentProps } from "react";
import type { Task, TaskWorkStatus } from "../../shared/contract.js";
import { makeTask } from "../../test-fixtures.js";
import { TasksRefreshProvider } from "../../shell/refresh.js";
import { ListView } from "./index.js";
import { COMPACT_VIEWPORT_QUERY } from "@/components/ui/hooks/use-compact-viewport";
window.matchMedia = (query: string) => ({
  matches: query === COMPACT_VIEWPORT_QUERY,
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

it("keeps task edits, labels and live thread/PR observations visible after selection", async () => {
  let tasks = [1, 2].map((number) =>
    makeTask({ id: `t${number}`, key: `TSK-${number}`, title: `Task ${number}` }),
  );
  const project = {
    id: tasks[0]!.projectId,
    name: "Test",
    prefix: "TSK",
    nextTaskNumber: 3,
    color: "blue",
    folderId: null,
    linkedBbProjectId: null,
    createdAt: "2026-07-15T00:00:00Z",
  };
  let labels = [{ id: "bug", projectId: project.id, name: "Bug", color: "red" }];
  let execution: "working" | "failed" = "working";
  let prState: "open" | "merged" = "open";
  const status = (): TaskWorkStatus => ({
    availability: "available",
    observedAt: new Date().toISOString(),
    threads: [
      {
        threadId: "thr_test",
        title: "Worker",
        presetName: "Test",
        execution,
        archive: "unarchived",
      },
    ],
    pullRequests: {
      availability: "available",
      unavailableThreadIds: [],
      items: [
        {
          url: "https://github.com/test/repo/pull/1",
          number: 1,
          title: "Fix",
          state: prState,
          threadIds: ["thr_test"],
          details: "unavailable",
          detailsReason: "integration_absent",
          updatedAt: new Date().toISOString(),
        },
      ],
    },
  });
  const props = { projectId: project.id, selectedTaskKey: "TSK-1", onRequestSelection: vi.fn() };
  const slot = renderSlot({ component: List }, props, {
    rpc: {
      listProjects: () => ({ projects: [project] }),
      listLabels: () => ({ labels }),
      listTasks: () => ({ tasks, nextCursor: null }),
      listTaskWorkStatus: () => ({ byTaskId: { t1: status(), t2: status() } }),
    },
  });
  await slot.findByRole("button", { name: /Threads for TSK-1: 1 Running/ });
  expect(
    slot.container.querySelector('[data-task-key="TSK-1"]')!.getAttribute("data-agent-state"),
  ).toBe("running");
  slot.lifecycle.rerender(<List {...props} selectedTaskKey="TSK-2" />);
  execution = "failed";
  prState = "merged";
  tasks = [{ ...tasks[0]!, title: "Edited", dueDate: "2026-11-04", labelIds: ["bug"] }, tasks[1]!];
  await slot.behavior.emitRealtime("tasks:changed", {});
  await slot.findByRole("button", { name: "Open TSK-1: Edited" });
  await slot.findByRole("button", { name: /Threads for TSK-1: 1 Failed/ });
  expect(
    slot.container.querySelector('[data-task-key="TSK-1"]')!.getAttribute("data-agent-state"),
  ).toBeNull();
  expect(slot.getByRole("button", { name: /PR details for TSK-1:.*Merged/ })).toBeTruthy();
  labels = [{ ...labels[0]!, name: "Regression" }];
  await slot.behavior.emitRealtime("projects:changed", {});
  const row = slot.container.querySelector<HTMLElement>('[data-task-key="TSK-1"]')!;
  fireEvent.contextMenu(row);
  fireEvent.keyDown(await slot.findByRole("menuitem", { name: "Labels" }), { key: "ArrowRight" });
  expect(
    (await slot.findByRole("menuitemcheckbox", { name: "Regression" })).getAttribute(
      "aria-checked",
    ),
  ).toBe("true");
});

it("uses the current context action for edits and reports pending writes as unsettled", async () => {
  const task = makeTask({ id: "t1", title: "Original" });
  let finish: ((result: { ok: true; task: Task }) => void) | undefined;
  const oldContext = vi.fn((commit: () => void) => commit());
  const currentContext = vi.fn((commit: () => void) => commit());
  const report = vi.fn();
  const props = {
    projectId: null,
    onRequestContextChange: oldContext,
    onVisibleOrderChange: report,
  };
  const slot = renderSlot({ component: List }, props, {
    rpc: {
      listProjects: () => ({ projects: [] }),
      listTasks: () => ({ tasks: [task], nextCursor: null }),
      listTaskWorkStatus: () => ({ byTaskId: {} }),
      updateTask: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
  });
  await slot.findByRole("button", { name: "Open TSK-1: Original" });
  slot.lifecycle.rerender(<List {...props} onRequestContextChange={currentContext} />);
  const row = slot.container.querySelector<HTMLElement>('[data-task-key="TSK-1"]')!;
  fireEvent.click(within(row).getByRole("button", { name: "Change status, currently Todo" }));
  fireEvent.click(await slot.findByRole("menuitem", { name: /Done/ }));
  await waitFor(() =>
    expect(slot.container.querySelector('[data-task-key="TSK-1"]')?.getAttribute("aria-busy")).toBe(
      "true",
    ),
  );
  expect(report.mock.calls.at(-1)?.[0]).toEqual({ keys: ["TSK-1"], settled: false });
  expect(currentContext).toHaveBeenCalledTimes(1);
  expect(oldContext).not.toHaveBeenCalled();
  await act(async () => finish?.({ ok: true, task: { ...task, status: "done" } }));
  await waitFor(() =>
    expect(
      slot.container.querySelector('[data-task-key="TSK-1"]')?.getAttribute("aria-busy"),
    ).toBeNull(),
  );
  expect(report.mock.calls.at(-1)?.[0]).toEqual({ keys: ["TSK-1"], settled: true });
  expect(
    within(slot.container.querySelector<HTMLElement>('[data-task-key="TSK-1"]')!).getByRole(
      "button",
      { name: "Change status, currently Done" },
    ),
  ).toBeTruthy();
});
