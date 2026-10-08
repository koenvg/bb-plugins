// @vitest-environment jsdom
import { act, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  panelSize,
  setup,
  row,
  select,
  useWorkspaceTestLifecycle,
  edit,
  tasks,
  project,
  deferred,
  Panel,
  acceptNavigation,
} from "./browse-workspace.test-support.js";
import { rpcInput } from "../test-fixtures.js";
import { storeListPreference } from "../views/list/list-preference.js";
import { browsePreference } from "./browse-preference.js";

useWorkspaceTestLifecycle();

function observePanel() {
  const callbacks = new Map<Element, ResizeObserverCallback>();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(element: Element) {
        callbacks.set(element, this.callback);
      }
      unobserve(element: Element) {
        callbacks.delete(element);
      }
      disconnect() {}
    },
  );
  return async (width: number) => {
    panelSize.width = width;
    await act(async () => {
      for (const [element, callback] of callbacks) {
        if (element.tagName === "MAIN") callback([], {} as ResizeObserver);
      }
    });
  };
}

async function hostTab(slot: ReturnType<typeof setup>, subPath: string, visible: boolean) {
  slot.lifecycle.rerender(<Panel subPath={subPath} ticketVisible={visible} />);
  await act(async () => {});
}

describe("host-controlled Ticket presentation", () => {
  it("retains project filters, sort, expansion and list scroll across host tab closure and resize", async () => {
    const resize = observePanel();
    storeListPreference(`project:${project.id}`, {
      filters: { statuses: ["todo"], priorities: [], labelNames: [] },
      sort: "priority",
    });
    const child = { ...tasks[2]!, parentTaskId: tasks[0]!.id };
    const path = `${project.id}?view=list&task=TSK-3`;
    const slot = setup(`${project.id}?view=list`, {
      listTasks: (raw) => ({
        tasks: rpcInput(raw).parentTaskId ? [child] : [tasks[0], tasks[1], child],
        nextCursor: null,
      }),
      getTaskByKey: () => ({ task: child }),
    });
    await slot.findByRole("button", { name: "Collapse subtasks of TSK-1" });
    fireEvent.click(slot.getByRole("button", { name: "Collapse subtasks of TSK-1" }));
    fireEvent.click(slot.getByRole("button", { name: "Expand subtasks of TSK-1" }));
    const list = slot.getByRole("region", { name: "Ticket list" });
    const scroll = list.querySelector<HTMLElement>("[data-list-scroll]")!;
    Object.defineProperty(scroll, "scrollHeight", { value: 1400 });
    Object.defineProperty(scroll, "clientHeight", { value: 500 });
    scroll.scrollTop = 215;
    fireEvent.scroll(scroll);
    const filterState = () => [
      within(list).getByRole("button", { name: /^Status/ }).textContent,
      within(list).getByRole("button", { name: /^Sort/ }).textContent,
    ];
    const filters = filterState();
    await select(slot, 3);
    await hostTab(slot, path, false);
    await resize(320);
    await hostTab(slot, path, true);
    await resize(1000);
    expect(slot.getByRole("region", { name: "Ticket list" })).toBe(list);
    expect(scroll.scrollTop).toBe(215);
    expect(row(slot, 3).getAttribute("aria-current")).toBe("true");
    expect(
      slot
        .getByRole("button", { name: "Collapse subtasks of TSK-1" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(filterState()).toEqual(filters);
    expect(
      [...list.querySelectorAll("[data-task-key]")].map((el) => el.getAttribute("data-task-key")),
    ).toEqual(["TSK-1", "TSK-3", "TSK-2"]);
    expect(browsePreference().load()).toEqual({
      kind: "project",
      projectId: project.id,
    });
    expect(slot.inspection.navigateCalls).toHaveLength(1);
  });

  it("restores native detail scroll after parked DOM loses its scroll geometry", async () => {
    const path = "all?task=TSK-1";
    const slot = setup(path);
    await slot.findByRole("textbox", { name: "Task title" });
    const detail = slot.getByRole("region", { name: "Selected ticket" });
    detail.scrollTop = 93;
    fireEvent.scroll(detail);
    await hostTab(slot, path, false);
    // Chrome resets this offset when the portal moves under hidden parking.
    detail.scrollTop = 0;
    fireEvent.scroll(detail);
    await hostTab(slot, path, true);
    expect(slot.getByRole("region", { name: "Selected ticket" })).toBe(detail);
    expect(detail.scrollTop).toBe(93);
  });
  it("keeps the same title, description, comment, files and notification choice when the host unmounts the tab", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const slot = setup("all?task=TSK-1", {
      getTaskActivity: () => ({
        entries: [
          {
            id: "reply",
            taskId: tasks[0]!.id,
            kind: "agent",
            authorName: "Agent",
            presetName: null,
            threadId: "thr_agent",
            threadTitle: "Agent thread",
            body: "Reply",
            notifiedCount: 0,
            createdAt: project.createdAt,
            provider: null,
          },
        ].map((comment) => ({ comment, attachments: [] })),
      }),
      updateTask: (raw) => ({
        ok: true,
        task: { ...tasks[0], ...rpcInput(raw) },
      }),
    });
    const title = await slot.findByRole("textbox", { name: "Task title" });
    const description = slot.container.querySelector(".tiptap");
    await edit(slot, "Unsent A", 1);
    const comment = slot.container.querySelectorAll('.tiptap[contenteditable="true"]')[1];
    fireEvent.click(await slot.findByRole("switch", { name: "Notify Agent thread" }));
    fireEvent.change(slot.container.querySelectorAll('input[type="file"]')[1]!, {
      target: { files: [new File(["A"], "a.txt")] },
    });
    title.textContent = "Unblurred A";
    fireEvent.input(title);
    await edit(slot, "Description draft");
    await hostTab(slot, "all?task=TSK-1", false);
    expect(slot.queryByRole("textbox", { name: "Task title" })).toBeNull();
    await hostTab(slot, "all?task=TSK-1", true);
    expect(slot.getByRole("textbox", { name: "Task title" })).toBe(title);
    expect(title.textContent).toBe("Unblurred A");
    expect(slot.container.querySelector(".tiptap")).toBe(description);
    expect(description?.textContent).toBe("Description draft");
    expect(slot.container.querySelectorAll('.tiptap[contenteditable="true"]')[1]).toBe(comment);
    expect(comment?.textContent).toBe("Unsent A");
    expect(slot.getByText("a.txt")).toBeTruthy();
    expect(
      slot.getByRole("switch", { name: "Notify Agent thread" }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      slot.inspection.rpcCalls.filter((c) => ["createComment", "delegate"].includes(c.method)),
    ).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not lose a pending originating save when the host closes Ticket", async () => {
    const saved = deferred<unknown>();
    const slot = setup("all?task=TSK-1", { updateTask: () => saved.promise });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Save before changing tickets");
    fireEvent.click(row(slot, 2));
    await hostTab(slot, "all?task=TSK-1", false);
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
    expect(slot.inspection.navigateCalls).toEqual([]);
    await act(async () => saved.resolve({ ok: true, task: tasks[0] }));
    await waitFor(() => expect(slot.inspection.navigateCalls).toHaveLength(1));
    await acceptNavigation(slot);
    expect((await slot.findByRole("textbox", { name: "Task title" })).textContent).toBe("Title 2");
    expect(
      slot.inspection.rpcCalls.filter((c) => c.method === "updateTask").map((c) => c.input),
    ).toEqual([{ taskId: tasks[0]!.id, description: "Save before changing tickets" }]);
  });

  it("does not reopen a closed host panel on refresh or steal another pane's focus", async () => {
    const resize = observePanel();
    const slot = setup("all?task=TSK-1");
    await slot.findByRole("textbox", { name: "Task title" });
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    const opens = slot.inspection.experimental_fixedTabOpenCalls.length;
    await hostTab(slot, "all?task=TSK-1", false);
    await resize(600);
    await slot.behavior.emitRealtime("tasks:changed", {});
    expect(slot.inspection.experimental_fixedTabOpenCalls).toHaveLength(opens);
    expect(document.activeElement).toBe(outside);
    fireEvent.keyDown(outside, { key: "j" });
    expect(slot.inspection.navigateCalls).toEqual([]);
    await hostTab(slot, "all?task=TSK-1", true);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("returns focus with Escape without clearing selection or scrolling the list", async () => {
    const slot = setup("all?task=TSK-1");
    await slot.findByRole("textbox", { name: "Task title" });
    const list = slot.getByRole("region", { name: "Ticket list" });
    const scroll = list.querySelector<HTMLElement>("[data-list-scroll]")!;
    scroll.scrollTop = 170;
    fireEvent.scroll(scroll);
    const selected = row(slot, 1);
    const focus = vi.spyOn(selected, "focus");
    const detail = slot.getByRole("region", { name: "Selected ticket" });
    detail.focus();
    fireEvent.keyDown(detail, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(selected));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scroll.scrollTop).toBe(170);
    expect(selected.getAttribute("aria-current")).toBe("true");
    expect(slot.inspection.navigateCalls).toEqual([]);
  });

  it("leaves layout and drawer ownership to BB at every main-pane width", async () => {
    const resize = observePanel();
    const slot = setup("all?task=TSK-1");
    const title = await slot.findByRole("textbox", { name: "Task title" });
    const list = slot.getByRole("region", { name: "Ticket list" });
    title.focus();
    for (const width of [880, 600, 320, 1000]) {
      await resize(width);
      expect(list.hidden).toBe(false);
      expect(list.style.width).toBe("");
      expect(slot.getByRole("textbox", { name: "Task title" })).toBe(title);
      expect(document.activeElement).toBe(title);
      expect(slot.queryByRole("button", { name: "Back to list" })).toBeNull();
    }
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(slot.container.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
  });
});
