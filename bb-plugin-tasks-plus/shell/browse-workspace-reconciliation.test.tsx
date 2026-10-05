// @vitest-environment jsdom
import { act, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { rpcInput } from "../test-fixtures.js";
import { storeListPreference, loadListPreference } from "../views/list/list-preference.js";
import { loadExpandedTasks, storeExpandedTasks } from "../views/list/expanded-tasks.js";
import { browsePreference } from "./browse-preference.js";
import {
  Panel,
  acceptNavigation,
  deferred,
  edit,
  project,
  row,
  setup,
  tasks,
  useWorkspaceTestLifecycle,
} from "./browse-workspace.test-support.js";

useWorkspaceTestLifecycle();
const prompt = "Select a ticket to view and edit";
const keys = (slot: ReturnType<typeof setup>) =>
  [...slot.container.querySelectorAll<HTMLElement>("[data-task-key]")].map(
    (el) => el.dataset.taskKey,
  );
const title = (slot: ReturnType<typeof setup>) => slot.getByRole("textbox", { name: "Task title" });
async function cleared(slot: ReturnType<typeof setup>) {
  await waitFor(() =>
    expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
      options: { subPath: "all", replace: true },
    }),
  );
  await acceptNavigation(slot);
  expect(slot.getByText(prompt)).toBeTruthy();
  expect(slot.container.querySelector('[aria-current="true"]')).toBeNull();
}
function statusFilter() {
  storeListPreference("all", {
    filters: { statuses: ["todo"], priorities: [], labelNames: [] },
    sort: "priority",
  });
}
const parent = { ...tasks[0]!, status: "done" as const };
const child = {
  ...tasks[1]!,
  parentTaskId: parent.id,
  priority: "urgent" as const,
};
const nested = [parent, child, tasks[2]!];
function nestedRpc(raw: unknown) {
  const input = rpcInput(raw);
  return {
    tasks: input.parentTaskId ? [] : input.statuses ? [child, tasks[2]!] : nested,
    nextCursor: null,
  };
}

