// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Task } from "../../shared/contract.js";
import { makeTask, rpcInput } from "../../test-fixtures.js";
import { EXPANDED_TASKS_STORAGE_KEY } from "./expanded-tasks.js";
import {
  LIST_PREFERENCE_STORAGE_KEY,
  type ListPreference,
} from "./list-preference.js";

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
window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};

const app = await loadPluginApp(() => import("../../app"));

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

const PROJECT_ID = "01HZZZZZZZZZZZZZZZZZZZZZP1";

const project = {
  id: PROJECT_ID,
  name: "ABC project",
  prefix: "ABC",
  nextTaskNumber: 9,
  color: "blue",
  folderId: null,
  linkedBbProjectId: null,
  createdAt: "2026-07-15T00:00:00.000Z",
};

function id(number: number) {
  return `01HZZZZZZZZZZZZZZZZZZZZZT${number}`;
}

function task(number: number, overrides: Partial<Task> = {}): Task {
  return makeTask({
    id: id(number),
    projectId: PROJECT_ID,
    number,
    key: `ABC-${number}`,
    title: `Task ${number}`,
    position: number,
    ...overrides,
  });
}

const parent = task(1, { status: "in_progress" });
const doneChild = task(2, {
  status: "done",
  priority: "low",
  parentTaskId: id(1),
});
const urgentChild = task(3, {
  status: "todo",
  priority: "urgent",
  parentTaskId: id(1),
});
const plain = task(4, { status: "todo" });

function serverFilter(tasks: Task[], input: Record<string, unknown>) {
  const statuses = input.statuses as string[] | undefined;
  return tasks.filter(
    (t) =>
      (statuses === undefined || statuses.includes(t.status)) &&
      (input.dependency === undefined ||
        (input.dependency === "blocked") === (t.blocked ?? false)),
  );
}

function render(tasks: Task[], subPath = PROJECT_ID, rich = false) {
  return renderSlot(
    app.navPanels[0]!,
    { subPath },
    {
      rpc: {
        listProjects: () => ({ projects: [project] }),
        listFolders: () => ({ folders: [] }),
        listPresets: () => ({ presets: [] }),
        sidebarSummary: () => ({ projects: [] }),
        listLabels: () => ({ labels: [] }),
        listTasks: (raw) => ({
          tasks: serverFilter(tasks, rpcInput(raw)),
          nextCursor: null,
        }),
        getTaskByKey: (raw) => ({
          task: tasks.find((t) => t.key === rpcInput(raw).taskKey) ?? null,
        }),
        listTaskWorkStatus: (raw) => ({
          byTaskId: Object.fromEntries(
            (rpcInput(raw).taskIds as string[]).map((taskId) => [
              taskId,
              {
                availability: "available",
                observedAt: "2026-10-02T00:00:00.000Z",
                pullRequests: {
                  availability: "available",
                  items: [
                    {
                      url: "https://github.com/acme/bb/pull/42",
                      number: 42,
                      title: "Open work",
                      state: "open",
                      updatedAt: "2026-10-02T00:00:00Z",
                      details: rich ? "available" : "unavailable",
                      ...(rich
                        ? {
                            rich: {
                              refreshedAt: new Date().toISOString(),
                              checks: {
                                failed: 1,
                                running: 0,
                                cancelled: 0,
                                passed: 2,
                                skipped: 0,
                                failedNames: ["unit"],
                              },
                              reviewers: {
                                pending: 1,
                                approved: 0,
                                changesRequested: 0,
                                pendingNames: ["koen"],
                              },
                              conditions: ["checks_failed", "review_required"],
                            },
                          }
                        : {}),
                      threadIds: [`thr_${taskId}_failed`],
                    },
                    {
                      url: "https://github.com/acme/other/pull/42",
                      number: 42,
                      title: "Merged work",
                      state: "merged",
                      updatedAt: "2026-10-02T00:00:00Z",
                      details: "unavailable",
                      threadIds: [`thr_${taskId}_working`],
                    },
                  ],
                  unavailableThreadIds: [],
                },
                threads: [
                  {
                    threadId: `thr_${taskId}_failed`,
                    title: "Failed worker",
                    presetName: "Worker",
                    execution: "failed",
                    archive: "archived",
                  },
                  {
                    threadId: `thr_${taskId}_working`,
                    title: "Working worker",
                    presetName: "Worker",
                    execution: "working",
                    archive: "unarchived",
                  },
                ],
              },
            ]),
          ),
        }),
        listTaskThreads: () => ({ taskThreads: [] }),
        listTaskPullRequests: () => ({
          pullRequests: [],
          unavailableThreadIds: [],
        }),
        listComments: () => ({ comments: [] }),
        listAttachments: () => ({ attachments: [] }),
        updateTask: (raw) => {
          const input = rpcInput(raw);
          const current = tasks.find((t) => t.id === input.taskId)!;
          return { ok: true, task: { ...current, ...input } };
        },
      },
    },
  );
}

