// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { createStore, registerTasksApi } from "../../api/index.js";
import { TasksRefreshProvider, useTasksRefresh } from "../../shell/refresh.js";
import type { TaskWorkStatus } from "../../shared/contract.js";
import { makeTask } from "../../test-fixtures.js";
import { useTaskListMeta } from "./data.js";
import { PrSummary } from "./pr-summary.js";
const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  cleanup();
  for (const dispose of disposers.splice(0)) await dispose();
  vi.useRealTimers();
});
const url = "https://github.com/acme/bb/pull/42";
const counts = {
  failed: 2,
  running: 1,
  cancelled: 0,
  passed: 3,
  skipped: 0,
  failedNames: ["unit"],
};
const reviewers = {
  pending: 1,
  approved: 0,
  changesRequested: 0,
  pendingNames: ["koen"],
};

it.each(["checks", "ready"])(
  "expires retained %s details during a slow mounted refresh and still marks them old after that request fails",
  async (mode) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    });
    const task = makeTask();
    let latest: TaskWorkStatus | undefined;
    let reject!: (reason: Error) => void;
    let calls = 0;
    function Probe() {
      latest = useTaskListMeta([task], "all").data?.get(task.id);
      return <PrSummary taskKey={task.key} meta={latest} />;
    }
    const slot = renderSlot(
      {
        component: () => (
          <TasksRefreshProvider>
            <Probe />
          </TasksRefreshProvider>
        ),
      },
      {},
      {
        rpc: {
          listTaskWorkStatus: () => {
            if (++calls > 1)
              return new Promise((_resolve, fail) => {
                reject = fail;
              });
            return {
              byTaskId: {
                [task.id]: {
                  availability: "available",
                  observedAt: new Date().toISOString(),
                  threads: [
                    {
                      threadId: "thr_a",
                      title: "Archived worker",
                      presetName: "Worker",
                      execution: "idle",
                      archive: "archived",
                    },
                  ],
                  pullRequests: {
                    availability: "available",
                    unavailableThreadIds: [],
                    items: [
                      {
                        url,
                        number: 42,
                        title: "Work",
                        state: "open",
                        updatedAt: new Date().toISOString(),
                        threadIds: ["thr_a"],
                        details: "available",
                        rich: {
                          refreshedAt: "2026-10-02T11:01:00Z",
                          checks:
                            mode === "ready"
                              ? {
                                  ...counts,
                                  failed: 0,
                                  running: 0,
                                  failedNames: [],
                                }
                              : counts,
                          reviewers:
                            mode === "ready"
                              ? {
                                  ...reviewers,
                                  pending: 0,
                                  approved: 1,
                                  pendingNames: [],
                                }
                              : reviewers,
                          conditions: mode === "ready" ? [] : ["checks_failed", "review_required"],
                          readiness: mode === "ready" ? "ready" : "blocked",
                        },
                      },
                    ],
                  },
                },
              },
            };
          },
        },
      },
    );
    await act(async () => {});
    expect(latest?.pullRequests.items[0]?.details).toBe("available");
    expect(
      slot.getByRole("link", { name: /Open GitHub PR/ }).textContent?.includes("Ready to merge"),
    ).toBe(mode === "ready");
    await act(() => vi.advanceTimersByTimeAsync(60_000)); // Exactly one hour is still usable; RPC now pending.
    expect(calls).toBe(2);
    expect(latest?.pullRequests.items[0]?.details).toBe("available");
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(calls).toBe(2);
    expect(latest?.pullRequests.items[0]?.details).toBe("stale");
    expect(slot.getByRole("link", { name: /Open GitHub PR/ }).textContent).not.toContain(
      "Ready to merge",
    );
    expect(slot.getByRole("button", { name: /PR details/ }).textContent).toContain("Details stale");
    expect(slot.getByRole("link", { name: /Open GitHub PR/ }).textContent).not.toContain(
      "Checks failing",
    );
    await act(async () => {
      reject(new Error("offline"));
    });
    expect(latest?.pullRequests.items[0]).toMatchObject({
      state: "unknown",
      details: "stale",
      rich: { refreshedAt: "2026-10-02T11:01:00Z" },
    });
    expect(slot.getByRole("link", { name: /Open GitHub PR/ }).textContent).not.toContain(
      "Ready to merge",
    );
    slot.lifecycle.unmount();
    expect(vi.getTimerCount()).toBe(0);
  },
);