describe("ongoing browse selection", () => {
  it("selects a child without changing custom sort, dimmed parent grouping or counts, then clears on collapse", async () => {
    statusFilter();
    const slot = setup("all?task=TSK-2", {
      listTasks: nestedRpc,
      getTaskByKey: () => ({ task: child }),
    });
    await slot.findByRole("textbox", { name: "Task title" });
    expect(keys(slot)).toEqual(["TSK-3", "TSK-1", "TSK-2"]);
    expect(row(slot, 2).getAttribute("aria-current")).toBe("true");
    const parentRow = row(slot, 1).closest("[data-task-key]")!;
    expect(parentRow.getAttribute("data-dimmed")).toBe("true");
    expect(within(parentRow as HTMLElement).getByText("0/1")).toBeTruthy();
    const group = slot.container
      .querySelector('[data-status-group-header="done"]')!
      .closest("section")!;
    expect(group.querySelectorAll("[data-task-key]")).toHaveLength(2);
    expect(slot.getByText("2 tasks")).toBeTruthy();
    fireEvent.click(slot.getByRole("button", { name: "Collapse subtasks of TSK-1" }));
    await cleared(slot);
    expect(keys(slot)).toEqual(["TSK-3", "TSK-1"]);
    expect(loadListPreference("all").sort).toBe("priority");
  });

  it("retains a visible dimmed parent through sort changes without changing group counts", async () => {
    statusFilter();
    const slot = setup("all?task=TSK-1", {
      listTasks: nestedRpc,
      getTaskByKey: () => ({ task: parent }),
    });
    await slot.findByRole("textbox", { name: "Task title" });
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
    fireEvent.keyDown(slot.getByRole("button", { name: /Sort/ }), {
      key: "Enter",
    });
    fireEvent.click(await slot.findByRole("menuitemcheckbox", { name: "Due date" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(loadListPreference("all").sort).toBe("due");
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(keys(slot)).toEqual(["TSK-3", "TSK-1", "TSK-2"]);
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
    expect(slot.getByText("2 tasks")).toBeTruthy();
  });
  it("retains selection through deferred refresh and a failed refresh, then clears settled list removal", async () => {
    let response: unknown = { tasks, nextCursor: null };
    const slot = setup("all?task=TSK-1", {
      listTasks: (raw) => (rpcInput(raw).parentTaskId ? { tasks: [], nextCursor: null } : response),
    });
    await slot.findByRole("textbox", { name: "Task title" });
    const refresh = deferred<unknown>();
    response = refresh.promise;
    await slot.behavior.emitRealtime("tasks:changed", {});
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
    expect(slot.inspection.navigateCalls).toEqual([]);
    await act(async () => refresh.resolve({ tasks: [...tasks].reverse(), nextCursor: null }));
    expect(title(slot).textContent).toBe("Title 1");
    const failed = deferred<unknown>();
    response = failed.promise;
    await slot.behavior.emitRealtime("tasks:changed", {});
    await act(async () => failed.resolve(Promise.reject(new Error("Offline"))));
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
    response = { tasks: tasks.slice(1), nextCursor: null };
    await slot.behavior.emitRealtime("tasks:changed", {});
    await cleared(slot);
  });

  it("stages filters and their persistence until the originating save succeeds", async () => {
    let canSave = false;
    const slot = setup("all?task=TSK-1", {
      updateTask: () =>
        canSave ? { ok: true, task: tasks[0] } : { ok: false, error: { message: "Keep draft" } },
    });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Draft before filter");
    fireEvent.keyDown(slot.getByRole("button", { name: "Status" }), {
      key: "Enter",
    });
    fireEvent.click(await slot.findByRole("menuitemcheckbox", { name: "Done" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect((await slot.findByRole("alert")).textContent).toContain("Keep draft");
    expect(loadListPreference("all").filters.statuses).toEqual([]);
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
    expect(slot.container.querySelector(".tiptap")?.textContent).toBe("Draft before filter");
    expect(slot.inspection.navigateCalls).toEqual([]);
    canSave = true;
    fireEvent.click(slot.getByRole("button", { name: "Retry save" }));
    await cleared(slot);
    expect(loadListPreference("all").filters.statuses).toEqual(["done"]);
  });

  it("stages persisted collapse until a failed child save can be retried", async () => {
    storeExpandedTasks("all", new Set([parent.id]), new Set([parent.id]));
    let canSave = false;
    const slot = setup("all?task=TSK-2", {
      listTasks: nestedRpc,
      getTaskByKey: () => ({ task: child }),
      updateTask: () =>
        canSave
          ? { ok: true, task: child }
          : { ok: false, error: { message: "Child save failed" } },
    });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Child draft");
    fireEvent.click(slot.getByRole("button", { name: "Collapse subtasks of TSK-1" }));
    await slot.findByRole("alert");
    expect(loadExpandedTasks("all").has(parent.id)).toBe(true);
    expect(row(slot, 2).getAttribute("aria-current")).toBe("true");
    canSave = true;
    fireEvent.click(slot.getByRole("button", { name: "Retry save" }));
    await cleared(slot);
    expect(loadExpandedTasks("all").has(parent.id)).toBe(false);
  });

  it("keeps the originating row and editor accessible when external removal encounters a failed save", async () => {
    let removed = false;
    let canSave = false;
    const slot = setup("all?task=TSK-1", {
      listTasks: (raw) => ({
        tasks: rpcInput(raw).parentTaskId ? [] : removed ? tasks.slice(1) : tasks,
        nextCursor: null,
      }),
      updateTask: () =>
        canSave
          ? { ok: true, task: tasks[0] }
          : { ok: false, error: { message: "Removal save failed" } },
    });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Draft on removed task");
    removed = true;
    await slot.behavior.emitRealtime("tasks:changed", {});
    expect((await slot.findByRole("alert")).textContent).toContain("Removal save failed");
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
    expect(slot.container.querySelector(".tiptap")?.textContent).toBe("Draft on removed task");
    expect(slot.inspection.navigateCalls).toEqual([]);
    canSave = true;
    fireEvent.click(slot.getByRole("button", { name: "Retry save" }));
    await cleared(slot);
    expect(keys(slot)).toEqual(["TSK-2", "TSK-3"]);
  });

  it("saves the editor before a row status write can hide its selection", async () => {
    statusFilter();
    const writes: Record<string, unknown>[] = [];
    let canSave = false;
    const slot = setup("all?task=TSK-1", {
      updateTask: (raw) => {
        const input = rpcInput(raw);
        writes.push(input);
        return canSave
          ? { ok: true, task: { ...tasks[0], ...input } }
          : { ok: false, error: { message: "Save before status" } };
      },
    });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Before status");
    row(slot, 1).focus();
    fireEvent.keyDown(window, { key: "s" });
    fireEvent.click(await slot.findByRole("menuitem", { name: /Done/ }));
    await slot.findByRole("alert");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ description: "Before status" });
    expect(writes[0]).not.toHaveProperty("status");
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
    canSave = true;
    fireEvent.click(slot.getByRole("button", { name: "Retry save" }));
    await cleared(slot);
    expect(writes.at(-1)).toMatchObject({
      taskId: tasks[0]!.id,
      status: "done",
    });
  });

  it("clears after a detail status edit settles outside the current filter", async () => {
    statusFilter();
    let current = tasks[0]!;
    const slot = setup("all?task=TSK-1", {
      getTaskByKey: () => ({ task: current }),
      listTasks: (raw) => ({
        tasks: rpcInput(raw).parentTaskId
          ? []
          : rpcInput(raw).statuses && current.status !== "todo"
            ? tasks.slice(1)
            : [current, ...tasks.slice(1)],
        nextCursor: null,
      }),
      updateTask: (raw) => {
        current = { ...current, ...rpcInput(raw) };
        return { ok: true, task: current };
      },
    });
    await slot.findByRole("textbox", { name: "Task title" });
    slot.getByRole("button", { name: "Open standalone ticket" }).focus();
    fireEvent.keyDown(window, { key: "s" });
    fireEvent.click(await slot.findByRole("menuitem", { name: /Done/ }));
    await waitFor(() => expect(current.status).toBe("done"));
    await slot.behavior.emitRealtime("tasks:changed", {});
    await cleared(slot);
  });

  it("clears confirmed deletion even when it leaves an empty list", async () => {
    let removed = false;
    const slot = setup("all?task=TSK-1", {
      getTaskByKey: () => ({ task: removed ? null : tasks[0] }),
      listTasks: (raw) => ({
        tasks: removed || rpcInput(raw).parentTaskId ? [] : [tasks[0]],
        nextCursor: null,
      }),
    });
    await slot.findByRole("textbox", { name: "Task title" });
    removed = true;
    await slot.behavior.emitRealtime("tasks:changed", {});
    await cleared(slot);
    expect(slot.inspection.navigateCalls).toHaveLength(1);
    expect(slot.getByText("No tasks yet")).toBeTruthy();
  });
  it("rechecks detail absence when a slow save completes during a newer refresh", async () => {
    let removed = false;
    let response: unknown;
    const saved = deferred<unknown>();
    const slot = setup("all?task=TSK-1", {
      getTaskByKey: () => response ?? { task: removed ? null : tasks[0] },
      updateTask: () => saved.promise,
    });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Retain while refresh is pending");
    removed = true;
    await slot.behavior.emitRealtime("tasks:changed", {});
    const refresh = deferred<unknown>();
    response = refresh.promise;
    await slot.behavior.emitRealtime("tasks:changed", {});
    await act(async () => saved.resolve({ ok: true, task: tasks[0] }));
    expect(slot.inspection.navigateCalls).toEqual([]);
    await act(async () => refresh.resolve({ task: tasks[0] }));
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
  });
  it("does not commit a queued removal if a newer settled refresh restores the row", async () => {
    let removed = false;
    const saved = deferred<unknown>();
    const slot = setup("all?task=TSK-1", {
      listTasks: (raw) => ({
        tasks: rpcInput(raw).parentTaskId ? [] : removed ? tasks.slice(1) : tasks,
        nextCursor: null,
      }),
      updateTask: () => saved.promise,
    });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Keep me");
    removed = true;
    await slot.behavior.emitRealtime("tasks:changed", {});
    removed = false;
    await slot.behavior.emitRealtime("tasks:changed", {});
    await act(async () => saved.resolve({ ok: true, task: tasks[0] }));
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
  });

  it("guards project changes and remembered scope on failure, then clears the old selection", async () => {
    let canSave = false;
    const slot = setup("all?task=TSK-1", {
      updateTask: () =>
        canSave
          ? { ok: true, task: tasks[0] }
          : { ok: false, error: { message: "Scope save failed" } },
    });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Origin");
    slot.lifecycle.rerender(<Panel subPath={`${project.id}?view=list`} />);
    await slot.findByRole("alert");
    expect(browsePreference().load()).toEqual({ kind: "all" });
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
    canSave = true;
    fireEvent.click(slot.getByRole("button", { name: "Retry save" }));
    await slot.findByText(prompt);
    expect(browsePreference().load()).toEqual({
      kind: "project",
      projectId: project.id,
    });
    expect(slot.container.querySelector('[aria-current="true"]')).toBeNull();
  });
});