function preset(
  preference: Partial<ListPreference["filters"]>,
  sort = "manual",
) {
  window.localStorage.setItem(
    LIST_PREFERENCE_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      scopes: {
        [`project:${PROJECT_ID}`]: {
          filters: {
            statuses: [],
            priorities: [],
            labelNames: [],
            ...preference,
          },
          sort,
        },
      },
    }),
  );
}

function presetExpanded(ids: string[]) {
  window.localStorage.setItem(
    EXPANDED_TASKS_STORAGE_KEY,
    JSON.stringify({ version: 1, scopes: { [`project:${PROJECT_ID}`]: ids } }),
  );
}

async function rowFor(slot: ReturnType<typeof render>, key: string) {
  await slot.findByText(key);
  const row = slot.container.querySelector(`[data-task-key="${key}"]`);
  if (row === null) throw new Error(`row ${key} not found`);
  return row as HTMLElement;
}

function rowKeys(slot: ReturnType<typeof render>) {
  return Array.from(slot.container.querySelectorAll("[data-task-key]")).map(
    (row) => row.getAttribute("data-task-key"),
  );
}

function groupKeys(slot: ReturnType<typeof render>, status: string) {
  const header = slot.container.querySelector(
    `[data-status-group-header="${status}"]`,
  );
  const section = header?.closest("section");
  if (!section) return null;
  return Array.from(section.querySelectorAll("[data-task-key]")).map((row) =>
    row.getAttribute("data-task-key"),
  );
}

const all = [parent, doneChild, urgentChild, plain];

