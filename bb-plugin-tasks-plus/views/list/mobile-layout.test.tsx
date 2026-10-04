// @vitest-environment jsdom
import { cleanup, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Label, Task, TaskThread } from "../../shared/contract.js";
import { makeTask } from "../../test-fixtures.js";
import { TaskRow } from "./row.js";

window.matchMedia ??= (query: string) => ({
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

const labels: Label[] = ["bug", "frontend", "needs-design"].map(
  (name, index) => ({
    id: `01HZZZZZZZZZZZZZZZZZZZZZL${index}`,
    projectId: PROJECT_ID,
    name,
    color: "#5e6ad2",
  }),
);

const busyTask: Task = makeTask({
  id: "01HZZZZZZZZZZZZZZZZZZZZZT1",
  projectId: PROJECT_ID,
  number: 1,
  key: "TSK-1",
  title: "A task carrying every piece of row metadata at once",
  priority: "high",
  dueDate: "2026-07-20",
  position: 1,
  labelIds: labels.map((label) => label.id),
});

const workerThread: TaskThread = {
  id: "01HZZZZZZZZZZZZZZZZZZZZZH1",
  taskId: busyTask.id,
  threadId: "thr_W1",
  presetName: "Worker",
  title: "Worker",
  liveStatus: "working",
  attachedAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
};

function renderList(rich = false) {
  return renderSlot(
    app.navPanels[0]!,
    { subPath: PROJECT_ID },
    {
      rpc: {
        listProjects: () => ({ projects: [project] }),
        listFolders: () => ({ folders: [] }),
        listPresets: () => ({ presets: [] }),
        sidebarSummary: () => ({ projects: [] }),
        listLabels: () => ({ labels }),
        listTasks: () => ({ tasks: [busyTask] }),
        listTaskWorkStatus: () => ({
          byTaskId: {
            [busyTask.id]: {
              availability: "available",
              observedAt: "2026-10-02T00:00:00.000Z",
              pullRequests: {
                availability: "partial",
                items: [
                  {
                    url: "https://github.com/acme/bb/pull/42",
                    number: 42,
                    title: "Work",
                    state: "open",
                    threadIds: [`${workerThread.threadId}_0`],
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
                              changesRequested: 1,
                              pendingNames: ["koen"],
                            },
                            conditions: [
                              "checks_failed",
                              "changes_requested",
                              "review_required",
                            ],
                          },
                        }
                      : {}),
                  },
                  {
                    url: "https://github.com/acme/other/pull/42",
                    number: 42,
                    title: "Other work",
                    state: "merged",
                    threadIds: [`${workerThread.threadId}_1`],
                    updatedAt: "2026-10-02T00:00:00Z",
                    details: "unavailable",
                  },
                ],
                unavailableThreadIds: [`${workerThread.threadId}_4`],
              },
              threads: [
                "failed",
                "working",
                "idle",
                "starting",
                "unavailable",
              ].map((execution, index) => ({
                threadId: `${workerThread.threadId}_${index}`,
                title: workerThread.title,
                presetName: workerThread.presetName,
                execution,
                archive: index === 0 ? "archived" : "unarchived",
              })),
            },
          },
        }),
        listComments: () => ({ comments: [] }),
        listAttachments: () => ({ attachments: [] }),
      },
    },
  );
}

describe("responsive list structure", () => {
  it("groups a task key and subtask progress in one secondary line", () => {
    const slot = renderSlot(
      { component: TaskRow },
      {
        task: busyTask,
        meta: {
          availability: "available",
          observedAt: new Date().toISOString(),
          threads: [],
          pullRequests: { availability: "available", items: [], unavailableThreadIds: [] },
        },
        project: undefined,
        showProject: false,
        projectLabels: [],
        onEdit: () => {},
        onOpen: () => {},
        pending: false,
        subProgress: { done: 1, total: 2 },
        openMenu: null,
        onOpenMenuChange: () => {},
      },
    );
    const key = slot.getByText("TSK-1");
    const progress = slot.getByTitle("Subtasks done");
    expect(key.parentElement!.contains(progress)).toBe(true);
    expect(key.parentElement!.contains(slot.getByText(busyTask.title))).toBe(false);
  });
  it("pins the task count outside the filter-chip scroller so it cannot wrap or scroll away", async () => {
    const slot = renderList();
    const count = await slot.findByText("1 task");
    expect(count.closest(".overflow-x-auto")).toBeNull();
    const sortChip = slot.getByRole("button", { name: /Sort/ });
    expect(sortChip.closest(".overflow-x-auto")).toBeNull();
    const statusChip = slot.getByRole("button", { name: "Status" });
    expect(statusChip.closest(".overflow-x-auto")).not.toBeNull();
  });

  it("renders exactly one status and one priority editor per row with full metadata", async () => {
    const slot = renderList();
    await slot.findByText("TSK-1");
    const row = slot.container.querySelector('[data-task-key="TSK-1"]')!;
    expect(
      within(row as HTMLElement).getAllByRole("button", {
        name: /Change status, currently/,
      }),
    ).toHaveLength(1);
    expect(
      within(row as HTMLElement).getAllByRole("button", {
        name: /Set priority, currently/,
      }),
    ).toHaveLength(1);
  });

  it("keeps the summary above row navigation and allows dense metadata to wrap", async () => {
    const slot = renderList();
    const summary = await slot.findByRole("button", {
      name: /Threads for TSK-1/,
    });
    expect(summary.className).toContain("z-10");
    expect(summary.parentElement!.className).toContain("flex-wrap");
    const row = slot.container.querySelector('[data-task-key="TSK-1"]')!;
    expect(row.className).toContain("@4xl:min-h-[34px]");
    expect(row.className).not.toContain("@md:h-[34px]");
    expect(slot.getByText(busyTask.title).className).toContain("@4xl:min-w-64");
    expect(summary.textContent).toContain("1 Failed");
    expect(summary.textContent).toContain("1 archived");
    const prs = within(row as HTMLElement).getByRole("button", {
      name: /PRs for TSK-1/,
    });
    expect(prs.className).toContain("z-10");
    expect(prs.className).toContain("flex-wrap");
    expect(prs.textContent).toContain("2 PRs");
    expect(prs.textContent).toContain("1 Open");
    expect(prs.getAttribute("aria-label")).toContain("1 lookup unavailable");
    expect(row.className).not.toContain("opacity-50");
    expect(row.getAttribute("data-dimmed")).toBeNull();
  });
  it("keeps dense rich problems, archive state and incompleteness textual and wrapped above navigation", async () => {
    const slot = renderList(true);
    const control = await slot.findByRole("button", {
      name: /PRs for TSK-1: 2 PRs, 1 Checks failing/,
    });
    expect(control.textContent).toContain("1 Merged");
    expect(control.getAttribute("aria-label")).toContain("1 details unavailable");
    expect(control.getAttribute("aria-label")).toContain("1 lookup unavailable");
    expect(control.textContent).toContain("Details incomplete");
    expect(control.className).toContain("z-10");
    expect(control.className).toContain("flex-wrap");
    expect(slot.getByText(busyTask.title).className).toContain("@4xl:min-w-64");
    expect(
      slot.getByRole("button", { name: /Threads for TSK-1/ }).textContent,
    ).toContain("1 archived");
  });
});
