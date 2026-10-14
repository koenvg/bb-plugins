// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeTask, rpcInput } from "../../test-fixtures.js";
import type { Attachment, Label, Task } from "../../shared/contract.js";

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
window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};

const app = await loadPluginApp(() => import("../../app"));

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
const label = {
  id: "01HZZZZZZZZZZZZZZZZZZZZZL1",
  projectId: PROJECT_ID,
  name: "frontend",
  color: "#00f",
  createdAt: "2026-07-15T00:00:00.000Z",
} as Label;
const preset = {
  id: "01HZZZZZZZZZZZZZZZZZZZZZE1",
  name: "Default env",
  providerId: "claude-code",
  modelId: "claude-sonnet-5",
  reasoningLevel: "medium",
  serviceTier: null,
  permissionMode: "accept-edits",
  environmentKind: "project-default",
  baseBranch: null,
  machineId: null,
  instructions: "",
  builtin: false,
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

const TASKS = [task(1, "todo"), task(2, "todo"), task(3, "in_progress")];

function render(
  taskKey: string,
  {
    presets = [preset],
    calls = [] as string[],
    attachments = [] as Attachment[],
    update = () => ({ ok: true, task: TASKS[0] }) as unknown,
    delegate = () => ({ ok: true }) as unknown,
  } = {},
) {
  return renderSlot(
    app.navPanels[0]!,
    { subPath: `task/${taskKey}` },
    {
      rpc: {
        listProjects: () => ({ projects: [project] }),
        listFolders: () => ({ folders: [] }),
        listPresets: () => ({ presets }),
        sidebarSummary: () => ({ projects: [] }),
        listLabels: () => ({ labels: [label] }),
        listTasks: (raw) => {
          const input = rpcInput(raw);
          return {
            tasks: TASKS.filter(
              (entry) =>
                input.parentTaskId === undefined || entry.parentTaskId === input.parentTaskId,
            ),
            nextCursor: null,
          };
        },
        getTaskByKey: (raw) => ({
          task: TASKS.find((entry) => entry.key === rpcInput(raw).taskKey) ?? null,
        }),
        getTask: () => ({ task: null }),
        listAttachments: () => ({ attachments }),
        updateTask: () => {
          calls.push("updateTask");
          return update();
        },
        listTaskThreads: () => ({ taskThreads: [] }),
        listTaskPullRequests: () => ({
          pullRequests: [],
          unavailableThreadIds: [],
        }),
        listBbProjects: () => ({ bbProjects: [] }),
        delegate: () => {
          calls.push("delegate");
          return delegate();
        },
      },
    },
  );
}

async function ready(slot: ReturnType<typeof render>, position: string) {
  await slot.findByText(position);
}

describe("task detail pager keys", () => {
  it("opens the next task on ]", async () => {
    const slot = render("TSK-1");
    await ready(slot, "1 / 3");
    fireEvent.keyDown(window, { key: "]" });
    expect(slot.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: "task/TSK-2" },
    });
  });

  it("opens the previous task on [", async () => {
    const slot = render("TSK-2");
    await ready(slot, "2 / 3");
    fireEvent.keyDown(window, { key: "[" });
    expect(slot.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: "task/TSK-1" },
    });
  });

  it("stays on the last task on ] and on the first task on [", async () => {
    const last = render("TSK-3");
    await ready(last, "3 / 3");
    fireEvent.keyDown(window, { key: "]" });
    expect(last.navigateCalls).toEqual([]);
    cleanup();

    const first = render("TSK-1");
    await ready(first, "1 / 3");
    fireEvent.keyDown(window, { key: "[" });
    expect(first.navigateCalls).toEqual([]);
  });
});

describe("task detail property keys", () => {
  it("opens one status menu on s", async () => {
    const slot = render("TSK-1");
    await ready(slot, "1 / 3");
    fireEvent.keyDown(window, { key: "s" });
    const menus = await slot.findAllByRole("menu");
    expect(menus).toHaveLength(1);
    expect(menus[0]!.textContent).toContain("In Review");
  });

  it("opens one priority menu on p", async () => {
    const slot = render("TSK-1");
    await ready(slot, "1 / 3");
    fireEvent.keyDown(window, { key: "p" });
    const menus = await slot.findAllByRole("menu");
    expect(menus).toHaveLength(1);
    expect(menus[0]!.textContent).toContain("Urgent");
  });

  it("opens the labels picker on l", async () => {
    const slot = render("TSK-1");
    await ready(slot, "1 / 3");
    fireEvent.keyDown(window, { key: "l" });
    expect(await slot.findByRole("option", { name: "frontend" })).toBeDefined();
  });

  it("opens the dispatch preset menu on d without dispatching", async () => {
    const calls: string[] = [];
    const slot = render("TSK-1", { calls });
    await ready(slot, "1 / 3");
    await waitFor(() => expect(slot.getAllByText("Default env").length).toBeGreaterThan(0));
    fireEvent.keyDown(window, { key: "d" });
    const menu = await slot.findByRole("menu");
    expect(menu.textContent).toContain("Dispatch with preset");
    expect(calls).toEqual([]);
  });

  it("does not open the preset menu later when d was pressed during a dispatch", async () => {
    let finish: (value: unknown) => void = () => {};
    const slot = render("TSK-1", {
      delegate: () => new Promise((resolve) => (finish = resolve)),
    });
    await ready(slot, "1 / 3");
    const [dispatchButton] = await slot.findAllByRole("button", {
      name: "Default env",
    });
    fireEvent.click(dispatchButton!);
    await slot.findAllByText("Dispatching…");
    fireEvent.keyDown(window, { key: "d" });
    finish({ ok: true });
    await waitFor(() => expect(slot.queryAllByText("Dispatching…")).toHaveLength(0));
    expect(slot.queryByRole("menu")).toBeNull();
  });

  it("ignores d when there are no presets", async () => {
    const slot = render("TSK-1", { presets: [] });
    await ready(slot, "1 / 3");
    await slot.findAllByText("Add a preset…");
    fireEvent.keyDown(window, { key: "d" });
    expect(slot.queryByRole("menu")).toBeNull();
  });
});