describe("subtasks in the list", () => {
  it("collapses parents by default and shows the done count", async () => {
    const slot = render(all);
    const row = await rowFor(slot, "ABC-1");

    expect(within(row).getByText("1/2")).toBeTruthy();
    expect(
      within(row).getByRole("button", { name: "Expand subtasks of ABC-1" }),
    ).toBeTruthy();
    expect(rowKeys(slot)).toEqual(["ABC-4", "ABC-1"]);
  });

  it("shows no chevron and no done count for a task without subtasks", async () => {
    const slot = render(all);
    const row = await rowFor(slot, "ABC-4");

    expect(
      within(row).queryByRole("button", { name: /subtasks of/ }),
    ).toBeNull();
    expect(within(row).queryByText(/^\d+\/\d+$/)).toBeNull();
  });

  it("expands on chevron click without opening the task, keeping subtasks in the parent group", async () => {
    const slot = render(all);
    const row = await rowFor(slot, "ABC-1");

    fireEvent.click(
      within(row).getByRole("button", { name: "Expand subtasks of ABC-1" }),
    );

    await slot.findByText("ABC-2");
    expect(groupKeys(slot, "in_progress")).toEqual(["ABC-1", "ABC-2", "ABC-3"]);
    expect(groupKeys(slot, "done")).toBeNull();
    expect(
      within(await rowFor(slot, "ABC-2")).getByRole("button", {
        name: /Change status, currently Done/,
      }),
    ).toBeTruthy();
    expect(slot.navigateCalls).toEqual([]);
  });

  it("opens a subtask on click", async () => {
    presetExpanded([id(1)]);
    const slot = render(all);
    await rowFor(slot, "ABC-2");

    fireEvent.click(slot.getByRole("button", { name: "Open ABC-2: Task 2" }));

    expect(slot.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: `${PROJECT_ID}?view=list&task=ABC-2`, replace: true },
    });
  });

  it("sorts subtasks with the list sort", async () => {
    presetExpanded([id(1)]);
    preset({}, "priority");
    const slot = render(all);
    await rowFor(slot, "ABC-2");

    expect(groupKeys(slot, "in_progress")).toEqual(["ABC-1", "ABC-3", "ABC-2"]);
  });

  it("keeps an expand toggle after a reload", async () => {
    const slot = render(all);
    fireEvent.click(
      within(await rowFor(slot, "ABC-1")).getByRole("button", {
        name: "Expand subtasks of ABC-1",
      }),
    );
    await slot.findByText("ABC-2");
    slot.lifecycle.unmount();

    const reloaded = render(all);

    await reloaded.findByText("ABC-2");
    expect(rowKeys(reloaded)).toEqual(["ABC-4", "ABC-1", "ABC-2", "ABC-3"]);
  });

  it("follows an optimistic subtask status edit in the done count", async () => {
    presetExpanded([id(1)]);
    const slot = render(all);
    const child = await rowFor(slot, "ABC-3");

    fireEvent.pointerDown(
      within(child).getByRole("button", {
        name: /Change status, currently Todo/,
      }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await slot.findByRole("menuitem", { name: /Done/ }));

    await waitFor(() =>
      expect(
        within(
          slot.container.querySelector('[data-task-key="ABC-1"]')!,
        ).getByText("2/2"),
      ).toBeTruthy(),
    );
  });

  it("loads only the list query without a filter", async () => {
    const slot = render(all);
    await rowFor(slot, "ABC-1");

    const calls = slot.rpcCalls
      .filter((call) => call.method === "listTasks")
      .map((call) => rpcInput(call.input));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((input) => !("parentTaskId" in input))).toBe(true);
    expect(calls.every((input) => input.activeOnly === false)).toBe(true);
  });
});

