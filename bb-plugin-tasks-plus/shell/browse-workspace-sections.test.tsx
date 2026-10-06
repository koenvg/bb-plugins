// @vitest-environment jsdom
import { act, fireEvent, waitFor, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { loadListPreference, storeListPreference } from "../views/list/list-preference.js";
import { loadExpandedTasks, storeExpandedTasks } from "../views/list/expanded-tasks.js";
import { rpcInput } from "../test-fixtures.js";
import {
  acceptNavigation,
  deferred,
  edit,
  row,
  setup,
  tasks,
  project,
  useWorkspaceTestLifecycle,
} from "./browse-workspace.test-support.js";

useWorkspaceTestLifecycle();
const parent = { ...tasks[0]!, status: "done" as const };
const child = { ...tasks[1]!, parentTaskId: parent.id };
const records = [parent, child, tasks[2]!];
const nestedRpc = (raw: unknown) => ({
  tasks: rpcInput(raw).parentTaskId ? [] : records,
  nextCursor: null,
});

const sectionHeader = (slot: ReturnType<typeof setup>, name: string) =>
  within(slot.container.querySelector<HTMLElement>("[data-list-scroll]")!).getByRole("button", {
    name,
  });
for (const scope of ["all", "active", project.id]) {
  const preferenceScope =
    scope === project.id ? (`project:${scope}` as const) : (scope as "all" | "active");

  const returnPath = scope === project.id ? `${scope}?view=list` : scope;
  for (const selected of [parent, child]) {
    it(`in ${scope}, retains the selected ${selected === parent ? "parent" : "child"}, draft and prior choice on failed save, then retries section collapse`, async () => {
      storeExpandedTasks(preferenceScope, new Set([parent.id]), new Set([parent.id]));
      let canSave = false;
      const slot = setup(`${scope}?task=${selected.key}`, {
        listTasks: nestedRpc,
        getTaskByKey: () => ({ task: selected }),
        updateTask: () =>
          canSave
            ? { ok: true, task: selected }
            : { ok: false, error: { message: "Section save failed" } },
      });
      await slot.findByRole("textbox", { name: "Task title" });
      await edit(slot, "Keep section draft");
      const header = sectionHeader(slot, "Done");
      fireEvent.click(header);
      expect((await slot.findByRole("alert")).textContent).toContain("Section save failed");
      expect(header.getAttribute("aria-expanded")).toBe("true");
      expect(row(slot, selected.number).getAttribute("aria-current")).toBe("true");
      expect(slot.container.querySelector(".tiptap")?.textContent).toBe("Keep section draft");
      expect(loadListPreference(preferenceScope).collapsedStatuses).toEqual([]);
      expect(slot.inspection.navigateCalls).toEqual([]);
      canSave = true;
      const retry = slot.getByRole("button", { name: "Retry save" });
      retry.focus();
      fireEvent.click(retry);
      await waitFor(() =>
        expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
          options: { subPath: returnPath },
        }),
      );
      await acceptNavigation(slot);
      await slot.findByText("Select a ticket to view and edit");
      expect(header.getAttribute("aria-expanded")).toBe("false");
      expect(slot.container.querySelector(`[data-task-key="${selected.key}"]`)).toBeNull();
      expect(loadListPreference(preferenceScope).collapsedStatuses).toEqual(["done"]);
      expect(loadExpandedTasks(preferenceScope).has(parent.id)).toBe(true);
      expect(document.activeElement).toBe(header);
    });

    it(`in ${scope}, restores header focus after delayed ${selected === parent ? "parent save from a removed row" : "child save from a Ticket control"}`, async () => {
      storeExpandedTasks(preferenceScope, new Set([parent.id]), new Set([parent.id]));
      const save = deferred<unknown>();
      const slot = setup(`${scope}?task=${selected.key}`, {
        listTasks: nestedRpc,
        getTaskByKey: () => ({ task: selected }),
        updateTask: () => save.promise,
      });
      await slot.findByRole("textbox", { name: "Task title" });
      await edit(slot, "Keep owned header restoration");
      const header = sectionHeader(slot, "Done");
      const origin =
        selected === parent
          ? row(slot, selected.number)
          : slot.getByRole("button", { name: "Open standalone ticket" });
      origin.focus();
      fireEvent.click(header);
      expect(header.getAttribute("aria-expanded")).toBe("true");
      await act(async () => save.resolve({ ok: true, task: selected }));
      await waitFor(() =>
        expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
          options: { subPath: returnPath },
        }),
      );
      await acceptNavigation(slot);
      expect(header.getAttribute("aria-expanded")).toBe("false");
      expect(slot.container.querySelector(`[data-task-key="${selected.key}"]`)).toBeNull();
      expect(loadExpandedTasks(preferenceScope).has(parent.id)).toBe(true);
      expect(document.activeElement).toBe(header);
    });
  }
}

