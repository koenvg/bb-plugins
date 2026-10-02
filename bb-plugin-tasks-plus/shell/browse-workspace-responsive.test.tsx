// @vitest-environment jsdom
import { act, fireEvent, waitFor } from "@testing-library/react";
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

describe("compact browse context", () => {
  it("retains project filters, sort and a filtered expansion override through Back and resize", async () => {
    const resize = observePanel();
    panelSize.width = 600;
    storeListPreference(`project:${project.id}`, {
      filters: { statuses: ["todo"], priorities: [], labelNames: [] },
      sort: "priority",
    });
    const child = { ...tasks[2]!, parentTaskId: tasks[0]!.id };
    const slot = setup(`${project.id}?view=list`, {
      listTasks: (raw) => ({
        tasks: rpcInput(raw).parentTaskId
          ? [child]
          : [tasks[0], tasks[1], child],
        nextCursor: null,
      }),
      getTaskByKey: () => ({ task: child }),
    });
    await slot.findByRole("button", { name: "Collapse subtasks of TSK-1" });
    fireEvent.click(
      slot.getByRole("button", { name: "Collapse subtasks of TSK-1" }),
    );
    fireEvent.click(
      slot.getByRole("button", { name: "Expand subtasks of TSK-1" }),
    );
    const list = slot.getByRole("region", { name: "Ticket list" });
    const scroll = list.querySelector<HTMLElement>("[data-list-scroll]")!;
    Object.defineProperty(scroll, "scrollHeight", { value: 1400 });
    Object.defineProperty(scroll, "clientHeight", { value: 500 });
    scroll.scrollTop = 215;
    fireEvent.scroll(scroll);
    const filters =
      list.querySelector("[data-list-scroll]")!.previousElementSibling!
        .textContent;
    await select(slot, 3);
    fireEvent.click(slot.getByRole("button", { name: "Back to list" }));
    await resize(1000);
    await resize(600);
    expect(slot.getByRole("region", { name: "Ticket list" })).toBe(list);
    expect(scroll.scrollTop).toBe(215);
    expect(row(slot, 3).getAttribute("aria-current")).toBe("true");
    expect(
      slot
        .getByRole("button", { name: "Collapse subtasks of TSK-1" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      list.querySelector("[data-list-scroll]")!.previousElementSibling!
        .textContent,
    ).toBe(filters);
    expect(
      [...list.querySelectorAll("[data-task-key]")].map((el) =>
        el.getAttribute("data-task-key"),
      ),
    ).toEqual(["TSK-1", "TSK-3", "TSK-2"]);
    expect(browsePreference().load()).toEqual({
      kind: "project",
      projectId: project.id,
    });
    expect(slot.inspection.navigateCalls).toHaveLength(1);
  });

  it("does not let a failed Back hide the origin and retries without routing or submitting", async () => {
    panelSize.width = 600;
    const saved = deferred<unknown>();
    let retry = false;
    const slot = setup("all?task=TSK-1", {
      updateTask: () => (retry ? { ok: true, task: tasks[0] } : saved.promise),
    });
    const title = await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Draft before Back");
    fireEvent.click(slot.getByRole("button", { name: "Back to list" }));
    expect(slot.queryByRole("region", { name: "Ticket list" })).toBeNull();
    await act(async () =>
      saved.resolve({ ok: false, error: { message: "Save refused" } }),
    );
    expect((await slot.findByRole("alert")).textContent).toContain(
      "Save refused",
    );
    expect(slot.getByRole("textbox", { name: "Task title" })).toBe(title);
    expect(slot.container.querySelector(".tiptap")?.textContent).toBe(
      "Draft before Back",
    );
    retry = true;
    fireEvent.click(slot.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(document.activeElement).toBe(row(slot, 1)));
    expect(slot.inspection.navigateCalls).toHaveLength(0);
    expect(
      slot.inspection.rpcCalls
        .filter((c) => c.method === "updateTask")
        .map((c) => c.input),
    ).toEqual([
      { taskId: tasks[0]!.id, description: "Draft before Back" },
      { taskId: tasks[0]!.id, description: "Draft before Back" },
    ]);
  });

  it("keeps comment text, files, notification choice and pending edits bound to the same mounted ticket", async () => {
    const resize = observePanel();
    const fetch = vi.spyOn(globalThis, "fetch");
    const slot = setup("all?task=TSK-1", {
      listComments: () => ({
        comments: [
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
        ],
      }),
      updateTask: (raw) => ({
        ok: true,
        task: { ...tasks[0], ...rpcInput(raw) },
      }),
    });
    const title = await slot.findByRole("textbox", { name: "Task title" });
    const description = slot.container.querySelector(".tiptap");
    await edit(slot, "Unsent A", 1);
    const comment = slot.container.querySelectorAll(
      '.tiptap[contenteditable="true"]',
    )[1];
    fireEvent.click(
      await slot.findByRole("switch", { name: "Notify Agent thread" }),
    );
    fireEvent.change(
      slot.container.querySelectorAll('input[type="file"]')[1]!,
      { target: { files: [new File(["A"], "a.txt")] } },
    );
    title.textContent = "Unblurred A";
    fireEvent.input(title);
    await edit(slot, "Description draft");
    await resize(600);
    await resize(1000);
    expect(slot.getByRole("textbox", { name: "Task title" })).toBe(title);
    expect(title.textContent).toBe("Unblurred A");
    expect(slot.container.querySelector(".tiptap")).toBe(description);
    expect(description?.textContent).toBe("Description draft");
    expect(
      slot.inspection.rpcCalls.filter((c) => c.method === "updateTask"),
    ).toHaveLength(0);
    await resize(600);
    fireEvent.click(slot.getByRole("button", { name: "Back to list" }));
    await slot.findByRole("region", { name: "Ticket list" });
    await select(slot, 1);
    expect(
      slot.container.querySelectorAll('.tiptap[contenteditable="true"]')[1],
    ).toBe(comment);
    expect(comment?.textContent).toBe("Unsent A");
    expect(slot.getByText("a.txt")).toBeTruthy();
    expect(
      slot
        .getByRole("switch", { name: "Notify Agent thread" })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      slot.inspection.rpcCalls.filter((c) =>
        ["createComment", "delegate"].includes(c.method),
      ),
    ).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("excludes hidden pane shortcuts and leaves outside-panel focus alone on resize", async () => {
    const resize = observePanel();
    const slot = setup("all?task=TSK-1");
    await slot.findByRole("textbox", { name: "Task title" });
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    await resize(600);
    expect(document.activeElement).toBe(outside);
    fireEvent.keyDown(outside, { key: "j" });
    expect(document.activeElement).toBe(outside);
    outside.remove();
    fireEvent.keyDown(document.body, { key: "j" });
    expect(slot.inspection.navigateCalls).toHaveLength(0);
    expect(
      slot
        .getByRole("region", { name: "Selected ticket" })
        .contains(document.activeElement),
    ).toBe(false);
    fireEvent.click(slot.getByRole("button", { name: "Back to list" }));
    fireEvent.keyDown(document.activeElement!, { key: "m" });
    expect(slot.queryByRole("region", { name: "Selected ticket" })).toBeNull();
    expect(document.activeElement).toBe(row(slot, 1));
  });
  it("finishes a pending Back after widening and shows an externally accepted new selection", async () => {
    panelSize.width = 600;
    const resize = observePanel();
    const saved = deferred<unknown>();
    const slot = setup("all?task=TSK-1", { updateTask: () => saved.promise });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Save before Back");
    fireEvent.click(slot.getByRole("button", { name: "Back to list" }));
    await resize(1000);
    await act(async () => saved.resolve({ ok: true, task: tasks[0] }));
    expect(document.activeElement).toBe(row(slot, 1));
    await resize(600);
    expect(slot.getByRole("region", { name: "Ticket list" })).toBeTruthy();
    slot.lifecycle.rerender(<Panel subPath="all?task=TSK-2" />);
    await waitFor(() =>
      expect(
        slot.getByRole("textbox", { name: "Task title" }).textContent,
      ).toBe("Title 2"),
    );
    expect(slot.queryByRole("region", { name: "Ticket list" })).toBeNull();
  });
  it("returns focus to the retained selected row without clearing selection or scrolling", async () => {
    panelSize.width = 600;
    const slot = setup();
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    const list = slot.getByRole("region", { name: "Ticket list" });
    const scroll = list.querySelector<HTMLElement>("[data-list-scroll]")!;
    Object.defineProperty(scroll, "scrollHeight", { value: 1200 });
    Object.defineProperty(scroll, "clientHeight", { value: 500 });
    scroll.scrollTop = 170;
    fireEvent.scroll(scroll);
    const selected = row(slot, 1);
    selected.focus();
    await select(slot, 1);
    const detail = slot.getByRole("region", { name: "Selected ticket" });
    const title = slot.getByRole("textbox", { name: "Task title" });
    expect(document.activeElement).toBe(detail);
    expect(list.hasAttribute("inert")).toBe(true);
    const focus = vi.spyOn(selected, "focus");
    fireEvent.click(slot.getByRole("button", { name: "Back to list" }));
    await waitFor(() => expect(document.activeElement).toBe(selected));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(list.hidden).toBe(false);
    expect(detail.hidden).toBe(true);
    expect(detail.hasAttribute("inert")).toBe(true);
    expect(scroll.scrollTop).toBe(170);
    expect(selected.getAttribute("aria-current")).toBe("true");
    expect(slot.container.contains(title)).toBe(true);
    expect(slot.inspection.navigateCalls).toHaveLength(1);
  });

  it("keeps one identity and mounted editors in both resize directions inside a wide viewport", async () => {
    const resize = observePanel();
    vi.stubGlobal("innerWidth", 1600);
    const slot = setup("all?task=TSK-1");
    const title = await slot.findByRole("textbox", { name: "Task title" });
    const list = slot.getByRole("region", { name: "Ticket list" });
    const detail = slot.getByRole("region", { name: "Selected ticket" });
    row(slot, 1).focus();
    await resize(600);
    expect(list.hidden).toBe(true);
    expect(document.activeElement).toBe(detail);
    expect(slot.getByRole("textbox", { name: "Task title" })).toBe(title);
    await resize(880);
    expect(list.hidden).toBe(false);
    expect(document.activeElement).toBe(detail);
    fireEvent.click(slot.getByRole("textbox", { name: "Task title" }));
    title.focus();
    await resize(320);
    expect(document.activeElement).toBe(title);
    await resize(1000);
    expect(document.activeElement).toBe(title);
    expect(slot.inspection.navigateCalls).toHaveLength(0);
    expect(
      slot.container.querySelectorAll('[aria-current="true"]'),
    ).toHaveLength(1);
  });
});
