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
