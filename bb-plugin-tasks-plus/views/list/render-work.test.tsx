// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { ListView } from "./index.js";
import { makeTask, rpcInput } from "../../test-fixtures.js";
import { TasksRefreshProvider } from "../../shell/refresh.js";
import type { ComponentProps } from "react";
import { TaskRow } from "./row.js";

function List(props: ComponentProps<typeof ListView>) {
  return (
    <TasksRefreshProvider>
      <ListView {...props} />
    </TasksRefreshProvider>
  );
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("does date work only in the two changed real rows, even with a new selection action", async () => {
  // Count the external date operation, not a mocked row or list implementation.
  const locale = vi.spyOn(Date.prototype, "toLocaleDateString");
  const descriptor = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, "format")!;
  const dates: Date[] = [];
  vi.spyOn(
    Intl.DateTimeFormat.prototype as { readonly format: unknown },
    "format",
    "get",
  ).mockImplementation(function (this: Intl.DateTimeFormat) {
    const format = descriptor.get!.call(this) as (date: Date) => string;
    return (date: Date) => {
      dates.push(date);
      return format(date);
    };
  });
  const tasks = Array.from({ length: 100 }, (_, index) =>
    makeTask({
      id: `task-${index}`,
      key: `TSK-${index + 1}`,
      title: `Task ${index + 1}`,
      position: index,
      dueDate: `2026-07-${String((index % 28) + 1).padStart(2, "0")}`,
    }),
  );
  const report = vi.fn();
  const props = {
    projectId: null,
    selectedTaskKey: "TSK-1",
    onRequestSelection: vi.fn(),
    onVisibleOrderChange: report,
  };
  const slot = renderSlot({ component: List }, props, {
    rpc: {
      listProjects: () => ({ projects: [] }),
      listTasks: () => ({ tasks, nextCursor: null }),
      listTaskWorkStatus: (raw) => ({
        byTaskId: Object.fromEntries(
          (rpcInput(raw).taskIds as string[]).map((id) => [
            id,
            {
              availability: "available",
              observedAt: "2026-10-05T00:00:00Z",
              threads: [],
              pullRequests: { availability: "available", items: [], unavailableThreadIds: [] },
            },
          ]),
        ),
      }),
    },
  });
  await waitFor(() => expect(report.mock.calls.at(-1)?.[0].settled).toBe(true));
  // Flush metadata completion before measuring selection-only work.
  await waitFor(() => expect(slot.queryByText("Threads loading")).toBeNull());
  dates.length = 0;
  locale.mockClear();
  report.mockClear();
  const selection = vi.fn();
  slot.lifecycle.rerender(
    <List {...props} selectedTaskKey="TSK-2" onRequestSelection={selection} />,
  );
  expect(
    slot.getByRole("button", { name: "Open TSK-2: Task 2" }).getAttribute("aria-current"),
  ).toBe("true");
  expect(
    slot.getByRole("button", { name: "Open TSK-1: Task 1" }).getAttribute("aria-current"),
  ).toBeNull();
  expect(dates.length + locale.mock.calls.length).toBe(0);
  expect(report).not.toHaveBeenCalled();
  fireEvent.click(slot.getByRole("button", { name: "Open TSK-3: Task 3" }));
  expect(selection).toHaveBeenCalledExactlyOnceWith("TSK-3");
  expect(props.onRequestSelection).not.toHaveBeenCalled();
});

it("updates unchanged row dates when selection crosses New Year", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 11, 31, 23, 59));
  const tasks = [1, 2, 3].map((number) =>
    makeTask({
      id: `t${number}`,
      key: `TSK-${number}`,
      title: `Task ${number}`,
      dueDate: "2027-01-01",
    }),
  );
  const props = { projectId: null, selectedTaskKey: "TSK-1", onRequestSelection: vi.fn() };
  const slot = renderSlot({ component: List }, props, {
    rpc: {
      listProjects: () => ({ projects: [] }),
      listTasks: () => ({ tasks, nextCursor: null }),
      listTaskWorkStatus: () => ({ byTaskId: {} }),
    },
  });
  await slot.findByRole("button", { name: "Open TSK-3: Task 3" });
  expect(slot.getAllByText("Jan 1, 2027")).toHaveLength(3);
  vi.setSystemTime(new Date(2027, 0, 1, 0, 1));
  slot.lifecycle.rerender(<List {...props} selectedTaskKey="TSK-2" />);
  expect(slot.getAllByText("Jan 1")).toHaveLength(3);
  expect(slot.queryByText("Jan 1, 2027")).toBeNull();
});

it("does not rebuild unchanged real row menus or metadata on selection", () => {
  const semanticRows = new Set<string>();
  const tasks = Array.from({ length: 100 }, (_, index) => {
    const number = index + 1;
    const task = makeTask({ id: `t${number}`, key: `TSK-${number}`, title: `Task ${number}` });
    Object.defineProperty(task, "status", {
      enumerable: true,
      get() {
        semanticRows.add(task.key);
        return "todo";
      },
    });
    return task;
  });
  const onEdit = vi.fn();
  const onMenu = vi.fn();
  const labels: never[] = [];
  function Rows({ selected }: { selected: string }) {
    return (
      <>
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            meta={undefined}
            project={undefined}
            showProject={false}
            projectLabels={labels}
            onEdit={onEdit}
            onOpen={() => {}}
            onOpenMenuChange={onMenu}
            openMenu={null}
            pending={false}
            selected={task.key === selected}
          />
        ))}
      </>
    );
  }
  const slot = renderSlot({ component: Rows }, { selected: "TSK-1" });
  expect(semanticRows.size).toBe(100);
  semanticRows.clear();
  slot.lifecycle.rerender(<Rows selected="TSK-2" />);
  expect(semanticRows.size).toBe(0);
  expect(
    slot.getByRole("button", { name: "Open TSK-1: Task 1" }).getAttribute("aria-current"),
  ).toBeNull();
  expect(
    slot.getByRole("button", { name: "Open TSK-2: Task 2" }).getAttribute("aria-current"),
  ).toBe("true");
});
