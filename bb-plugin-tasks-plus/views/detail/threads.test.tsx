// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeTask, rpcInput } from "../../test-fixtures.js";

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

const app = await loadPluginApp(() => import("../../app"));

afterEach(cleanup);

const PROJECT_ID = "01HZZZZZZZZZZZZZZZZZZZZZP1";
const TASK_ID = "01HZZZZZZZZZZZZZZZZZZZZZT5";
const THREAD_ROW_ID = "01HZZZZZZZZZZZZZZZZZZZZZR1";
const OFFLINE_ROW_ID = "01HZZZZZZZZZZZZZZZZZZZZZR2";

const task = makeTask({
  id: TASK_ID,
  projectId: PROJECT_ID,
  number: 5,
  key: "TSK-5",
  title: "Ship the PR pill",
  position: 1,
});

function taskThreadRow(id: string, threadId: string, title: string) {
  return {
    id,
    taskId: TASK_ID,
    threadId,
    presetName: "Attached",
    title,
    liveStatus: "working",
    attachedAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}

function detailRpc(overrides: Record<string, unknown> = {}) {
  return {
    listProjects: () => ({
      projects: [
        {
          id: PROJECT_ID,
          name: "Tasks Plugin",
          prefix: "TSK",
          nextTaskNumber: 6,
          color: "blue",
          folderId: null,
          linkedBbProjectId: null,
          createdAt: "2026-07-15T00:00:00.000Z",
        },
      ],
    }),
    listFolders: () => ({ folders: [] }),
    listPresets: () => ({ presets: [] }),
    sidebarSummary: () => ({ projects: [] }),
    getTaskByKey: () => ({ task }),
    listTasks: (input: unknown) =>
      input !== null && rpcInput(input).parentTaskId ? { tasks: [] } : { tasks: [task] },
    listLabels: () => ({ labels: [] }),
    listAttachments: () => ({ attachments: [] }),
    listTaskThreads: () => ({
      taskThreads: [taskThreadRow(THREAD_ROW_ID, "thr_worker000", "Worker")],
    }),
    listTaskPullRequests: () => ({
      pullRequests: [],
      unavailableThreadIds: [],
    }),
    listBbProjects: () => ({ bbProjects: [] }),
    ...overrides,
  };
}

describe("task detail pull request pills", () => {
  it("links a thread's pull request as a keyboard-reachable anchor", async () => {
    const slot = renderSlot(
      app.navPanels[0]!,
      { subPath: "task/TSK-5" },
      {
        openUrl: () => true,
        rpc: detailRpc({
          listTaskPullRequests: () => ({
            pullRequests: [
              {
                url: "https://github.com/acme/bb/pull/12",
                number: 12,
                title: "Ship the PR pill",
                state: "merged",
                updatedAt: "2026-07-16T10:00:00.000Z",
                threadIds: ["thr_worker000"],
              },
            ],
            unavailableThreadIds: [],
          }),
        }),
      },
    );

    const link = (await slot.findByRole("link", {
      name: "Pull request #12: Ship the PR pill (Merged)",
    })) as HTMLAnchorElement;
    expect(link.href).toBe("https://github.com/acme/bb/pull/12");
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    expect(link.textContent).toContain("#12");
    fireEvent.click(link);
    expect(slot.navigateCalls).toEqual([]);
  });

  it("marks threads whose PR lookup failed and stays quiet otherwise", async () => {
    const slot = renderSlot(
      app.navPanels[0]!,
      { subPath: "task/TSK-5" },
      {
        rpc: detailRpc({
          listTaskThreads: () => ({
            taskThreads: [
              taskThreadRow(THREAD_ROW_ID, "thr_worker000", "Worker"),
              taskThreadRow(OFFLINE_ROW_ID, "thr_offline00", "Offline worker"),
            ],
          }),
          listTaskPullRequests: () => ({
            pullRequests: [],
            unavailableThreadIds: ["thr_offline00"],
          }),
        }),
      },
    );

    await slot.findByText("Offline worker");
    expect(slot.getAllByText("PR unavailable")).toHaveLength(1);
    expect(slot.queryByRole("link")).toBeNull();
  });

  it("detaches a thread from its card after confirmation and refetches the list", async () => {
    let detached = false;
    const slot = renderSlot(
      app.navPanels[0]!,
      { subPath: "task/TSK-5" },
      {
        rpc: detailRpc({
          listTaskThreads: () => ({
            taskThreads: detached ? [] : [taskThreadRow(THREAD_ROW_ID, "thr_worker000", "Worker")],
          }),
          taskThreadsDetach: (input: unknown) => {
            detached = true;
            return { threadId: rpcInput(input).threadId };
          },
        }),
      },
    );

    fireEvent.click(await slot.findByRole("button", { name: "Detach Worker" }));
    fireEvent.click(await slot.findByRole("button", { name: "Detach" }));

    await waitFor(() => {
      expect(slot.rpcCalls).toContainEqual({
        method: "taskThreadsDetach",
        input: { taskId: TASK_ID, threadId: "thr_worker000" },
      });
    });
    await waitFor(() => expect(slot.queryByText("Worker")).toBeNull());
  });

  it("revalidates PR state on window focus without a task-thread mutation", async () => {
    const basePullRequest = {
      url: "https://github.com/acme/bb/pull/12",
      number: 12,
      title: "Ship the PR pill",
      updatedAt: "2026-07-16T10:00:00.000Z",
      threadIds: ["thr_worker000"],
    };
    let lookupCount = 0;
    const slot = renderSlot(
      app.navPanels[0]!,
      { subPath: "task/TSK-5" },
      {
        rpc: detailRpc({
          listTaskPullRequests: () => {
            lookupCount += 1;
            return {
              pullRequests: [
                {
                  ...basePullRequest,
                  state: lookupCount === 1 ? "open" : "merged",
                },
              ],
              unavailableThreadIds: [],
            };
          },
        }),
      },
    );

    await slot.findByRole("link", {
      name: "Pull request #12: Ship the PR pill (Open)",
    });

    window.dispatchEvent(new Event("focus"));

    await waitFor(() => {
      expect(
        slot.getByRole("link", {
          name: "Pull request #12: Ship the PR pill (Merged)",
        }),
      ).toBeTruthy();
    });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type RefreshObservation = {
  stage: string;
  methods: string[];
  retainedNodes: boolean[];
  removedNodes: string[];
};

describe("task status changes retain thread and pull request data", () => {
  for (const surface of ["standalone", "native Ticket"] as const) {
    for (const order of ["event before save reply", "save reply before event"] as const) {
      it(`${surface}, ${order}: does not reload or remount thread cards`, async () => {
        const save = deferred<unknown>();
        const read = deferred<{ task: typeof task }>();
        let current = task;
        let delayReads = false;
        const updated = {
          ...task,
          status: "in_progress" as const,
          updatedAt: "2026-10-02T12:00:00.000Z",
        };
        const subPath = surface === "standalone" ? "task/TSK-5" : "all?task=TSK-5";
        const page = renderSlot(
          app.navPanels[0]!,
          { subPath },
          {
            experimental_openFixedTab: () => true,
            rpc: detailRpc({
              getTaskByKey: () => (delayReads ? read.promise : { task: current }),
              listTasks: (input: unknown) => ({
                tasks: rpcInput(input).parentTaskId ? [] : [current],
              }),
              listTaskWorkStatus: () => ({ byTaskId: {} }),
              updateTask: () => save.promise,
              listTaskPullRequests: () => ({
                pullRequests: [
                  {
                    url: "https://github.com/acme/bb/pull/12",
                    number: 12,
                    title: "Ship the PR pill",
                    state: "merged",
                    updatedAt: "2026-07-16T10:00:00.000Z",
                    threadIds: ["thr_worker000"],
                  },
                ],
                unavailableThreadIds: [],
              }),
            }),
          },
        );
        const ticket =
          surface === "native Ticket"
            ? renderSlot(app.navPanels[0]!.fixedTabs![0]!, { subPath })
            : null;
        const root = ticket?.container ?? page.container;
        const ui = within(root);
        const title = await ui.findByRole("textbox", { name: "Task title" });
        const worker = await ui.findByText("Worker");
        const pr = await ui.findByRole("link", {
          name: "Pull request #12: Ship the PR pill (Merged)",
        });
        const editor = root.querySelector<HTMLElement>(".tiptap")!;
        expect(title.textContent).toBe("Ship the PR pill");
        expect(worker.textContent).toBe("Worker");
        expect(pr.textContent).toBe("#12");
        expect(editor.getAttribute("contenteditable")).toBe("true");
        const nodes = { title, editor, worker, pr };
        const removed = new Set<string>();
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            for (const detached of record.removedNodes) {
              for (const [name, node] of Object.entries(nodes)) {
                if (detached === node || detached.contains(node)) removed.add(name);
              }
            }
          }
        });
        observer.observe(root, { childList: true, subtree: true });
        const observations: RefreshObservation[] = [];
        let offset = 0;
        const record = (stage: string) => {
          observations.push({
            stage,
            methods: page.rpcCalls.slice(offset).map((call) => call.method),
            retainedNodes: [
              ui.queryByRole("textbox", { name: "Task title" }) === title,
              root.querySelector(".tiptap") === editor,
              ui.queryByText("Worker") === worker,
              ui.queryByRole("link", { name: "Pull request #12: Ship the PR pill (Merged)" }) ===
                pr,
            ],
            removedNodes: [...removed],
          });
          offset = page.rpcCalls.length;
        };
        try {
          await act(async () => {});
          record("initial");
          delayReads = true;
          const status = ui.getAllByRole("button", { name: "Todo" })[0]!;
          status.focus();
          fireEvent.keyDown(status, { key: "Enter" });
          fireEvent.click(await page.findByRole("menuitem", { name: "In Progress" }));
          await waitFor(() =>
            expect(page.rpcCalls).toContainEqual({
              method: "updateTask",
              input: { taskId: TASK_ID, status: "in_progress" },
            }),
          );
          record("save pending");
          current = updated;
          if (order === "event before save reply") {
            await page.behavior.emitRealtime("tasks:changed", { taskId: TASK_ID });
            record("event, read pending");
            await act(async () => read.resolve({ task: current }));
            record("read resolved, save pending");
            await act(async () => save.resolve({ ok: true, task: current }));
          } else {
            await act(async () => save.resolve({ ok: true, task: current }));
            record("save resolved, read pending");
            await page.behavior.emitRealtime("tasks:changed", { taskId: TASK_ID });
            record("event, read pending");
            await act(async () => read.resolve({ task: current }));
          }
          await act(async () => {});
          record("settled");
          expect(ui.getAllByRole("button", { name: "In Progress" })).toHaveLength(2);
          expect(
            observations[0]!.methods.filter((method) =>
              ["listTaskThreads", "listTaskPullRequests"].includes(method),
            ),
          ).toEqual(["listTaskThreads", "listTaskPullRequests"]);
          expect(
            observations
              .slice(1)
              .flatMap((entry) => entry.methods)
              .filter((method) => ["listTaskThreads", "listTaskPullRequests"].includes(method)),
          ).toEqual([]);
          expect(observations.map((entry) => entry.retainedNodes)).toEqual(
            observations.map(() => [true, true, true, true]),
          );
          expect([...removed]).toEqual([]);
          await page.behavior.emitRealtime("threads:changed", { taskId: TASK_ID });
          record("threads event control");
          expect(
            observations
              .at(-1)!
              .methods.filter((method) =>
                ["listTaskThreads", "listTaskPullRequests"].includes(method),
              ),
          ).toEqual(["listTaskThreads", "listTaskPullRequests"]);
        } finally {
          observer.disconnect();
        }
      });
    }
  }
});
