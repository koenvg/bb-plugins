// @vitest-environment jsdom
import { act, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { rpcInput } from "../test-fixtures.js";
import { storeListPreference } from "../views/list/list-preference.js";
import {
  acceptNavigation,
  deferred,
  edit,
  panelSize,
  project,
  row,
  setup,
  tasks,
  useWorkspaceTestLifecycle,
} from "./browse-workspace.test-support.js";

useWorkspaceTestLifecycle();
const press = (key: string, extra: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.activeElement ?? window, { key, ...extra });
const detail = (slot: ReturnType<typeof setup>) =>
  slot.getByRole("region", { name: "Selected ticket" });
async function move(slot: ReturnType<typeof setup>, key: string, n: number) {
  press(key);
  await acceptNavigation(slot);
  await waitFor(() => expect(document.activeElement).toBe(row(slot, n)));
  expect(row(slot, n).getAttribute("aria-current")).toBe("true");
  await waitFor(() =>
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe(`Title ${n}`),
  );
}

describe("browse keyboard selection", () => {
  it.each(["j", "k", "ArrowDown", "ArrowUp"])(
    "selects the first row without selection on %s",
    async (key) => {
      const slot = setup();
      await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
      await move(slot, key, 1);
      expect(slot.getByRole("region", { name: "Ticket list" }).hidden).toBe(false);
    },
  );

  it("continues from committed selection in either pane, focuses and scrolls the actual row, and clamps", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    const slot = setup("all?task=TSK-2");
    await slot.findByRole("textbox", { name: "Task title" });
    slot.getByRole("button", { name: "Open standalone ticket" }).focus();
    await move(slot, "j", 3);
    expect(scroll.mock.instances).toContain(row(slot, 3));
    const count = slot.inspection.navigateCalls.length;
    press("ArrowDown");
    expect(slot.inspection.navigateCalls).toHaveLength(count);
    row(slot, 1).focus(); // Tab focus does not invent another selection.
    await move(slot, "k", 2);
    await move(slot, "ArrowUp", 1);
    press("k");
    expect(document.activeElement).toBe(row(slot, 1));
  });

  it("uses sorted filtered nested order including dimmed parents, for movement and paging", async () => {
    storeListPreference(`project:${project.id}`, {
      filters: { statuses: ["todo"], priorities: [], labelNames: [] },
      sort: "priority",
    });
    const records = [
      { ...tasks[0]!, status: "done", priority: "urgent" },
      { ...tasks[1]!, priority: "high" },
      { ...tasks[2]!, parentTaskId: tasks[0]!.id },
    ];
    const slot = setup(`${project.id}?view=list`, {
      listTasks: (raw) => ({
        tasks: rpcInput(raw).parentTaskId
          ? []
          : rpcInput(raw).statuses
            ? records.slice(1)
            : records,
        nextCursor: null,
      }),
      getTaskByKey: (raw) => ({
        task: records.find((t) => t.key === rpcInput(raw).taskKey),
      }),
    });
    await slot.findByRole("button", { name: "Open TSK-3: Title 3" });
    expect(
      [...slot.container.querySelectorAll("[data-task-key]")].map((el) =>
        el.getAttribute("data-task-key"),
      ),
    ).toEqual(["TSK-2", "TSK-1", "TSK-3"]);
    await move(slot, "k", 2);
    await move(slot, "j", 1);
    fireEvent.click(slot.getByRole("button", { name: "Next task" }));
    await acceptNavigation(slot);
    expect(row(slot, 3).getAttribute("aria-current")).toBe("true");
    detail(slot).focus();
    await move(slot, "[", 1);
    await move(slot, "]", 3);
  });

  it("does nothing on an empty list", async () => {
    const slot = setup("all", {
      listTasks: () => ({ tasks: [], nextCursor: null }),
    });
    await slot.findByText("No tasks yet");
    for (const key of ["j", "k", "ArrowDown", "ArrowUp", "o", "]"]) press(key);
    expect(slot.inspection.navigateCalls).toEqual([]);
  });
});

describe("browse focus transitions", () => {
  it.each(["Enter", "o"])(
    "waits for detail loading on %s, then focuses a non-editor and Escape returns",
    async (key) => {
      const loaded = deferred<unknown>();
      const slot = setup("all", { getTaskByKey: () => loaded.promise });
      const first = await slot.findByRole("button", {
        name: "Open TSK-1: Title 1",
      });
      first.focus();
      press(key);
      await acceptNavigation(slot);
      expect(document.activeElement).toBe(first);
      await act(async () => loaded.resolve({ task: tasks[0] }));
      await waitFor(() => expect(document.activeElement).toBe(detail(slot)));
      press("Escape");
      expect(document.activeElement).toBe(first);
      expect(first.getAttribute("aria-current")).toBe("true");
      expect(slot.inspection.navigateCalls).toHaveLength(1);
    },
  );

  it("does not focus a superseded lookup", async () => {
    const loaded = deferred<unknown>();
    const slot = setup("all", {
      getTaskByKey: (raw) =>
        rpcInput(raw).taskKey === "TSK-1" ? loaded.promise : { task: tasks[1] },
    });
    (await slot.findByRole("button", { name: "Open TSK-1: Title 1" })).focus();
    press("o");
    await acceptNavigation(slot);
    await move(slot, "j", 2);
    await act(async () => loaded.resolve({ task: tasks[0] }));
    expect(document.activeElement).toBe(row(slot, 2));
  });

  it("waits for save success, retains origin and Retry on failure, and only focuses the accepted target", async () => {
    const saved = deferred<unknown>();
    let retry = false;
    const slot = setup("all?task=TSK-1", {
      updateTask: () => (retry ? { ok: true, task: tasks[0] } : saved.promise),
    });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Keep origin");
    detail(slot).focus();
    press("j");
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
    await act(async () => saved.resolve({ ok: false, error: { message: "Offline" } }));
    await slot.findByRole("alert");
    expect(document.activeElement).toBe(detail(slot));
    expect(slot.container.querySelector(".tiptap")?.textContent).toBe("Keep origin");
    retry = true;
    fireEvent.click(slot.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(slot.inspection.navigateCalls).toHaveLength(1));
    await acceptNavigation(slot);
    await waitFor(() => expect(document.activeElement).toBe(row(slot, 2)));
  });

  it("keeps native-pane keyboard navigation at narrow main widths and Escape returns to the same row", async () => {
    panelSize.width = 600;
    const slot = setup("all?task=TSK-1");
    await slot.findByRole("textbox", { name: "Task title" });
    detail(slot).focus();
    press("j");
    await acceptNavigation(slot);
    expect(document.activeElement).toBe(row(slot, 2));
    expect(document.activeElement?.closest("[hidden], [inert]")).toBeNull();
    detail(slot).focus();
    press("Escape");
    await waitFor(() => expect(document.activeElement).toBe(row(slot, 2)));
    press("m");
    expect(document.activeElement).toBe(row(slot, 2));
  });
});