describe("subtasks with a filter", () => {
  const readyParent = task(1, { status: "todo", blocked: false });
  const blockedChild = task(3, {
    status: "todo",
    parentTaskId: id(1),
    blocked: true,
  });
  const readyChild = task(5, {
    status: "done",
    parentTaskId: id(1),
    blocked: false,
  });
  const filtered = [readyParent, blockedChild, readyChild, task(4)];

  it("shows a dimmed, expanded parent when only a subtask matches", async () => {
    preset({ dependency: "blocked" });
    const slot = render(filtered);
    const row = await rowFor(slot, "ABC-1");

    expect(row.getAttribute("data-dimmed")).toBe("true");
    expect(
      within(row).getByRole("button", { name: "Collapse subtasks of ABC-1" }),
    ).toBeTruthy();
    expect(within(row).getByText("1/2")).toBeTruthy();
    expect(rowKeys(slot)).toEqual(["ABC-1", "ABC-3"]);
    expect(
      slot.container.querySelector('[data-status-group-header="todo"]')
        ?.textContent,
    ).toContain("1");
    expect(slot.getByText("1 task")).toBeTruthy();
    expect(
      await within(row).findByRole("button", {
        name: /Threads for ABC-1: 1 Failed, 1 Working/,
      }),
    ).toBeTruthy();
    const childRow = slot.container.querySelector('[data-task-key="ABC-3"]')!;
    expect(
      await within(childRow as HTMLElement).findByRole("button", {
        name: /Threads for ABC-3: 1 Failed, 1 Working/,
      }),
    ).toBeTruthy();
    expect(
      within(row).getByRole("button", { name: /Threads for ABC-1/ })
        .textContent,
    ).toContain("1 archived");
    expect(
      within(childRow as HTMLElement).getByRole("button", {
        name: /Threads for ABC-3/,
      }).textContent,
    ).toContain("1 archived");
    for (const target of [row, childRow]) {
      const prs = within(target as HTMLElement).getByRole("button", {
        name: /PRs for/,
      });
      expect(prs.textContent).toContain("2 PRs");
      expect(prs.textContent).toContain("1 Open");
    }
    expect(row.className).toContain("opacity-50");
    expect(childRow.className).not.toContain("opacity-50");
    const enriched = slot.inspection.rpcCalls
      .filter((c) => c.method === "listTaskWorkStatus")
      .flatMap((c) => rpcInput(c.input).taskIds as string[]);
    expect(new Set(enriched)).toEqual(
      new Set([readyParent.id, blockedChild.id]),
    );
  });

  it("loads the matches and the unfiltered scope", async () => {
    preset({ dependency: "blocked" });
    const slot = render(filtered);
    await rowFor(slot, "ABC-1");

    const calls = slot.rpcCalls
      .filter((call) => call.method === "listTasks")
      .map((call) => rpcInput(call.input));
    expect(calls.some((input) => input.dependency === "blocked")).toBe(true);
    expect(
      calls.some(
        (input) => !("dependency" in input) && !("activeOnly" in input),
      ),
    ).toBe(true);
  });

  it("does not save a toggle made under a filter", async () => {
    preset({ dependency: "blocked" });
    const slot = render(filtered);
    const row = await rowFor(slot, "ABC-1");

    fireEvent.click(
      within(row).getByRole("button", { name: "Collapse subtasks of ABC-1" }),
    );

    await waitFor(() => expect(slot.queryByText("ABC-3")).toBeNull());
    expect(window.localStorage.getItem(EXPANDED_TASKS_STORAGE_KEY)).toBeNull();
  });

  it("shows a matching parent at full strength without non-matching subtasks", async () => {
    preset({ statuses: ["todo"] });
    const slot = render([
      readyParent,
      task(2, { status: "done", parentTaskId: id(1) }),
    ]);
    const row = await rowFor(slot, "ABC-1");

    expect(row.getAttribute("data-dimmed")).toBeNull();
    expect(
      within(row).queryByRole("button", { name: /subtasks of/ }),
    ).toBeNull();
    expect(rowKeys(slot)).toEqual(["ABC-1"]);
  });

  it("hides a parent when neither it nor its subtasks match", async () => {
    preset({ statuses: ["in_review"] });
    const slot = render(filtered);

    await slot.findByText("No tasks match these filters");
    expect(rowKeys(slot)).toEqual([]);
  });
});

