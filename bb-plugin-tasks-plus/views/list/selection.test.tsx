// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { ListView, type VisibleTaskOrder } from "./index.js";
import { storeListPreference } from "./list-preference.js";
import { makeTask, rpcInput } from "../../test-fixtures.js";
import { TasksRefreshProvider } from "../../shell/refresh.js";
import type { ComponentProps } from "react";
function List(props: ComponentProps<typeof ListView>) {
  return (
    <TasksRefreshProvider>
      <ListView {...props} />
    </TasksRefreshProvider>
  );
}

afterEach(cleanup);

it("reports the rendered sorted tree with dimmed parents and expanded children, and accepts controlled selection", async () => {
  const parent = makeTask({
    id: "parent",
    key: "TSK-1",
    title: "Parent",
    status: "done",
  });
  const child = makeTask({
    id: "child",
    key: "TSK-2",
    title: "Child",
    parentTaskId: "parent",
    status: "todo",
  });
  const other = makeTask({
    id: "other",
    key: "TSK-3",
    title: "Another",
    status: "todo",
    priority: "urgent",
  });
  storeListPreference("all", {
    filters: { statuses: ["todo"], priorities: [], labelNames: [] },
    sort: "priority",
  });
  const report = vi.fn<(order: VisibleTaskOrder) => void>();
  const select = vi.fn();
  let finishRefresh: ((value: unknown) => void) | undefined;
  let refreshPending = false;
  const props = {
    projectId: null,
    selectedTaskKey: null as string | null,
    onRequestSelection: select,
    onVisibleOrderChange: report,
  };
  const slot = renderSlot({ component: List }, props, {
    rpc: {
      listProjects: () => ({ projects: [] }),
      listLabels: () => ({ labels: [] }),
      listTaskThreads: () => ({ taskThreads: [] }),
      listTasks: (raw) => {
        if (refreshPending && rpcInput(raw).statuses)
          return new Promise((resolve) => {
            finishRefresh = resolve;
          });
        return {
          tasks: rpcInput(raw).statuses
            ? [child, other]
            : [parent, child, other],
          nextCursor: null,
        };
      },
    },
  });
  await slot.findByRole("button", { name: "Open TSK-2: Child" });
  const renderedKeys = () =>
    [...slot.container.querySelectorAll<HTMLElement>("[data-task-key]")].map(
      (el) => el.dataset.taskKey,
    );
  await waitFor(() =>
    expect(report.mock.calls.at(-1)?.[0]).toEqual({
      keys: renderedKeys(),
      settled: true,
    }),
  );
  expect(renderedKeys()).toEqual(["TSK-3", "TSK-1", "TSK-2"]);
  expect(
    slot.container
      .querySelector('[data-task-key="TSK-1"]')
      ?.getAttribute("data-dimmed"),
  ).toBe("true");
  const childButton = slot.getByRole("button", { name: "Open TSK-2: Child" });
  fireEvent.click(childButton);
  expect(select).toHaveBeenCalledExactlyOnceWith("TSK-2");
  expect(childButton.getAttribute("aria-current")).toBeNull();
  slot.lifecycle.rerender(<List {...props} selectedTaskKey="TSK-2" />);
  expect(childButton.getAttribute("aria-current")).toBe("true");
  fireEvent.click(
    slot.getByRole("button", { name: "Collapse subtasks of TSK-1" }),
  );
  await waitFor(() =>
    expect(report.mock.calls.at(-1)?.[0]).toEqual({
      keys: ["TSK-3", "TSK-1"],
      settled: true,
    }),
  );
  refreshPending = true;
  await slot.behavior.emitRealtime("tasks:changed", {});
  expect(report.mock.calls.at(-1)?.[0].settled).toBe(false);
  await act(async () =>
    finishRefresh?.({ tasks: [child, other], nextCursor: null }),
  );
  await waitFor(() => expect(report.mock.calls.at(-1)?.[0].settled).toBe(true));
});

it("reports only the retained rendered tree as unsettled while removal waits for acceptance", async () => {
  const a = makeTask({ id: "a", key: "TSK-1", title: "Origin" });
  const b = makeTask({ id: "b", key: "TSK-2", title: "Other" });
  let records = [a, b];
  const report = vi.fn<(order: VisibleTaskOrder) => void>();
  const unavailable = vi.fn();
  const props = {
    projectId: null,
    selectedTaskKey: "TSK-1" as string | null,
    onVisibleOrderChange: report,
    onSelectionUnavailable: unavailable,
  };
  const slot = renderSlot({ component: List }, props, {
    rpc: {
      listProjects: () => ({ projects: [] }),
      listLabels: () => ({ labels: [] }),
      listTaskThreads: () => ({ taskThreads: [] }),
      listTasks: () => ({ tasks: records, nextCursor: null }),
    },
  });
  await waitFor(() =>
    expect(report.mock.calls.at(-1)?.[0]).toEqual({
      keys: ["TSK-1", "TSK-2"],
      settled: true,
    }),
  );
  slot.lifecycle.rerender(<List {...props} scopeUnavailable />);
  await waitFor(() =>
    expect(report.mock.calls.at(-1)?.[0]).toEqual({
      keys: ["TSK-1", "TSK-2"],
      settled: false,
    }),
  );
  expect(unavailable).not.toHaveBeenCalled();
  slot.lifecycle.rerender(<List {...props} />);
  records = [b];
  await slot.behavior.emitRealtime("tasks:changed", {});
  await waitFor(() => expect(unavailable).toHaveBeenCalledTimes(1));
  expect(unavailable.mock.calls[0]![0]).toBe("TSK-1");
  const stillUnavailable = unavailable.mock.calls[0]![1] as () => boolean;
  expect(stillUnavailable()).toBe(true);
  expect(
    slot
      .getByRole("button", { name: "Open TSK-1: Origin" })
      .getAttribute("aria-current"),
  ).toBe("true");
  expect(report.mock.calls.at(-1)?.[0]).toEqual({
    keys: ["TSK-1", "TSK-2"],
    settled: false,
  });
  slot.lifecycle.rerender(<List {...props} selectedTaskKey={null} />);
  await waitFor(() =>
    expect(report.mock.calls.at(-1)?.[0]).toEqual({
      keys: ["TSK-2"],
      settled: true,
    }),
  );
  expect(stillUnavailable()).toBe(false);
  expect(slot.queryByRole("button", { name: "Open TSK-1: Origin" })).toBeNull();
});
