// @vitest-environment jsdom
import { fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeTask, rpcInput } from "../../test-fixtures.js";
import {
  acceptNavigation,
  project,
  row,
  setup,
  tasks,
  useWorkspaceTestLifecycle,
} from "../../shell/browse-workspace.test-support.js";

useWorkspaceTestLifecycle();
const child = makeTask({
  ...tasks[0]!,
  id: "child",
  key: "TSK-4",
  number: 4,
  title: "Title 4",
  parentTaskId: tasks[0]!.id,
});
const records = [...tasks, child];
const label = {
  id: "label",
  projectId: project.id,
  name: "frontend",
  color: "#00f",
  createdAt: project.createdAt,
};
function render(updates: Record<string, unknown>[] = []) {
  return setup(`${project.id}?view=list`, {
    listLabels: () => ({ labels: [label] }),
    listTasks: (raw) => ({
      tasks: rpcInput(raw).parentTaskId ? [] : records,
      nextCursor: null,
    }),
    getTaskByKey: (raw) => ({
      task: records.find((t) => t.key === rpcInput(raw).taskKey),
    }),
    updateTask: (raw) => {
      const input = rpcInput(raw);
      updates.push(input);
      return {
        ok: true,
        task: { ...records.find((t) => t.id === input.taskId), ...input },
      };
    },
  });
}
const focusedRowName = () => document.activeElement?.getAttribute("aria-label");
async function press(slot: ReturnType<typeof setup>, key: string) {
  const before = slot.inspection.navigateCalls.length;
  fireEvent.keyDown(document.activeElement ?? window, { key });
  if (slot.inspection.navigateCalls.length > before) await acceptNavigation(slot);
}

describe("list keyboard navigation", () => {
  it("selects and focuses the first row on the first press", async () => {
    const slot = render();
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    await press(slot, "j");
    expect(focusedRowName()).toBe("Open TSK-1: Title 1");
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
  });
  it("moves through visible rows with j/k and arrows, including expanded subtasks", async () => {
    const slot = render();
    fireEvent.click(await slot.findByRole("button", { name: "Expand subtasks of TSK-1" }));
    await slot.findByRole("button", { name: "Open TSK-4: Title 4" });
    await press(slot, "j");
    await press(slot, "j");
    expect(focusedRowName()).toBe("Open TSK-4: Title 4");
    await press(slot, "ArrowDown");
    expect(focusedRowName()).toBe("Open TSK-2: Title 2");
    await press(slot, "k");
    await press(slot, "ArrowUp");
    expect(focusedRowName()).toBe("Open TSK-1: Title 1");
  });
  it("keeps focus on the first and last rows at the list ends", async () => {
    const slot = render();
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    await press(slot, "j");
    await press(slot, "k");
    expect(focusedRowName()).toBe("Open TSK-1: Title 1");
    await press(slot, "j");
    await press(slot, "j");
    await press(slot, "j");
    expect(focusedRowName()).toBe("Open TSK-3: Title 3");
  });
  it("does not treat a focused row control as an independent selection", async () => {
    const slot = render();
    (await slot.findByRole("button", { name: "Expand subtasks of TSK-1" })).focus();
    await press(slot, "j");
    expect(focusedRowName()).toBe("Open TSK-1: Title 1");
  });
  it.each(["o", "Enter"])(
    "focuses the selected task's preview with %s without replacing the list",
    async (key) => {
      const slot = render();
      await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
      await press(slot, "j");
      await press(slot, "j");
      await press(slot, key);
      await waitFor(() =>
        expect(document.activeElement).toBe(slot.getByRole("region", { name: "Selected ticket" })),
      );
      expect(row(slot, 2).getAttribute("aria-current")).toBe("true");
      expect(slot.inspection.navigateCalls).toHaveLength(2);
    },
  );
  it("leaves Enter alone when no row has focus", async () => {
    const slot = render();
    const button = await slot.findByRole("button", { name: /new task/i });
    button.focus();
    expect(fireEvent.keyDown(button, { key: "Enter" })).toBe(true);
    expect(slot.inspection.navigateCalls).toEqual([]);
  });
});

describe("list row menus from the keyboard", () => {
  it("opens the status menu on s and returns focus to the row on Escape", async () => {
    const slot = render();
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    await press(slot, "j");
    await press(slot, "s");
    const menu = await slot.findByRole("menu");
    expect(menu.textContent).toContain("Change status");
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(slot.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(focusedRowName()).toBe("Open TSK-1: Title 1"));
  });
  it("opens the priority menu on p", async () => {
    const slot = render();
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    await press(slot, "j");
    await press(slot, "p");
    expect((await slot.findByRole("menu")).textContent).toContain("Set priority");
  });
  it("opens the labels menu on l and saves a toggled label", async () => {
    const updates: Record<string, unknown>[] = [];
    const slot = render(updates);
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    await press(slot, "j");
    await press(slot, "l");
    fireEvent.click(await slot.findByRole("option", { name: "frontend" }));
    await waitFor(() =>
      expect(updates).toContainEqual({
        taskId: tasks[0]!.id,
        labelIds: [label.id],
      }),
    );
    fireEvent.keyDown(slot.getByRole("listbox"), { key: "Escape" });
    await waitFor(() => expect(slot.queryByRole("listbox")).toBeNull());
    await waitFor(() => expect(focusedRowName()).toBe("Open TSK-1: Title 1"));
    expect(slot.container.querySelector('[data-task-key="TSK-1"]')!.textContent).not.toContain(
      label.name,
    );
  });
});