describe("thread summary list parity", () => {
  it.each(["", PROJECT_ID, "active"])(
    "enriches only displayed parents, then expanded children in %s",
    async (subPath) => {
      const slot = render([parent, doneChild, urgentChild, plain], subPath);
      await slot.findByRole("button", {
        name: /Threads for ABC-1: 1 Failed, 1 Working/,
      });
      const before = slot.inspection.rpcCalls
        .filter((c) => c.method === "listTaskWorkStatus")
        .flatMap((c) => rpcInput(c.input).taskIds as string[]);
      expect(new Set(before)).toEqual(
        new Set(
          subPath === "active"
            ? [parent.id, plain.id, doneChild.id, urgentChild.id]
            : [parent.id, plain.id],
        ),
      );
      if (subPath === "active") {
        fireEvent.click(
          slot.getByRole("button", { name: "Collapse subtasks of ABC-1" }),
        );
        await waitFor(() => expect(slot.queryByText("ABC-3")).toBeNull());
      }
      fireEvent.click(
        slot.getByRole("button", { name: "Expand subtasks of ABC-1" }),
      );
      await slot.findByRole("button", {
        name: /Threads for ABC-3: 1 Failed, 1 Working/,
      });
      const parentRow = await rowFor(slot, "ABC-1");
      const childRow = await rowFor(slot, "ABC-3");
      for (const row of [parentRow, childRow]) {
        const summary = within(row).getByRole("button", {
          name: /Threads for/,
        });
        expect(summary.textContent).toContain("1 Failed");
        expect(summary.textContent).toContain("1 archived");
        const prs = within(row).getByRole("button", { name: /PRs for/ });
        expect(prs.textContent).toContain("2 PRs");
        expect(prs.textContent).toContain("1 Open");
        expect(prs.textContent).toContain("1 Merged");
        expect(row.className).not.toContain("opacity-50");
      }
      fireEvent.click(
        within(childRow).getByRole("button", { name: /Threads for/ }),
      );
      const dialog = await slot.findByRole("dialog", {
        name: "Threads for ABC-3",
      });
      expect(dialog.textContent).toContain("Failed");
      expect(within(dialog).getByText("Archived")).toBeTruthy();
      fireEvent.keyDown(dialog, { key: "Escape" });
      fireEvent.click(
        within(childRow).getByRole("button", { name: /PRs for/ }),
      );
      const prDialog = await slot.findByRole("dialog", {
        name: "PRs for ABC-3",
      });
      expect(
        within(prDialog).getAllByRole("link", { name: /Open GitHub PR/ }),
      ).toHaveLength(2);
      expect(
        within(prDialog).getAllByRole("link", { name: /Open thread/ }),
      ).toHaveLength(2);
      fireEvent.keyDown(prDialog, { key: "o" });
      expect(slot.inspection.navigateCalls).toEqual([]);
      fireEvent.keyDown(prDialog, { key: "Escape" });
      const after = slot.inspection.rpcCalls
        .filter((c) => c.method === "listTaskWorkStatus")
        .at(-1)!;
      expect(new Set(rpcInput(after.input).taskIds as string[])).toEqual(
        new Set([parent.id, plain.id, doneChild.id, urgentChild.id]),
      );
      expect(
        slot.inspection.rpcCalls.filter(
          (c) => c.method === "listComments" || c.method === "listAttachments",
        ),
      ).toEqual([]);
      const listInputs = slot.inspection.rpcCalls
        .filter((c) => c.method === "listTasks")
        .map((c) => rpcInput(c.input));
      expect(
        listInputs.some((input) => input.activeOnly === (subPath === "active")),
      ).toBe(true);
    },
  );
});

it.each(["", PROJECT_ID, "active"])(
  "keeps rich check/review parity on dimmed parents and matching children in %s",
  async (subPath) => {
    preset({ statuses: ["todo"] });
    const preference = JSON.parse(
      window.localStorage.getItem(LIST_PREFERENCE_STORAGE_KEY)!,
    );
    preference.scopes.all = preference.scopes[`project:${PROJECT_ID}`];
    preference.scopes.active = preference.scopes[`project:${PROJECT_ID}`];
    window.localStorage.setItem(
      LIST_PREFERENCE_STORAGE_KEY,
      JSON.stringify(preference),
    );
    const slot = render([parent, doneChild, urgentChild, plain], subPath, true);
    const parentRow = await rowFor(slot, "ABC-1");
    const childRow = await rowFor(slot, "ABC-3");
    await slot.findByRole("button", {
      name: /PRs for ABC-3: 2 PRs, 1 Checks failing/,
    });
    expect(parentRow.getAttribute("data-dimmed")).toBe("true");
    expect(childRow.getAttribute("data-dimmed")).toBeNull();
    for (const row of [parentRow, childRow]) {
      const control = within(row).getByRole("button", { name: /PRs for/ });
      expect(control.textContent).toContain("1 Checks failing");
      expect(control.textContent).toContain("1 Merged");
      expect(
        within(row).getByRole("button", { name: /Threads for/ }).textContent,
      ).toContain("1 archived");
    }
    fireEvent.click(within(childRow).getByRole("button", { name: /PRs for/ }));
    const dialog = await slot.findByRole("dialog", { name: "PRs for ABC-3" });
    expect(dialog.textContent).toContain("Awaiting review");
    expect(dialog.textContent).toContain("1 failed");
    fireEvent.keyDown(dialog, { key: "o" });
    expect(slot.inspection.navigateCalls).toEqual([]);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(
      within(childRow).getByRole("button", {
        name: /Change status, currently Todo/,
      }),
    ).toBeTruthy();
  },
);
