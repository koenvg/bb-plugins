// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeTask, rpcInput } from "../../test-fixtures.js";
import type { Task } from "../../shared/contract.js";

if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
Element.prototype.scrollIntoView ??= () => {};

const app = await loadPluginApp(() => import("../../app"));

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

const PROJECT_ID = "01HZZZZZZZZZZZZZZZZZZZZZP1";
const project = {
  id: PROJECT_ID,
  name: "Tasks Plugin",
  prefix: "TSK",
  nextTaskNumber: 9,
  color: "blue",
  folderId: null,
  linkedBbProjectId: null,
  createdAt: "2026-07-15T00:00:00.000Z",
};

function task(number: number, status: Task["status"]): Task {
  return makeTask({
    id: `01HZZZZZZZZZZZZZZZZZZZZZT${number}`,
    projectId: PROJECT_ID,
    number,
    key: `TSK-${number}`,
    title: `Title ${number}`,
    position: number,
    status,
  });
}

const TASKS = [
  task(1, "todo"),
  task(2, "todo"),
  task(3, "in_progress"),
  task(5, "done"),
];

function render(calls: { method: string; input: unknown }[] = []) {
  return renderSlot(
    app.navPanels[0]!,
    { subPath: `${PROJECT_ID}?view=board` },
    {
      rpc: {
        listProjects: () => ({ projects: [project] }),
        listFolders: () => ({ folders: [] }),
        listPresets: () => ({ presets: [] }),
        sidebarSummary: () => ({ projects: [] }),
        listLabels: () => ({ labels: [] }),
        listTasks: (raw) => ({
          tasks: rpcInput(raw).activeOnly ? [] : TASKS,
          nextCursor: null,
        }),
        listAttachments: () => ({ attachments: [] }),
        getTaskByKey: () => ({ task: null }),
        boardMove: (input) => {
          calls.push({ method: "boardMove", input });
          return { ok: true };
        },
        updateTask: (input) => {
          calls.push({ method: "updateTask", input });
          return { ok: true, task: TASKS[0] };
        },
      },
    },
  );
}

function focusedCard() {
  return document.activeElement?.getAttribute("aria-label");
}

function press(key: string) {
  fireEvent.keyDown(document.activeElement ?? window, { key });
}

describe("board cards", () => {
  it("are focusable buttons that open their task on Enter and Space", async () => {
    const slot = render();
    const card = await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    expect(card.tabIndex).toBe(0);
    card.focus();
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(
      slot.navigateCalls.filter(
        (call) =>
          "options" in call &&
          (call.options as { subPath?: string }).subPath === "task/TSK-1",
      ),
    ).toHaveLength(2);
  });
});

describe("board keyboard navigation", () => {
  it("focuses the first card on the first press", async () => {
    const slot = render();
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    press("j");
    expect(focusedCard()).toBe("Open TSK-1: Title 1");
  });

  it("moves within a column with j/k and arrows", async () => {
    const slot = render();
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    press("j");
    press("j");
    expect(focusedCard()).toBe("Open TSK-2: Title 2");
    press("ArrowDown");
    expect(focusedCard()).toBe("Open TSK-2: Title 2");
    press("k");
    press("ArrowUp");
    expect(focusedCard()).toBe("Open TSK-1: Title 1");
  });

  it("moves to the same row or the last card of the next non-empty column", async () => {
    const slot = render();
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    press("j");
    press("j");
    press("l");
    expect(focusedCard()).toBe("Open TSK-3: Title 3");
    press("ArrowRight");
    expect(focusedCard()).toBe("Open TSK-5: Title 5");
    press("ArrowRight");
    expect(focusedCard()).toBe("Open TSK-5: Title 5");
    press("h");
    press("ArrowLeft");
    expect(focusedCard()).toBe("Open TSK-1: Title 1");
  });

  it("opens the focused card on o", async () => {
    const slot = render();
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    press("j");
    press("o");
    expect(slot.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: "task/TSK-1" },
    });
  });
});

describe("board card menus from the keyboard", () => {
  it("moves the focused card to the picked status from the s menu", async () => {
    const calls: { method: string; input: unknown }[] = [];
    const slot = render(calls);
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    press("j");
    press("s");
    const menu = await slot.findByRole("menu");
    fireEvent.click(
      [...menu.querySelectorAll('[role="menuitem"]')].find((item) =>
        item.textContent?.includes("In Review"),
      )!,
    );
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "boardMove",
        input: expect.objectContaining({
          taskId: TASKS[0]!.id,
          status: "in_review",
        }),
      }),
    );
    expect(slot.navigateCalls).toEqual([]);
    await waitFor(() => expect(focusedCard()).toBe("Open TSK-1: Title 1"));
  });

  it("sets priority from the p menu and returns focus to the card", async () => {
    const calls: { method: string; input: unknown }[] = [];
    const slot = render(calls);
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    press("j");
    press("p");
    const menu = await slot.findByRole("menu");
    expect(menu.textContent).toContain("Set priority");
    fireEvent.click(
      [...menu.querySelectorAll('[role="menuitem"]')].find((item) =>
        item.textContent?.includes("Urgent"),
      )!,
    );
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "updateTask",
        input: { taskId: TASKS[0]!.id, priority: "urgent" },
      }),
    );
    await waitFor(() => expect(slot.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(focusedCard()).toBe("Open TSK-1: Title 1"));
  });
});
