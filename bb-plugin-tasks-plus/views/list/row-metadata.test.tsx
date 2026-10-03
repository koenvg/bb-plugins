// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Label, Task, TaskThread } from "../../shared/contract.js";
import { makeTask, rpcInput } from "../../test-fixtures.js";

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

beforeEach(() => {
  window.localStorage.clear();
});

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

function task(number: number, labelIds: string[] = []): Task {
  return makeTask({
    id: `01HZZZZZZZZZZZZZZZZZZZZZT${number}`,
    projectId: PROJECT_ID,
    number,
    key: `TSK-${number}`,
    title: `Task ${number}`,
    position: number,
    labelIds,
  });
}

function thread(
  taskId: string,
  liveStatus: TaskThread["liveStatus"],
  suffix: string,
): TaskThread {
  return {
    id: `01HZZZZZZZZZZZZZZZZZZZZZH${suffix}`,
    taskId,
    threadId: `thr_${suffix}`,
    presetName: "Sonnet · high",
    title: "Worker",
    liveStatus,
    attachedAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}

function label(suffix: string, name: string): Label {
  return {
    id: `01HZZZZZZZZZZZZZZZZZZZZZL${suffix}`,
    projectId: PROJECT_ID,
    name,
    color: "#5e6ad2",
  };
}

interface ListFixture {
  tasks: Task[];
  labels?: Label[];
  threadsByTask?: Record<string, TaskThread[]>;
  prsByTask?: Record<
    string,
    import("../../shared/contract.js").TaskWorkStatus["pullRequests"]
  >;
}

function renderList(fixture: ListFixture) {
  const calls = { listComments: 0, listAttachments: 0 };
  const slot = renderSlot(
    app.navPanels[0]!,
    { subPath: PROJECT_ID },
    {
      rpc: {
        listProjects: () => ({ projects: [project] }),
        listFolders: () => ({ folders: [] }),
        listPresets: () => ({ presets: [] }),
        sidebarSummary: () => ({ projects: [] }),
        listLabels: () => ({ labels: fixture.labels ?? [] }),
        listTasks: () => ({ tasks: fixture.tasks }),
        listTaskWorkStatus: (input: unknown) => ({
          byTaskId: Object.fromEntries(
            (rpcInput(input).taskIds as string[]).map((taskId) => [
              taskId,
              {
                availability: "available",
                observedAt: "2026-10-02T00:00:00.000Z",
                pullRequests: fixture.prsByTask?.[taskId] ?? {
                  availability: "available",
                  items: [],
                  unavailableThreadIds: [],
                },
                threads: (fixture.threadsByTask?.[taskId] ?? []).map((t) => ({
                  threadId: t.threadId,
                  title: t.title,
                  presetName: t.presetName,
                  execution:
                    t.liveStatus === "completed" ? "idle" : t.liveStatus,
                  archive: "unarchived",
                })),
              },
            ]),
          ),
        }),
        listComments: () => {
          calls.listComments += 1;
          return { comments: [] };
        },
        listAttachments: () => {
          calls.listAttachments += 1;
          return { attachments: [] };
        },
      },
    },
  );
  return { slot, calls };
}

describe("live thread summary", () => {
  it("counts every attachment and keeps a failure visible alongside working threads", async () => {
    const busy = task(1);
    const bare = task(2);
    const { slot } = renderList({
      tasks: [busy, bare],
      threadsByTask: {
        [busy.id]: [
          thread(busy.id, "working", "W1"),
          thread(busy.id, "working", "W2"),
          thread(busy.id, "idle", "I1"),
          thread(busy.id, "failed", "F1"),
        ],
      },
    });
    const control = await slot.findByRole("button", {
      name: "Threads for TSK-1: 1 Failed, 2 Working, 1 Idle",
    });
    expect(control.textContent).toContain("1 Failed");
    expect(control.textContent).toContain("2 Working");
    expect(control.textContent).toContain("+1 more");
    expect(
      slot.queryByRole("button", { name: /Threads for TSK-2/ }),
    ).toBeNull();
    expect(slot.queryByText("Active")).toBeNull();
  });

  it("shows mixed working and idle counts and starting threads", async () => {
    const busy = task(1),
      starting = task(2);
    const { slot } = renderList({
      tasks: [busy, starting],
      threadsByTask: {
        [busy.id]: [
          thread(busy.id, "working", "W1"),
          thread(busy.id, "working", "W2"),
          thread(busy.id, "idle", "I1"),
        ],
        [starting.id]: [thread(starting.id, "starting", "S1")],
      },
    });
    const control = await slot.findByRole("button", {
      name: "Threads for TSK-1: 2 Working, 1 Idle",
    });
    expect(control.textContent).toContain("2 Working");
    expect(control.textContent).toContain("1 Idle");
    expect(
      await slot.findByRole("button", {
        name: "Threads for TSK-2: 1 Starting",
      }),
    ).toBeTruthy();
  });

  it("lists every identity, pauses row shortcuts, restores focus on Escape, and navigates only to the thread", async () => {
    const busy = task(1);
    const { slot } = renderList({
      tasks: [busy],
      threadsByTask: {
        [busy.id]: [
          thread(busy.id, "working", "W1"),
          thread(busy.id, "failed", "F1"),
        ],
      },
    });
    const control = await slot.findByRole("button", {
      name: /Threads for TSK-1/,
    });
    control.focus();
    fireEvent.click(control);
    const dialog = await slot.findByRole("dialog", {
      name: "Threads for TSK-1",
    });
    expect(dialog.textContent).toContain("thr_W1");
    expect(dialog.textContent).toContain("thr_F1");
    fireEvent.keyDown(dialog, { key: "j" });
    fireEvent.keyDown(dialog, { key: "o" });
    expect(slot.inspection.navigateCalls).toEqual([]);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(control));
    fireEvent.click(control);
    fireEvent.click(
      await slot.findByRole("link", { name: /Open thread Worker.*thr_F1/ }),
    );
    expect(slot.inspection.navigateCalls).toEqual([
      { method: "toThread", threadId: "thr_F1" },
    ]);
    fireEvent.click(slot.getByRole("button", { name: "Open TSK-1: Task 1" }));
    expect(slot.inspection.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: `${PROJECT_ID}?view=list&task=TSK-1`, replace: true },
    });
  });

  it("uses PR controls without task navigation, suspends row shortcuts, then restores normal editing and row selection", async () => {
    const busy = task(1);
    const { slot } = renderList({
      tasks: [busy],
      prsByTask: {
        [busy.id]: {
          availability: "available",
          items: [
            {
              url: "https://github.com/acme/bb/pull/42",
              number: 42,
              title: "Open work",
              state: "open",
              updatedAt: "2026-10-02T00:00:00Z",
              details: "unavailable",
              threadIds: ["thr_worker"],
            },
          ],
          unavailableThreadIds: [],
        },
      },
    });
    const link = await slot.findByRole("link", {
      name: "Open GitHub PR acme/bb #42, Open",
    });
    const prevent = (event: Event) => event.preventDefault();
    link.addEventListener("click", prevent);
    link.focus();
    fireEvent.keyDown(link, { key: "Enter" });
    fireEvent.click(link);
    link.removeEventListener("click", prevent);
    expect(slot.inspection.navigateCalls).toEqual([]);
    const trigger = slot.getByRole("button", { name: /PR details for TSK-1/ });
    fireEvent.click(trigger);
    const dialog = await slot.findByRole("dialog", { name: "PRs for TSK-1" });
    for (const key of ["j", "k", "o", "s", "p"])
      fireEvent.keyDown(dialog, { key });
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(slot.queryByRole("menu")).toBeNull();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    fireEvent.pointerDown(
      slot.getByRole("button", { name: /Change status, currently/ }),
      { button: 0, ctrlKey: false },
    );
    expect(await slot.findByRole("menu")).toBeTruthy();
    fireEvent.keyDown(slot.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(slot.queryByRole("menu")).toBeNull());
    fireEvent.click(slot.getByRole("button", { name: "Open TSK-1: Task 1" }));
    expect(slot.inspection.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: `${PROJECT_ID}?view=list&task=TSK-1`, replace: true },
    });
  });
});
describe("list-row metadata rail", () => {
  it("fetches no comment/attachment data and renders no counts", async () => {
    const { slot, calls } = renderList({ tasks: [task(1), task(2)] });
    await slot.findByText("TSK-1");
    await waitFor(() =>
      expect(slot.getAllByRole("button").length > 0).toBe(true),
    );
    expect(calls.listComments).toBe(0);
    expect(calls.listAttachments).toBe(0);
    expect(slot.queryByTitle("Comments")).toBeNull();
    expect(slot.queryByTitle("Attachments")).toBeNull();
  });

  it("renders zero, one, and many labels with a bounded chip count", async () => {
    const labels = [
      label("A", "bug"),
      label("B", "frontend"),
      label("C", "needs-design"),
      label("D", "very-long-label-name-that-truncates"),
    ];
    const { slot } = renderList({
      tasks: [
        task(1),
        task(2, [labels[0]!.id]),
        task(
          3,
          labels.map((entry) => entry.id),
        ),
      ],
      labels,
    });
    await slot.findByText("TSK-1");

    expect(slot.getAllByText("bug").length).toBeGreaterThan(0);

    await waitFor(() => expect(slot.getByText("+2")).toBeTruthy());
    expect(slot.getByText("+3")).toBeTruthy();
    expect(slot.getByText("+2").getAttribute("title")).toBe(
      "needs-design, very-long-label-name-that-truncates",
    );
    expect(slot.getByText("+3").getAttribute("title")).toBe(
      "frontend, needs-design, very-long-label-name-that-truncates",
    );
    expect(slot.queryByText("needs-design")).toBeNull();
  });
});
