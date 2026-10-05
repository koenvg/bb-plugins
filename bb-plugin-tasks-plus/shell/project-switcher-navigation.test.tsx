// @vitest-environment jsdom
import { act, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TASKS_COMMANDS } from "./commands.js";
import { browsePreference } from "./browse-preference.js";
import { storeViewMode } from "./view-preference.js";
import {
  acceptNavigation,
  deferred,
  edit,
  panelSize,
  project,
  setup,
  tasks,
  useWorkspaceTestLifecycle,
} from "./browse-workspace.test-support.js";

useWorkspaceTestLifecycle();
const other = {
  ...project,
  id: "01HZZZZZZZZZZZZZZZZZZZZZP2",
  name: "Support",
  prefix: "SUP",
};
const listProjects = () => ({ projects: [project, other] });
function openPicker() {
  act(
    () =>
      void TASKS_COMMANDS.find((command) => command.id === "switch-project")!.run({
        threadId: null,
        projectId: null,
        openPanel: () => false,
      }),
  );
}

describe("project picker shell navigation", () => {
  it.each([1000, 320])(
    "keeps the board route on opening and uses destination preference at width %s",
    async (width) => {
      panelSize.width = width;
      storeViewMode(project.id, "board");
      storeViewMode(other.id, "board");
      const slot = setup(
        `${project.id}?view=board`,
        {
          listProjects,
          listTasks: () => ({ tasks: [], nextCursor: null }),
        },
        { nativeTab: false },
      );
      await slot.findByRole("button", { name: "Project: Tasks Plugin" });
      openPicker();
      const input = await slot.findByRole("combobox", {
        name: "Search projects",
      });
      expect(slot.inspection.navigateCalls).toEqual([]);
      fireEvent.change(input, { target: { value: "SUP" } });
      await waitFor(() => expect(slot.getAllByRole("option")).toHaveLength(1));
      fireEvent.keyDown(input, { key: "Enter" });
      expect(slot.inspection.navigateCalls).toEqual([
        {
          method: "toPluginPanel",
          path: "tasks",
          options: { subPath: other.id },
        },
      ]);
      await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
      await acceptNavigation(slot);
      await slot.findByRole("button", { name: "Project: Support" });
      expect(browsePreference().load()).toEqual({
        kind: "project",
        projectId: other.id,
      });
      expect(slot.container.textContent).toContain(width < 448 ? "No tasks" : "Todo");
    },
  );

  it("cancels without changing scope or routing and adds no Shift+P board shortcut", async () => {
    const slot = setup(project.id, { listProjects }, { nativeTab: false });
    const trigger = await slot.findByRole("button", {
      name: "Project: Tasks Plugin",
    });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "P", shiftKey: true });
    expect(slot.queryByRole("dialog")).toBeNull();
    openPicker();
    const input = await slot.findByRole("combobox");
    fireEvent.change(input, { target: { value: "SUP" } });
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(browsePreference().load()).toEqual({
      kind: "project",
      projectId: project.id,
    });
    expect(slot.container.contains(document.activeElement)).toBe(true);
  });

  it("keeps the draft and scope through a failed save and retries the selected project", async () => {
    const pending = deferred<unknown>();
    let writes = 0;
    const slot = setup(`${project.id}?view=list&task=TSK-1`, {
      listProjects,
      listTasks: (raw) => ({
        tasks: (raw as { projectId?: string }).projectId === other.id ? [] : tasks,
        nextCursor: null,
      }),
      updateTask: () => (++writes === 1 ? pending.promise : { ok: true, task: tasks[0] }),
    });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Unsaved project switch draft");
    openPicker();
    const input = await slot.findByRole("combobox");
    fireEvent.change(input, { target: { value: "SUP" } });
    await waitFor(() => expect(slot.getAllByRole("option")).toHaveLength(1));
    fireEvent.click(slot.getByRole("option"));
    await waitFor(() => expect(writes).toBe(1));
    await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(browsePreference().load()).toEqual({
      kind: "project",
      projectId: project.id,
    });
    await act(async () => pending.resolve({ ok: false, error: { message: "Save refused" } }));
    expect((await slot.findByRole("alert")).textContent).toContain("Save refused");
    expect(slot.container.querySelector(".tiptap")?.textContent).toBe(
      "Unsaved project switch draft",
    );
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 1");
    expect(browsePreference().load()).toEqual({
      kind: "project",
      projectId: project.id,
    });
    fireEvent.click(slot.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(slot.inspection.navigateCalls).toHaveLength(1));
    expect(slot.inspection.navigateCalls[0]).toEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: other.id },
    });
    await acceptNavigation(slot);
    await slot.findByRole("button", { name: "Project: Support" });
    expect(browsePreference().load()).toEqual({
      kind: "project",
      projectId: other.id,
    });
    expect(slot.queryByRole("textbox", { name: "Task title" })).toBeNull();
  });
});
