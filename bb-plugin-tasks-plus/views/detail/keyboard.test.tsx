// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeAttachment, makeTask, rpcInput } from "../../test-fixtures.js";
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
    update = (_input: Record<string, unknown>) => ({ ok: true, task: TASKS[0] }) as unknown,
    delegate = () => ({ ok: true }) as unknown,
    remove = (_input: Record<string, unknown>) => ({ ok: true, deleted: true }) as unknown,
    lookup = (key: unknown) => TASKS.find((entry) => entry.key === key) ?? null,
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
          task: lookup(rpcInput(raw).taskKey),
        }),
        getTask: () => ({ task: null }),
        listAttachments: () => ({ attachments }),
        updateTask: (raw) => {
          calls.push("updateTask");
          return update(rpcInput(raw));
        },
        deleteAttachment: (raw) => remove(rpcInput(raw)),
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
    "preserves editor, title and description edits, route, scroll and workflow with isolated keys, compact=%s",
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
      const updates: Record<string, unknown>[] = [];
      let saved = { ...TASKS[0]! };
      let finishSave!: () => void;
      const saveGate = new Promise<void>((resolve) => {
        finishSave = resolve;
      });
      const slot = render("TSK-1", {
        attachments: [attachment],
        calls,
        lookup: () => saved,
        update: async (input) => {
          updates.push(input);
          await saveGate;
          saved = { ...saved, ...input };
          return { ok: true, task: saved };
        },
      });
      await ready(slot, "1 / 3");
      const description = slot.container.querySelector<HTMLElement>(
        '.tiptap[contenteditable="true"]',
      )!;
      const title = slot.getByRole("textbox", { name: "Task title" });
      const status = slot.getAllByRole("button", { name: "Todo" });
      const priority = slot.getAllByRole("button", { name: "No priority" });
      title.textContent = "Edited investigation title";
      fireEvent.input(title);
      await act(async () => {
        description.innerHTML = "<p>Unfinished task draft</p>";
        fireEvent.input(description);
      });
      await waitFor(() => {
        expect(updates).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ taskId: TASKS[0]!.id, title: "Edited investigation title" }),
            expect.objectContaining({ taskId: TASKS[0]!.id, description: "Unfinished task draft" }),
          ]),
        );
      });
      const scroll = description.closest<HTMLElement>(
        '[class*="overflow-y-auto"], [class*="overflow-auto"]',
      )!;
      if (!scroll) throw new Error("Task scroll region is missing");
      scroll.scrollTop = 170;
      const expectTaskUnchanged = () => {
        expect(slot.container.querySelector('.tiptap[contenteditable="true"]')).toBe(description);
        expect(slot.container.querySelector('[aria-label="Task title"]')).toBe(title);
        expect(title.textContent).toBe("Edited investigation title");
        expect(description.textContent).toBe("Unfinished task draft");
        expect(status.map((control) => control.textContent)).toEqual(["Todo", "Todo"]);
        expect(priority.map((control) => control.textContent)).toEqual([
          "No priority",
          "No priority",
        ]);
        expect(scroll.scrollTop).toBe(170);
        expect(slot.navigateCalls).toEqual([]);
        expect(calls.every((method) => method === "updateTask")).toBe(true);
        expect(
          updates.every((input) =>
            Object.keys(input).every((key) => ["taskId", "title", "description"].includes(key)),
          ),
        ).toBe(true);
        expect(slot.getByText("1 / 3").textContent).toBe("1 / 3");
      };
      const trigger = await slot.findByRole("button", { name: "investigation.MD" });
      for (const dismissal of ["Close", "Escape"]) {
        trigger.focus();
        fireEvent.click(trigger);
        const dialog = await slot.findByRole("dialog", { name: "investigation.MD" });
        await slot.findByRole("heading", { name: "Investigatio", level: 1 });
        expectTaskUnchanged();
        for (const key of ["]", "[", "s", "p", "l", "d", "m"]) fireEvent.keyDown(dialog, { key });
        fireEvent.click(slot.getByRole("button", { name: "Raw" }));
        expect(slot.getByLabelText("Raw source").textContent).toBe("# Investigatio");
        expectTaskUnchanged();
        fireEvent.click(slot.getByRole("button", { name: "Preview" }));
        expectTaskUnchanged();
        if (dismissal === "Close") fireEvent.click(slot.getByRole("button", { name: "Close" }));
        else fireEvent.keyDown(dialog, { key: "Escape" });
        await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(trigger));
        expectTaskUnchanged();
      }
      expect(fetch.mock.calls.length).toBe(2);
      await act(async () => finishSave());
      expectTaskUnchanged();
      await act(async () => {
        description.innerHTML = "<p>Continued task draft</p>";
        fireEvent.input(description);
      });
      await waitFor(() =>
        expect(updates).toContainEqual({
          taskId: TASKS[0]!.id,
          description: "Continued task draft",
        }),
      );
      expect(description.textContent).toBe("Continued task draft");
      expect(title.textContent).toBe("Edited investigation title");
      trigger.focus();
      fireEvent.keyDown(window, { key: "s" });
      const statusOption = await slot.findByText("In Review");
      expect(statusOption.closest('[hidden], [inert], [aria-hidden="true"]')).toBeNull();
    },
  );
  it.each([true, false])(
    "settles asynchronous removal before closing a concurrently opened preview, success=%s",
    async (success) => {
      const attachment: Attachment = {
        ...makeAttachment(TASKS[0]!.id, "pending.md"),
        mime: "application/octet-stream",
      };
      const attachments = [attachment];
      let finishRemoval!: (result: unknown) => void;
      let finishPreview!: (response: Response) => void;
      let signal!: AbortSignal;
      const removals: Record<string, unknown>[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn((_url, options) => {
          signal = options.signal;
          return new Promise<Response>((resolve) => {
            finishPreview = resolve;
          });
        }),
      );
      const slot = render("TSK-1", {
        attachments,
        remove: (input) => {
          removals.push(input);
          return new Promise((resolve) => {
            finishRemoval = resolve;
          });
        },
      });
      await ready(slot, "1 / 3");
      fireEvent.click(await slot.findByLabelText("Remove pending.md"));
      fireEvent.click(await slot.findByRole("button", { name: "Remove" }));
      await waitFor(() =>
        expect(removals).toEqual([
          {
            attachmentId: attachment.id,
            removeDescriptionReferences: true,
          },
        ]),
      );
      fireEvent.click(slot.getByRole("button", { name: "pending.md" }));
      expect((await slot.findByRole("dialog", { name: "pending.md" })).textContent).toContain(
        "Loading Markdown preview…",
      );
      expect(signal.aborted).toBe(false);
      await act(async () => {
        if (success) attachments.splice(0);
        finishRemoval(
          success
            ? { ok: true, deleted: true }
            : { ok: false, error: { code: "internal", message: "Disk is read-only" } },
        );
      });
      if (success) {
        await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
        expect(signal.aborted).toBe(true);
        await waitFor(() => expect(slot.queryByRole("button", { name: "pending.md" })).toBeNull());
        await waitFor(() =>
          expect(document.activeElement).toBe(slot.getByRole("button", { name: "Attach file" })),
        );
      } else {
        expect((await slot.findByText("Disk is read-only")).textContent).toBe("Disk is read-only");
        expect(slot.getByRole("dialog", { name: "pending.md" }).textContent).toContain(
          "Loading Markdown preview…",
        );
        expect(signal.aborted).toBe(false);
      }
      await act(async () =>
        finishPreview(
          Response.json({
            attachmentId: attachment.id,
            fileName: "pending.md",
            byteSize: 14,
            text: "# Still usable",
          }),
        ),
      );
      if (success) {
        expect(slot.queryByRole("dialog")).toBeNull();
        expect(slot.queryByRole("heading", { name: "Still usable" })).toBeNull();
        expect(document.activeElement).toBe(slot.getByRole("button", { name: "Attach file" }));
      } else {
        expect(
          (await slot.findByRole("heading", { name: "Still usable", level: 1 })).textContent,
        ).toBe("Still usable");
        expect(slot.getByRole("link", { name: "Download" }).getAttribute("href")).toBe(
          `/api/v1/plugins/tasks-plus/http/attachments/download?attachmentId=${attachment.id}`,
        );
        fireEvent.click(slot.getByRole("button", { name: "Close" }));
        expect(slot.getByRole("button", { name: "pending.md" }).textContent).toContain(
          "pending.md",
        );
        expect((slot.getByLabelText("Remove pending.md") as HTMLButtonElement).disabled).toBe(
          false,
        );
      }
      expect(slot.navigateCalls).toEqual([]);
    },
  );
});
