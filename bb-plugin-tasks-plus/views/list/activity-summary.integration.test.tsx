// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { TaskWorkStatus, ThreadExecution } from "../../shared/contract.js";
import { TasksRefreshProvider } from "../../shell/refresh.js";
import { makeTask, rpcInput } from "../../test-fixtures.js";
import { COMPACT_VIEWPORT_QUERY } from "@/components/ui/hooks/use-compact-viewport";
import { ListView } from "./index.js";

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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function List() {
  return (
    <TasksRefreshProvider>
      <ListView projectId="project-a" />
    </TasksRefreshProvider>
  );
}

function renderList() {
  const tasks = [
    makeTask({ id: "parent", projectId: "project-a", key: "ALP-1", title: "Parent" }),
    makeTask({
      id: "child",
      projectId: "project-a",
      key: "ALP-2",
      title: "Child",
      parentTaskId: "parent",
    }),
    makeTask({
      id: "other",
      projectId: "project-a",
      key: "ALP-3",
      title: "Other",
      status: "in_progress",
    }),
  ];
  const executions: Record<string, ThreadExecution> = {
    parent: "idle",
    child: "working",
    other: "failed",
  };
  const status = (taskId: string): TaskWorkStatus => ({
    availability: "available",
    observedAt: new Date().toISOString(),
    threads: [
      {
        threadId: `thr_${taskId}`,
        title: `Agent for ${taskId}`,
        presetName: "Default",
        execution: executions[taskId]!,
        archive: "unarchived",
      },
    ],
    pullRequests: { availability: "available", items: [], unavailableThreadIds: [] },
  });
  const observe = vi.fn((raw: unknown) => {
    const ids = rpcInput(raw).taskIds as string[];
    return { byTaskId: Object.fromEntries(ids.map((id) => [id, status(id)])) };
  });
  const slot = renderSlot(
    { component: List },
    {},
    {
      rpc: {
        listProjects: () => ({ projects: [] }),
        listLabels: () => ({ labels: [] }),
        listTasks: (raw: unknown) => {
          const statuses = rpcInput(raw).statuses as string[] | undefined;
          return {
            tasks: statuses ? tasks.filter((task) => statuses.includes(task.status)) : tasks,
            nextCursor: null,
          };
        },
        listTaskWorkStatus: observe,
      },
    },
  );
  return { slot, observe };
}

it("summarizes only observed rows as subtasks and status groups collapse and expand", async () => {
  const { slot, observe } = renderList();
  await slot.findByRole("button", { name: /Threads for ALP-1: 1 Idle/ });
  const headers = slot.container.querySelector(".task-list-columns")!;
  expect([...headers.children].map((cell) => cell.textContent)).toEqual([
    "Task",
    "",
    "Subtasks",
    "Agents",
    "Dependencies & PR",
  ]);
  expect(slot.queryByText("Child")).toBeNull();
  const summary = () => slot.getByLabelText("Agent activity for listed tasks").textContent;
  expect(summary()).toBe("1 failed · 1 idle");
  expect(rpcInput(observe.mock.calls.at(-1)![0]).taskIds).toEqual(["other", "parent"]);
  expect(slot.queryByText("Agent activity loading")).toBeNull();

  fireEvent.click(slot.getByRole("button", { name: "Expand subtasks of ALP-1" }));
  await slot.findByRole("button", { name: /Threads for ALP-2: 1 Running/ });
  expect(summary()).toBe("1 failed · 1 running · 1 idle");

  fireEvent.click(slot.getByRole("button", { name: "Todo" }));
  await waitFor(() => expect(summary()).toBe("1 failed"));
  expect(slot.queryByText("Parent")).toBeNull();
  expect(slot.queryByText("Child")).toBeNull();
  expect(slot.queryByText("Agent activity loading")).toBeNull();

  fireEvent.click(slot.getByRole("button", { name: "In Progress" }));
  await waitFor(() => expect(slot.queryByLabelText("Agent activity for listed tasks")).toBeNull());
  expect(slot.queryByText("Agent activity loading")).toBeNull();

  fireEvent.click(slot.getByRole("button", { name: "Todo" }));
  await slot.findByRole("button", { name: /Threads for ALP-2: 1 Running/ });
  expect(summary()).toBe("1 running · 1 idle");
});

it("keeps activity counts consistent with the filtered rows and their visible parent context", async () => {
  const { slot } = renderList();
  await slot.findByRole("button", { name: /Threads for ALP-1: 1 Idle/ });
  fireEvent.click(slot.getByRole("button", { name: "Status" }));
  fireEvent.click(await slot.findByRole("menuitemcheckbox", { name: "Todo" }));
  await slot.findByRole("button", { name: /Threads for ALP-2: 1 Running/ });
  await waitFor(() => {
    expect(slot.getByLabelText("Agent activity for listed tasks").textContent).toBe(
      "1 running · 1 idle",
    );
  });
  expect(slot.queryByText("Other")).toBeNull();
  expect(slot.queryByText("Agent activity loading")).toBeNull();
});
