// @vitest-environment jsdom
import { act, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { rpcInput } from "../test-fixtures.js";
import {
  loadExpandedTasks,
  storeExpandedTasks,
} from "../views/list/expanded-tasks.js";
import {
  acceptNavigation,
  deferred,
  edit,
  project,
  panelSize,
  select,
  row,
  setup,
  tasks,
  useWorkspaceTestLifecycle,
} from "./browse-workspace.test-support.js";

useWorkspaceTestLifecycle();
const prompt = "Select a ticket to view and edit";

describe("removal combined with context transitions", () => {
  it("reconciles absent selection after another parent's accepted collapse replaces a failed removal request", async () => {
    const parent = tasks[1]!;
    const child = { ...tasks[2]!, parentTaskId: parent.id };
    storeExpandedTasks("all", new Set([parent.id]), new Set([parent.id]));
    let removed = false;
    let canSave = false;
    let saves = 0;
    const slot = setup("all?task=TSK-1", {
      listTasks: (raw) => ({
        tasks: rpcInput(raw).parentTaskId
          ? []
          : removed
            ? [parent, child]
            : [tasks[0], parent, child],
        nextCursor: null,
      }),
      updateTask: () => {
        saves++;
        return canSave
          ? { ok: true, task: tasks[0] }
          : { ok: false, error: { message: "Retain origin" } };
      },
    });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Origin draft");
    removed = true;
    await slot.behavior.emitRealtime("tasks:changed", {});
    await slot.findByRole("alert");
    canSave = true;
    fireEvent.click(
      slot.getByRole("button", { name: "Collapse subtasks of TSK-2" }),
    );
    await waitFor(() => expect(slot.inspection.navigateCalls).toHaveLength(1));
    expect(saves).toBe(2);
    expect(loadExpandedTasks("all").has(parent.id)).toBe(false);
    expect(slot.inspection.navigateCalls[0]).toMatchObject({
      options: { subPath: "all", replace: true },
    });
    await acceptNavigation(slot);
    expect(slot.getByText(prompt)).toBeTruthy();
    expect(
      slot.queryByRole("button", { name: "Open TSK-1: Title 1" }),
    ).toBeNull();
    expect(
      slot.queryByRole("button", { name: "Open TSK-3: Title 3" }),
    ).toBeNull();
  });

  it("preserves the latest explicit selection over removal and pending collapse", async () => {
    const parent = tasks[1]!;
    const child = { ...tasks[2]!, parentTaskId: parent.id };
    storeExpandedTasks("all", new Set([parent.id]), new Set([parent.id]));
    let removed = false;
    const saved = deferred<unknown>();
    const slot = setup("all?task=TSK-1", {
      listTasks: (raw) => ({
        tasks: rpcInput(raw).parentTaskId
          ? []
          : removed
            ? [parent, child]
            : [tasks[0], parent, child],
        nextCursor: null,
      }),
      updateTask: () => saved.promise,
    });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Origin draft");
    removed = true;
    await slot.behavior.emitRealtime("tasks:changed", {});
    fireEvent.click(
      slot.getByRole("button", { name: "Collapse subtasks of TSK-2" }),
    );
    fireEvent.click(row(slot, 2));
    await act(async () => saved.resolve({ ok: true, task: tasks[0] }));
    expect(slot.inspection.navigateCalls).toHaveLength(1);
    expect(slot.inspection.navigateCalls[0]).toMatchObject({
      options: { subPath: "all?task=TSK-2" },
    });
    await acceptNavigation(slot);
    expect(row(slot, 2).getAttribute("aria-current")).toBe("true");
    expect(loadExpandedTasks("all").has(parent.id)).toBe(true);
  });

  it("keeps a pending last-project removal from clearing against newer loading inventory", async () => {
    let response: unknown = { projects: [project] };
    const saved = deferred<unknown>();
    const slot = setup("all?task=TSK-1", {
      listProjects: () => response,
      updateTask: () => saved.promise,
    });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Keep origin through inventory reload");
    response = { projects: [] };
    await slot.behavior.emitRealtime("projects:changed", {});
    const currentInventory = deferred<unknown>();
    response = currentInventory.promise;
    await slot.behavior.emitRealtime("projects:changed", {});
    await act(async () => saved.resolve({ ok: true, task: tasks[0] }));
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(slot.queryByText("No projects yet")).toBeNull();
    await act(async () => currentInventory.resolve({ projects: [project] }));
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
  });
  it("keeps failed removal and Escape retry accessible, then reconciles without losing native-pane context or comment ownership", async () => {
    panelSize.width = 600;
    let removed = false;
    let canSave = false;
    const writes: Record<string, unknown>[] = [];
    const slot = setup("all", {
      listTasks: (raw) => ({
        tasks: rpcInput(raw).parentTaskId
          ? []
          : removed
            ? tasks.slice(1)
            : tasks,
        nextCursor: null,
      }),
      updateTask: (raw) => {
        const input = rpcInput(raw);
        writes.push(input);
        return canSave
          ? { ok: true, task: { ...tasks[0], ...input } }
          : { ok: false, error: { message: "Save before Back and removal" } };
      },
    });
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    const list = slot.getByRole("region", { name: "Ticket list" });
    const scroll = list.querySelector<HTMLElement>("[data-list-scroll]")!;
    Object.defineProperty(scroll, "scrollHeight", { value: 1400 });
    Object.defineProperty(scroll, "clientHeight", { value: 500 });
    scroll.scrollTop = 170;
    fireEvent.scroll(scroll);
    await select(slot, 1);
    const title = slot.getByRole("textbox", { name: "Task title" });
    await edit(slot, "Origin description");
    await edit(slot, "Unsent origin comment", 1);
    fireEvent.change(
      slot.container.querySelectorAll('input[type="file"]')[1]!,
      { target: { files: [new File(["origin"], "origin.txt")] } },
    );
    removed = true;
    await slot.behavior.emitRealtime("tasks:changed", {});
    await slot.findByRole("alert");
    slot.getByRole("region", { name: "Selected ticket" }).focus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(slot.getByRole("textbox", { name: "Task title" })).toBe(title);
    expect(slot.getByRole("button", { name: "Retry save" })).toBeTruthy();
    expect(slot.queryByRole("region", { name: "Ticket list" })).toBeTruthy();
    expect(slot.container.querySelector(".tiptap")?.textContent).toBe(
      "Origin description",
    );
    expect(list.querySelector('[aria-current="true"]')).toBeTruthy();
    expect(slot.inspection.navigateCalls).toHaveLength(1);
    canSave = true;
    fireEvent.click(slot.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(slot.inspection.navigateCalls).toHaveLength(2));
    expect(writes).toHaveLength(3);
    expect(
      writes.every(
        (input) =>
          input.taskId === tasks[0]!.id &&
          input.description === "Origin description",
      ),
    ).toBe(true);
    await acceptNavigation(slot);
    expect(slot.getByRole("region", { name: "Ticket list" })).toBe(list);
    expect(scroll.scrollTop).toBe(170);
    expect(slot.container.querySelector('[aria-current="true"]')).toBeNull();
    expect(
      slot.queryByRole("button", { name: "Open TSK-1: Title 1" }),
    ).toBeNull();
    await select(slot, 2);
    expect(slot.container.textContent).not.toContain("Unsent origin comment");
    expect(slot.queryByText("origin.txt")).toBeNull();
    slot.getByRole("region", { name: "Selected ticket" }).focus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    removed = false;
    await slot.behavior.emitRealtime("tasks:changed", {});
    await select(slot, 1);
    expect(slot.getByText("origin.txt")).toBeTruthy();
    expect(slot.container.querySelectorAll(".tiptap")[1]?.textContent).toBe(
      "Unsent origin comment",
    );
    expect(
      slot.inspection.rpcCalls.filter((c) =>
        ["createComment", "delegate", "createAttachment"].includes(c.method),
      ),
    ).toEqual([]);
  });

  it.each(["all", "active", `${project.id}?view=list`])(
    "guards last-project removal in %s through failed save and retry",
    async (scope) => {
      let removed = false;
      let canSave = false;
      let saves = 0;
      const slot = setup(
        `${scope}${scope.includes("?") ? "&" : "?"}task=TSK-1`,
        {
          listProjects: () => ({ projects: removed ? [] : [project] }),
          updateTask: () => {
            saves++;
            return canSave
              ? { ok: true, task: tasks[0] }
              : { ok: false, error: { message: "Save before no projects" } };
          },
        },
      );
      await slot.findByRole("textbox", { name: "Task title" });
      await edit(slot, "Draft in last project");
      removed = true;
      await slot.behavior.emitRealtime("projects:changed", {});
      expect(slot.queryByText("No projects yet")).toBeNull();
      expect((await slot.findByRole("alert")).textContent).toContain(
        "Save before no projects",
      );
      expect(
        slot.getByRole("textbox", { name: "Task title" }).textContent,
      ).toBe("Title 1");
      expect(slot.container.querySelector(".tiptap")?.textContent).toBe(
        "Draft in last project",
      );
      expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
      expect(slot.inspection.navigateCalls).toEqual([]);
      canSave = true;
      fireEvent.click(slot.getByRole("button", { name: "Retry save" }));
      await waitFor(() =>
        expect(slot.inspection.navigateCalls).toHaveLength(1),
      );
      expect(saves).toBe(2);
      expect(slot.inspection.navigateCalls[0]).toMatchObject({
        options: { subPath: scope, replace: true },
      });
      await acceptNavigation(slot);
      expect(slot.getByText("No projects yet")).toBeTruthy();
      expect(slot.queryByRole("textbox", { name: "Task title" })).toBeNull();
    },
  );
});