describe("task detail comment key", () => {
  it("leaves m inactive and protects description typing", async () => {
    const slot = render("TSK-1");
    await ready(slot, "1 / 3");
    const focus = document.activeElement;
    fireEvent.keyDown(window, { key: "m" });
    expect(document.activeElement).toBe(focus);
    expect(slot.queryByRole("region", { name: "Activity" })).toBeNull();
    const description = slot.container.querySelector<HTMLElement>(
      '.tiptap[contenteditable="true"]',
    )!;
    description.focus();
    fireEvent.keyDown(description, { key: "c" });
    expect(slot.queryByRole("dialog")).toBeNull();
  });
});

describe("Markdown dialog in the full Tasks app", () => {
  it.each([false, true])(
    "preserves editor, draft, route, scroll and workflow with isolated keys, compact=%s",
    async (compact) => {
      const nativeMedia = window.matchMedia;
      vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
        ...nativeMedia(query),
        matches: compact && query.includes("max-width: 767px"),
      }));
      const attachment: Attachment = {
        id: "attachment-generic",
        taskId: TASKS[0]!.id,
        fileName: "investigation.MD",
        mime: "application/octet-stream",
        sizeBytes: 14,
        isImage: false,
        createdAt: "2026-07-20T00:00:00.000Z",
      };
      const fetch = vi.fn(async () =>
        Response.json({
          attachmentId: attachment.id,
          fileName: attachment.fileName,
          byteSize: 14,
          text: "# Investigation".slice(0, 14),
        }),
      );
      vi.stubGlobal("fetch", fetch);
      const calls: string[] = [];
      const slot = render("TSK-1", {
        attachments: [attachment],
        calls,
        update: () => new Promise(() => {}),
      });
      await ready(slot, "1 / 3");
      const description = slot.container.querySelector<HTMLElement>(
        '.tiptap[contenteditable="true"]',
      )!;
      await act(async () => {
        description.innerHTML = "<p>Unfinished task draft</p>";
        fireEvent.input(description);
      });
      await waitFor(() => expect(calls).toEqual(["updateTask"]));
      const scroll = description.closest<HTMLElement>(
        '[class*="overflow-y-auto"], [class*="overflow-auto"]',
      )!;
      if (!scroll) throw new Error("Task scroll region is missing");
      scroll.scrollTop = 170;
      const trigger = await slot.findByRole("button", { name: "investigation.MD" });
      trigger.focus();
      fireEvent.click(trigger);
      const dialog = await slot.findByRole("dialog", { name: "investigation.MD" });
      await slot.findByRole("heading", { name: "Investigatio", level: 1 });
      for (const key of ["]", "[", "s", "p", "l", "d", "m"]) fireEvent.keyDown(dialog, { key });
      fireEvent.click(slot.getByRole("button", { name: "Raw" }));
      expect(slot.getByLabelText("Raw source").textContent).toBe("# Investigatio");
      fireEvent.click(slot.getByRole("button", { name: "Preview" }));
      fireEvent.keyDown(dialog, { key: "Escape" });
      await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(trigger));
      expect(slot.container.querySelector('.tiptap[contenteditable="true"]')).toBe(description);
      expect(description.textContent).toBe("Unfinished task draft");
      expect(scroll.scrollTop).toBe(170);
      expect(slot.navigateCalls).toEqual([]);
      expect(calls).toEqual(["updateTask"]);
      expect(fetch.mock.calls.length).toBe(1);
      expect(slot.getByText("1 / 3").textContent).toBe("1 / 3");
      fireEvent.keyDown(window, { key: "s" });
      const statusOption = await slot.findByText("In Review");
      expect(statusOption.closest('[hidden], [inert], [aria-hidden="true"]')).toBeNull();
    },
  );
});
