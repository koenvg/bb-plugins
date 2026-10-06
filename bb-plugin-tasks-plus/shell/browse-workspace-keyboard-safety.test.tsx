// @vitest-environment jsdom
import { act, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { rpcInput } from "../test-fixtures.js";
import {
  acceptNavigation,
  deferred,
  edit,
  panelSize,
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

describe("browse delayed focus and save safety", () => {
  it("focuses a retryable lookup error, not an editor, and remains navigable", async () => {
    const loaded = deferred<unknown>();
    const slot = setup("all", {
      getTaskByKey: async () => {
        await loaded.promise;
        throw new Error("Lookup offline");
      },
    });
    (await slot.findByRole("button", { name: "Open TSK-1: Title 1" })).focus();
    press("o");
    await acceptNavigation(slot);
    await act(async () => loaded.resolve(null));
    await slot.findByRole("button", { name: "Retry" });
    expect(document.activeElement).toBe(detail(slot));
    press("j");
    await acceptNavigation(slot);
    expect(document.activeElement).toBe(row(slot, 2));
  });

  it("focuses retained A on A-B-A without waiting for B's unfinished read", async () => {
    const loaded = deferred<unknown>();
    let pending = false;
    const slot = setup("all?task=TSK-1", {
      getTaskByKey: () => (pending ? loaded.promise : { task: tasks[0] }),
    });
    await slot.findByRole("textbox", { name: "Task title" });
    pending = true;
    row(slot, 2).focus();
    press("o");
    await acceptNavigation(slot);
    row(slot, 1).focus();
    press("o");
    await acceptNavigation(slot);
    expect(document.activeElement).toBe(detail(slot));
    expect(
      slot.inspection.rpcCalls.filter(
        (call) => call.method === "getTaskByKey" && rpcInput(call.input).taskKey === "TSK-1",
      ),
    ).toHaveLength(1);
    await act(async () => loaded.resolve({ task: tasks[1] }));
    expect(document.activeElement).toBe(detail(slot));
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 1");
  });

  it.each(["outside", "editor", "overlay"])(
    "does not steal %s focus when loading finishes",
    async (target) => {
      const loaded = deferred<unknown>();
      const slot = setup("all", { getTaskByKey: () => loaded.promise });
      (await slot.findByRole("button", { name: "Open TSK-1: Title 1" })).focus();
      press("o");
      await acceptNavigation(slot);
      const other = document.createElement(target === "editor" ? "input" : "button");
      if (target === "overlay") other.setAttribute("role", "dialog");
      (target === "outside" ? document.body : detail(slot)).append(other);
      other.focus();
      await act(async () => loaded.resolve({ task: tasks[0] }));
      expect(document.activeElement).toBe(other);
      other.remove();
      detail(slot).focus(); // Re-render must not resurrect deferred focus after dismissal.
      press("Escape");
      expect(document.activeElement).toBe(row(slot, 1));
    },
  );

  it.each(["outside", "editor", "overlay"])(
    "does not steal %s focus when a deferred Escape save finishes",
    async (owner) => {
      const saved = deferred<unknown>();
      const slot = setup("all?task=TSK-1", { updateTask: () => saved.promise });
      const title = await slot.findByRole("textbox", { name: "Task title" });
      await edit(slot, "Save before Escape");
      detail(slot).focus();
      press("Escape");
      const other = document.createElement(owner === "outside" ? "input" : "button");
      if (owner === "overlay") other.setAttribute("role", "dialog");
      (owner === "outside" ? document.body : detail(slot)).append(other);
      const target = owner === "editor" ? title : other;
      target.focus();
      await act(async () => saved.resolve({ ok: true, task: tasks[0] }));
      const active = document.activeElement;
      other.remove();
      expect(active).toBe(target);
      expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
      expect(slot.inspection.navigateCalls).toEqual([]);
      if (owner === "editor") title.blur();
      // Consumed return intent must not revive on a later render.
      await slot.behavior.emitRealtime("tasks:changed", {});
      expect(document.activeElement).not.toBe(row(slot, 1));
    },
  );

  it.each(["outside", "overlay"])(
    "keeps %s focus when native-pane Escape finishes at a narrow main width",
    async (owner) => {
      panelSize.width = 600;
      const saved = deferred<unknown>();
      const slot = setup("all?task=TSK-1", { updateTask: () => saved.promise });
      await slot.findByRole("textbox", { name: "Task title" });
      await edit(slot, "Compact save before Escape");
      detail(slot).focus();
      press("Escape");
      const other = document.createElement("input");
      if (owner === "overlay") other.setAttribute("role", "dialog");
      document.body.append(other);
      other.focus();
      await act(async () => saved.resolve({ ok: true, task: tasks[0] }));
      const active = document.activeElement;
      other.remove();
      expect(active).toBe(other);
      expect(slot.queryByRole("region", { name: "Selected ticket" })).toBeTruthy();
      expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
    },
  );

  it("leaves newly acquired editor focus alone when native-pane Escape finishes", async () => {
    panelSize.width = 600;
    const saved = deferred<unknown>();
    const slot = setup("all?task=TSK-1", { updateTask: () => saved.promise });
    const title = await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Keep the mounted editor");
    detail(slot).focus();
    press("Escape");
    title.focus();
    await act(async () => saved.resolve({ ok: true, task: tasks[0] }));
    expect(document.activeElement).toBe(title);
    expect(document.activeElement?.closest("[hidden], [inert]")).toBeNull();
    expect(slot.container.contains(title)).toBe(true);
  });

  it("only arms focus for the latest accepted request in a shared save flight", async () => {
    const saved = deferred<unknown>();
    const slot = setup("all?task=TSK-1", { updateTask: () => saved.promise });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Save A first");
    row(slot, 2).focus();
    press("o");
    row(slot, 3).focus();
    press("o");
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
    await act(async () => saved.resolve({ ok: true, task: tasks[0] }));
    expect(slot.inspection.navigateCalls).toHaveLength(1);
    await acceptNavigation(slot);
    await waitFor(() => expect(document.activeElement).toBe(detail(slot)));
    expect(row(slot, 3).getAttribute("aria-current")).toBe("true");
    expect(
      slot.inspection.rpcCalls.filter((c) => c.method === "updateTask").map((c) => c.input),
    ).toEqual([{ taskId: tasks[0]!.id, description: "Save A first" }]);
  });

  it("does not navigate on an unsettled refresh or retained failed-removal snapshot", async () => {
    const refresh = deferred<unknown>();
    let response: unknown = { tasks, nextCursor: null };
    const slot = setup("all?task=TSK-1", {
      listTasks: (raw) => (rpcInput(raw).parentTaskId ? { tasks: [] } : response),
      updateTask: () => ({
        ok: false,
        error: { message: "Keep removed origin" },
      }),
    });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Retain A");
    response = refresh.promise;
    await slot.behavior.emitRealtime("tasks:changed", {});
    detail(slot).focus();
    press("j");
    press("]");
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect((slot.getByRole("button", { name: "Next task" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await act(async () => refresh.resolve({ tasks: tasks.slice(1), nextCursor: null }));
    await slot.findByRole("alert");
    const writes = slot.inspection.rpcCalls.filter((c) => c.method === "updateTask").length;
    press("j");
    press("]");
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
    expect(slot.inspection.rpcCalls.filter((c) => c.method === "updateTask")).toHaveLength(writes);
  });

  it("guards native-pane Escape with save failure and returns without scrolling after Retry", async () => {
    panelSize.width = 600;
    let canSave = false;
    const slot = setup("all?task=TSK-1", {
      updateTask: () =>
        canSave ? { ok: true, task: tasks[0] } : { ok: false, error: { message: "Back blocked" } },
    });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Keep A");
    const selected = slot.container.querySelector<HTMLElement>(
      '[data-nav-item][aria-current="true"]',
    )!;
    const focus = vi.spyOn(selected, "focus");
    detail(slot).focus();
    press("Escape");
    await slot.findByRole("alert");
    expect(slot.queryByRole("region", { name: "Ticket list" })).toBeTruthy();
    expect(document.activeElement).toBe(detail(slot));
    canSave = true;
    fireEvent.click(slot.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(document.activeElement).toBe(selected));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});

describe("browse shortcut guards and pane actions", () => {
  it.each(["metaKey", "ctrlKey", "altKey", "isComposing"])(
    "ignores all browse actions with %s",
    async (modifier) => {
      const slot = setup("all?task=TSK-1");
      await slot.findByRole("textbox", { name: "Task title" });
      detail(slot).focus();
      for (const key of [
        "j",
        "k",
        "ArrowDown",
        "ArrowUp",
        "o",
        "Enter",
        "Escape",
        "[",
        "]",
        "s",
        "p",
        "l",
        "d",
        "m",
        "c",
        "?",
      ])
        press(key, { [modifier]: true });
      expect(slot.inspection.navigateCalls).toEqual([]);
      expect(document.activeElement).toBe(detail(slot));
      expect(slot.queryByRole("menu")).toBeNull();
      expect(slot.queryByRole("dialog")).toBeNull();
    },
  );

  it.each(["input", "textarea", "select", "rich text child", "other pane"])(
    "preserves %s keys including Escape",
    async (kind) => {
      const slot = setup("all?task=TSK-1");
      const title = await slot.findByRole("textbox", { name: "Task title" });
      const field = document.createElement(
        ["input", "textarea", "select"].includes(kind) ? kind : "button",
      );
      let parent: HTMLElement = kind === "other pane" ? document.body : detail(slot);
      if (kind === "rich text child") {
        parent = document.createElement("div");
        parent.setAttribute("contenteditable", "true");
        detail(slot).append(parent);
      }
      parent.append(field);
      field.focus();
      for (const key of ["j", "k", "o", "Enter", "Escape", "[", "]", "s", "p", "l", "d", "m"])
        press(key);
      expect(slot.inspection.navigateCalls).toEqual([]);
      expect(document.activeElement).toBe(field);
      expect(slot.getByRole("textbox", { name: "Task title" })).toBe(title);
      field.remove();
      if (kind === "rich text child") parent.remove();
    },
  );

  it.each(["menu", "dialog", "alertdialog", "listbox"])(
    "leaves movement and Escape to an open %s",
    async (role) => {
      const slot = setup("all?task=TSK-1");
      await slot.findByRole("textbox", { name: "Task title" });
      detail(slot).focus();
      const overlay = document.createElement("div");
      overlay.setAttribute("role", role);
      document.body.append(overlay);
      for (const key of ["j", "Escape", "s", "m"]) press(key);
      expect(document.activeElement).toBe(detail(slot));
      expect(slot.inspection.navigateCalls).toEqual([]);
      overlay.remove();
    },
  );

  it("does not act on a different tab-focused row, and m/d stay detail-only without side effects", async () => {
    const slot = setup("all?task=TSK-1", {
      listPresets: () => ({
        presets: [{ id: "preset", name: "Astra", modelId: "model" }],
      }),
    });
    await slot.findByRole("textbox", { name: "Task title" });
    row(slot, 2).focus();
    for (const key of ["s", "p", "l", "d", "m"]) press(key);
    expect(slot.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(row(slot, 2));
    detail(slot).focus();
    await slot.findAllByRole("button", { name: "Astra" });
    press("d");
    const menu = await slot.findByRole("menu");
    expect(menu.textContent).toContain("Dispatch with preset");
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(slot.queryByRole("menu")).toBeNull());
    detail(slot).focus();
    press("m");
    const activity = slot.getByRole("region", { name: "Activity" });
    await waitFor(() => expect(activity.contains(document.activeElement)).toBe(true));
    expect(
      slot.inspection.rpcCalls.some((c) =>
        ["delegate", "createComment", "updateTask"].includes(c.method),
      ),
    ).toBe(false);
  });

  it("returns to the same row on repeated Enter/Escape and after help dismissal", async () => {
    const slot = setup("all?task=TSK-1");
    await slot.findByRole("textbox", { name: "Task title" });
    row(slot, 1).focus();
    for (let n = 0; n < 2; n++) {
      press("Enter");
      expect(document.activeElement).toBe(detail(slot));
      press("Escape");
      expect(document.activeElement).toBe(row(slot, 1));
    }
    press("?");
    const help = await slot.findByRole("dialog");
    fireEvent.keyDown(help, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(row(slot, 1)));
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
    expect(slot.inspection.navigateCalls).toEqual([]);
  });
});