it("shares optional detection and settled metadata successes, absence and failures across the actual 501-row sequential refresh, then authoritatively re-reads", async () => {
  let phase = 0;
  const plugins = vi.fn(async () => ({
    plugins: [{ id: "github-insight", enabled: true, status: "running" }],
  }));
  const get = vi.fn(async ({ threadId }: { threadId: string }) =>
    makeThreadResponse({
      id: threadId,
      environmentId: "env_shared",
      archivedAt: 1,
    }),
  );
  const getPluginMetadata = vi.fn(async ({ threadId }: { threadId: string }) => {
    if (threadId === "thr_error" && phase === 0) throw new Error("offline");
    if (threadId === "thr_none") return {};
    return {
      prSummary: {
        version: 1,
        updatedAt: new Date().toISOString(),
        pr: { url, number: 42, state: phase === 0 ? "open" : "merged" },
        checks: counts,
        reviewers,
        blockers: ["checks_failed", "review_required"],
        mergeQueue: null,
        error: null,
      },
    };
  });
  const pullRequest = vi.fn(async () => ({
    outcome: "available",
    pullRequest: {
      url,
      number: 42,
      title: "Work",
      state: phase === 0 ? "open" : "merged",
      updatedAt: new Date().toISOString(),
    },
  }));
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks",
    sdk: {
      plugins: { list: plugins },
      threads: { get, getPluginMetadata },
      environments: { pullRequest },
    },
  });
  disposers.push(() => harness.lifecycle.dispose());
  const store = createStore(bb);
  const project = store.tasks.createProject({
    name: "Rich",
    prefix: "RCH",
    color: "blue",
  });
  const tasks = Array.from({ length: 501 }, (_, i) => ({
    ...store.tasks.createTask({
      projectId: project.id,
      title: `Task ${i}`,
      status: "in_review",
    }),
    labelIds: [],
  }));
  for (const task of tasks)
    for (const threadId of ["thr_shared", "thr_error", "thr_none"])
      store.tasks.upsertTaskThread({
        taskId: task.id,
        threadId,
        title: threadId,
        presetName: "Worker",
        liveStatus: "completed",
      });
  registerTasksApi(bb, store);
  let latest: Map<string, TaskWorkStatus> | undefined;
  function Probe() {
    latest = useTaskListMeta(tasks, "all").data;
    return <button onClick={useTasksRefresh().refresh}>Refresh</button>;
  }
  const slot = renderSlot(
    {
      component: () => (
        <TasksRefreshProvider>
          <Probe />
        </TasksRefreshProvider>
      ),
    },
    {},
    {
      rpc: {
        listTaskWorkStatus: (input) => harness.behavior.callRpc("listTaskWorkStatus", input),
      },
    },
  );
  await waitFor(() => expect(latest?.size).toBe(501));
  expect(plugins).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledTimes(3);
  expect(pullRequest).toHaveBeenCalledTimes(1);
  expect(getPluginMetadata).toHaveBeenCalledTimes(3);
  for (const task of tasks)
    expect(latest?.get(task.id)?.pullRequests.items).toEqual([
      expect.objectContaining({
        state: "open",
        details: "incomplete",
        detailsReason: "metadata_error",
        threadIds: expect.arrayContaining(["thr_shared", "thr_error", "thr_none"]),
      }),
    ]);
  phase = 1;
  fireEvent.click(slot.getByText("Refresh"));
  await waitFor(() =>
    expect(latest?.get(tasks[500]!.id)?.pullRequests.items[0]).toMatchObject({
      state: "merged",
      details: "available",
    }),
  );
  expect(plugins).toHaveBeenCalledTimes(2);
  expect(get).toHaveBeenCalledTimes(6);
  expect(pullRequest).toHaveBeenCalledTimes(2);
  expect(getPluginMetadata).toHaveBeenCalledTimes(6);
  expect(harness.realtimeSignals).toEqual([]);
  expect(store.tasks.getTask(tasks[500]!.id)?.status).toBe("in_review");
});
