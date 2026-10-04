// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { createStore, registerTasksApi } from "../../api/index.js";
import {
  tasksRpcContract,
  type TaskWorkStatus,
} from "../../shared/contract.js";
import { TasksRefreshProvider } from "../../shell/refresh.js";
import { useTaskListMeta } from "./data.js";
import { TaskRow } from "./row.js";

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  cleanup();
  for (const dispose of disposers.splice(0)) await dispose();
});

it.each(["environment", "thread", "removed", "shared", "distinct"] as const)(
  "public RPC and mounted rows withhold Ready for %s association uncertainty and recover next refresh",
  async (failure) => {
    let recovered = false;
    const reads = { threads: 0, environments: 0, metadata: 0, plugins: 0 };
    const affected = (id: string) =>
      !recovered &&
      (!["shared", "distinct"].includes(failure) || id === "thr_b");
    const identity = (id: string) => {
      const number = failure === "distinct" && id === "thr_b" ? 43 : 42;
      return {
        number,
        url: `https://github.com/acme/bb/pull/${number}`,
        state: "open",
      };
    };
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks",
      sdk: {
        plugins: {
          list: async () => {
            reads.plugins++;
            return {
              plugins: [
                { id: "github-insight", enabled: true, status: "running" },
              ],
            };
          },
        },
        threads: {
          get: async ({ threadId }: { threadId: string }) => {
            reads.threads++;
            if (failure === "thread" && affected(threadId))
              throw Error("offline");
            return makeThreadResponse({
              id: threadId,
              environmentId: `env_${threadId}`,
              status: "idle",
              archivedAt: 1,
              deletedAt: failure === "removed" && affected(threadId) ? 1 : null,
            });
          },
          getPluginMetadata: async ({ threadId }: { threadId: string }) => {
            reads.metadata++;
            return {
              prSummary: {
                version: 1,
                updatedAt: new Date().toISOString(),
                pr: identity(threadId),
                checks: {
                  failed: 0,
                  running: 0,
                  cancelled: 0,
                  passed: 3,
                  skipped: 0,
                  failedNames: [],
                },
                reviewers: {
                  pending: 0,
                  approved: 1,
                  changesRequested: 0,
                  pendingNames: [],
                },
                blockers: [],
                mergeQueue: null,
                error: null,
              },
            };
          },
        },
        environments: {
          pullRequest: async ({ environmentId }: { environmentId: string }) => {
            reads.environments++;
            const id = environmentId.slice(4);
            if (
              ["environment", "shared", "distinct"].includes(failure) &&
              affected(id)
            )
              throw Error("offline");
            return {
              outcome: "available",
              pullRequest: {
                ...identity(id),
                title: "Work",
                updatedAt: "2020-01-01T00:00:00Z",
              },
            };
          },
        },
      },
    });
    disposers.push(() => harness.lifecycle.dispose());
    const store = createStore(bb);
    const project = store.tasks.createProject({
      name: "Association",
      prefix: "ASC",
      color: "blue",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Preserve workflow",
      status: "in_review",
    });
    for (const id of ["thr_a", "thr_b"])
      store.tasks.upsertTaskThread({
        taskId: task.id,
        threadId: id,
        title: id,
        presetName: "Worker",
        liveStatus: "completed",
      });
    const before = store.tasks.listTaskThreads(task.id);
    registerTasksApi(bb, store);
    window.matchMedia = (media) => ({
      matches: false,
      media,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    });
    window.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Element.prototype.scrollIntoView ??= () => {};
    const onOpen = vi.fn();
    let latest: TaskWorkStatus | undefined;
    function Overview() {
      const meta = useTaskListMeta(
        [{ ...task, labelIds: [] }],
        "all",
      ).data?.get(task.id);
      return (
        <TaskRow
          task={{ ...task, labelIds: [] }}
          meta={meta}
          project={undefined}
          showProject={false}
          projectLabels={[]}
          onEdit={() => {}}
          onOpen={onOpen}
          pending={false}
          openMenu={null}
          onOpenMenuChange={() => {}}
        />
      );
    }
    const slot = renderSlot(
      {
        component: () => (
          <TasksRefreshProvider>
            <Overview />
          </TasksRefreshProvider>
        ),
      },
      {},
      {
        rpc: {
          listTaskWorkStatus: async (input) => {
            const result = tasksRpcContract.listTaskWorkStatus.output.parse(
              await harness.behavior.callRpc("listTaskWorkStatus", input),
            );
            latest = result.byTaskId[task.id];
            return result;
          },
        },
      },
    );
    const control = await slot.findByRole("button", {
      name: /^(PR details|PRs) for/,
    });
    const prs = latest!.pullRequests;
    expect(prs.availability).toBe("partial");
    expect(new Set(prs.unavailableThreadIds)).toEqual(
      new Set(
        ["shared", "distinct"].includes(failure)
          ? ["thr_b"]
          : ["thr_a", "thr_b"],
      ),
    );
    const uncertain = prs.items.find(
      (pr) => pr.number === (failure === "distinct" ? 43 : 42),
    )!;
    expect(uncertain).toMatchObject({
      state: "open",
      details: "incomplete",
      detailsReason: "association_unavailable",
      rich: { readiness: "unknown", checks: { passed: 3 } },
    });
    if (failure === "distinct") {
      expect(prs.items.find((pr) => pr.number === 42)).toMatchObject({
        details: "available",
        rich: { readiness: "ready" },
      });
      expect(control.getAttribute("aria-label")).toContain("1 Ready to merge");
    } else {
      expect(slot.container.textContent).not.toContain("Ready to merge");
      expect(new Set(uncertain.threadIds)).toEqual(new Set(["thr_a", "thr_b"]));
    }
    fireEvent.click(control);
    const dialog = await slot.findByRole("dialog", {
      name: `PRs for ${task.key}`,
    });
    expect(dialog.textContent).toContain(
      "The current PR association could not be confirmed",
    );
    if (failure === "removed") {
      expect(
        within(dialog).queryAllByRole("link", { name: /Open thread/ }),
      ).toHaveLength(0);
      expect(dialog.textContent).toContain("thr_a");
      expect(dialog.textContent).toContain("thr_b");
    } else {
      expect(
        new Set(
          within(dialog)
            .getAllByRole("link", { name: /Open thread/ })
            .map((link) => link.getAttribute("href")),
        ),
      ).toEqual(new Set(["/threads/thr_a", "/threads/thr_b"]));
    }
    expect(
      within(dialog).getAllByRole("link", { name: /Open GitHub PR/ }),
    ).toHaveLength(failure === "distinct" ? 2 : 1);
    if (failure === "removed")
      expect(latest!.threads.map((t) => t.execution)).toEqual([
        "removed",
        "removed",
      ]);
    if (failure === "thread")
      expect(latest!.threads.map((t) => t.execution)).toEqual([
        "unavailable",
        "unavailable",
      ]);
    expect(reads).toEqual({
      threads: 2,
      environments: ["thread", "removed"].includes(failure) ? 0 : 2,
      metadata: 2,
      plugins: 1,
    });
    fireEvent.keyDown(dialog, { key: "Escape" });
    recovered = true;
    await slot.behavior.emitRealtime("tasks:changed", {
      taskId: task.id,
      projectId: project.id,
    });
    await waitFor(() => {
      expect(reads.metadata).toBe(4);
      expect(latest!.pullRequests.availability).toBe("available");
      expect(
        latest!.pullRequests.items.every(
          (pr) => pr.details === "available" && pr.rich?.readiness === "ready",
        ),
      ).toBe(true);
      expect(slot.container.textContent).toContain("Ready to merge");
    });
    expect(store.tasks.getTask(task.id)?.status).toBe("in_review");
    expect(store.tasks.listTaskThreads(task.id)).toEqual(before);
    expect(harness.realtimeSignals).toEqual([]);
    expect(onOpen).not.toHaveBeenCalled();
    expect(
      slot.inspection.rpcCalls
        .map((call) => call.method)
        .every((method) => method === "listTaskWorkStatus"),
    ).toBe(true);
  },
);