it("restores header focus after delayed save and hidden-selection reconciliation", async () => {
  const save = deferred<unknown>();
  const slot = setup("all?task=TSK-1", { updateTask: () => save.promise });
  await slot.findByRole("textbox", { name: "Task title" });
  await edit(slot, "Delayed section save");
  const header = sectionHeader(slot, "Todo");
  fireEvent.click(header);
  expect(header.getAttribute("aria-expanded")).toBe("true");
  expect(loadListPreference("all").collapsedStatuses).toEqual([]);
  await act(async () => save.resolve({ ok: true, task: tasks[0] }));
  await waitFor(() =>
    expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({ options: { subPath: "all" } }),
  );
  await acceptNavigation(slot);
  expect(header.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(header);
});

it("does not take focus from outside Tasks after delayed section save and reconciliation", async () => {
  const save = deferred<unknown>();
  const slot = setup("all?task=TSK-1", { updateTask: () => save.promise });
  await slot.findByRole("textbox", { name: "Task title" });
  await edit(slot, "Save without taking outside focus");
  const header = sectionHeader(slot, "Todo");
  header.focus();
  fireEvent.click(header);
  const outside = document.createElement("button");
  outside.textContent = "Outside Tasks";
  document.body.append(outside);
  try {
    outside.focus();
    await act(async () => save.resolve({ ok: true, task: tasks[0] }));
    await waitFor(() =>
      expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({ options: { subPath: "all" } }),
    );
    await acceptNavigation(slot);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(slot.container.querySelector('[data-task-key="TSK-1"]')).toBeNull();
    expect(document.activeElement).toBe(outside);
  } finally {
    outside.remove();
  }
});

it("cancels delayed header focus for an open overlay, including after it closes", async () => {
  const save = deferred<unknown>();
  const slot = setup("all?task=TSK-1", { updateTask: () => save.promise });
  await slot.findByRole("textbox", { name: "Task title" });
  await edit(slot, "Save while an overlay owns focus");
  const header = sectionHeader(slot, "Todo");
  fireEvent.click(header);
  const sort = slot.getByRole("button", { name: "Sort" });
  sort.focus();
  // Keep focus in Tasks to check the overlay veto, not the outside-pane veto.
  const overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog");
  document.body.append(overlay);
  try {
    await act(async () => save.resolve({ ok: true, task: tasks[0] }));
    await waitFor(() =>
      expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({ options: { subPath: "all" } }),
    );
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(loadListPreference("all").collapsedStatuses).toEqual(["todo"]);
    expect(document.activeElement).toBe(sort);
    overlay.remove();
    await acceptNavigation(slot);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(sort);
  } finally {
    overlay.remove();
  }
});

it("consumes canceled header focus before later reconciliation regains browse ownership", async () => {
  const save = deferred<unknown>();
  let refreshedTasks = tasks;
  const slot = setup("all?task=TSK-1", {
    updateTask: () => save.promise,
    listTasks: (raw) => ({
      tasks: rpcInput(raw).parentTaskId ? [] : refreshedTasks,
      nextCursor: null,
    }),
  });
  await slot.findByRole("textbox", { name: "Task title" });
  await edit(slot, "Do not restore a canceled focus request");
  const header = sectionHeader(slot, "Todo");
  fireEvent.click(header);
  const outside = document.createElement("button");
  document.body.append(outside);
  try {
    outside.focus();
    await act(async () => save.resolve({ ok: true, task: tasks[0] }));
    await waitFor(() =>
      expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({ options: { subPath: "all" } }),
    );
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(loadListPreference("all").collapsedStatuses).toEqual(["todo"]);
    expect(document.activeElement).toBe(outside);
    const sort = slot.getByRole("button", { name: "Sort" });
    sort.focus();
    await acceptNavigation(slot);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(sort);
    refreshedTasks = [
      ...tasks,
      { ...tasks[2]!, id: "01HZZZZZZZZZZZZZZZZZZZZZT4", key: "TSK-4", number: 4 },
    ];
    await slot.behavior.emitRealtime("tasks:changed", {});
    await waitFor(() => expect(header.textContent).toContain("4"));
    expect(document.activeElement).toBe(sort);
  } finally {
    outside.remove();
  }
});

it("leaves an editable Ticket field in use after a delayed collapse in another section", async () => {
  const save = deferred<unknown>();
  const slot = setup("all?task=TSK-3", {
    listTasks: nestedRpc,
    updateTask: () => save.promise,
  });
  const title = await slot.findByRole("textbox", { name: "Task title" });
  await edit(slot, "Keep using this Ticket field");
  const header = sectionHeader(slot, "Done");
  fireEvent.click(header);
  title.focus();
  await act(async () => save.resolve({ ok: true, task: tasks[2] }));
  await waitFor(() => expect(header.getAttribute("aria-expanded")).toBe("false"));
  expect(row(slot, 3).getAttribute("aria-current")).toBe("true");
  expect(slot.inspection.navigateCalls).toEqual([]);
  expect(document.activeElement).toBe(title);
});

for (const scope of ["all", "active", project.id]) {
  const preferenceScope =
    scope === project.id ? (`project:${scope}` as const) : (scope as "all" | "active");
  it(`in ${scope}, keeps selection in another section and skips hidden parents and children during navigation`, async () => {
    storeExpandedTasks(preferenceScope, new Set([parent.id]), new Set([parent.id]));
    const slot = setup(`${scope}?task=TSK-3`, { listTasks: nestedRpc });
    await slot.findByRole("textbox", { name: "Task title" });
    const header = slot.getByRole("button", { name: "Done" });
    fireEvent.click(header);
    expect(row(slot, 3).getAttribute("aria-current")).toBe("true");
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(slot.queryByRole("button", { name: "Open TSK-1: Title 1" })).toBeNull();
    expect(slot.queryByRole("button", { name: "Open TSK-2: Title 2" })).toBeNull();
    row(slot, 3).focus();
    fireEvent.keyDown(window, { key: "k" });
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(row(slot, 3).getAttribute("aria-current")).toBe("true");
  });
}

it("does not turn header Enter, Space or row-property keys into task actions", async () => {
  const slot = setup();
  const header = await slot.findByRole("button", { name: "Todo" });
  header.focus();
  for (const key of ["Enter", " ", "s", "p", "l"]) fireEvent.keyDown(header, { key });
  // jsdom does not perform native button activation. Native-input verification remains open.
  expect(slot.inspection.navigateCalls).toEqual([]);
  expect(slot.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(header);
});

it("hides a filtered matching child with its dimmed parent without changing counts", async () => {
  storeListPreference("all", {
    filters: { statuses: ["todo"], priorities: [], labelNames: [] },
    sort: "manual",
    collapsedStatuses: [],
  });
  const slot = setup("all", {
    listTasks: (raw) => ({
      tasks: rpcInput(raw).parentTaskId
        ? []
        : rpcInput(raw).statuses
          ? [child, tasks[2]!]
          : records,
      nextCursor: null,
    }),
  });
  await slot.findByText("TSK-2");
  const header = slot.getByRole("button", { name: "Done" });
  expect(header.textContent).toContain("1");
  expect(slot.getByText("2 tasks")).toBeTruthy();
  fireEvent.click(header);
  expect(slot.queryByText("TSK-1")).toBeNull();
  expect(slot.queryByText("TSK-2")).toBeNull();
  expect(slot.getByText("2 tasks")).toBeTruthy();
  fireEvent.click(header);
  await slot.findByText("TSK-2");
  expect(slot.container.querySelector('[data-task-key="TSK-1"]')?.getAttribute("data-dimmed")).toBe(
    "true",
  );
});
