// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { createStore, registerTasksApi } from "../../api/index.js";
import { TasksRefreshProvider, useTasksRefresh } from "../../shell/refresh.js";
import type { Task, TaskWorkStatus } from "../../shared/contract.js";
import { useTaskListMeta } from "./data.js";

import { ThreadSummary } from "./thread-summary.js";
const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  cleanup();
  for (const dispose of disposers.splice(0)) await dispose();
  vi.useRealTimers();
});

it("shares thread reads across sequential visible chunks, retains every association and reads fresh execution on the next refresh", async () => {
  let status: "active" | "idle" = "active";
  let unreadable = true;
  const get = vi.fn(async ({ threadId }: { threadId: string }) => {
    if (threadId === "thr_unreadable" && unreadable) throw new Error("offline");
    return makeThreadResponse({ id: threadId, status });
  });
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks",
    sdk: { threads: { get } },
  });
  disposers.push(() => harness.lifecycle.dispose());
  const store = createStore(bb);
  const project = store.tasks.createProject({
    name: "Work",
    prefix: "WRK",
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
    for (const threadId of ["thr_shared", "thr_unreadable"])
      store.tasks.upsertTaskThread({
        taskId: task.id,
        threadId,
        presetName: "Worker",
        title: threadId,
        liveStatus: "completed",
      });
  registerTasksApi(bb, store);
  let latest: Map<string, TaskWorkStatus> | undefined;
  function Probe({ rows }: { rows: Task[] }) {
    latest = useTaskListMeta(rows, "all").data;
    const refresh = useTasksRefresh();
    return <button onClick={refresh.refresh}>Refresh</button>;
  }
  function Root({ rows }: { rows: Task[] }) {
    return (
      <TasksRefreshProvider>
        <Probe rows={rows} />
      </TasksRefreshProvider>
    );
  }
  const slot = renderSlot(
    { component: Root },
    { rows: tasks },
    {
      rpc: {
        listTaskWorkStatus: (input) =>
          harness.behavior.callRpc("listTaskWorkStatus", input),
      },
    },
  );
  await waitFor(() => expect(latest?.size).toBe(501));
  expect(get).toHaveBeenCalledTimes(2);
  for (const id of ["thr_shared", "thr_unreadable"])
    expect(
      get.mock.calls.filter(([input]) => input.threadId === id),
    ).toHaveLength(1);
  for (const task of tasks) {
    expect(latest!.get(task.id)!.threads).toHaveLength(2);
    expect(latest!.get(task.id)).toMatchObject({
      availability: "available",
      threads: expect.arrayContaining([
        {
          threadId: "thr_shared",
          execution: "working",
          title: expect.any(String),
          presetName: "Worker",
          archive: "unarchived",
        },
        {
          threadId: "thr_unreadable",
          execution: "unavailable",
          title: expect.any(String),
          presetName: "Worker",
          archive: "unknown",
        },
      ]),
    });
  }
  status = "idle";
  unreadable = false;
  fireEvent.click(slot.getByText("Refresh"));
  await waitFor(() =>
    expect(latest!.get(tasks[500]!.id)!.threads[0]!.execution).toBe("idle"),
  );
  expect(get).toHaveBeenCalledTimes(4);
  for (const id of ["thr_shared", "thr_unreadable"])
    expect(
      get.mock.calls.filter(([input]) => input.threadId === id),
    ).toHaveLength(2);
  for (const task of tasks) {
    expect(latest!.get(task.id)!.threads).toHaveLength(2);
    expect(latest!.get(task.id)!.threads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ threadId: "thr_shared", execution: "idle" }),
        expect.objectContaining({
          threadId: "thr_unreadable",
          execution: "idle",
        }),
      ]),
    );
  }
  expect(
    harness.inspection.sdk.calls.every((call) =>
      ["threads.get", "plugins.list"].includes(call.path),
    ),
  ).toBe(true);
  expect(harness.realtimeSignals).toEqual([]);
});

it("updates archived failure, unarchive and confirmed deletion through the mounted 60-second refresh without lifecycle writes", async () => {
  vi.useFakeTimers();
  let archivedAt: number | null = 1;
  let deletedAt: number | null = null;
  const get = vi.fn(async ({ threadId }: { threadId: string }) =>
    makeThreadResponse({
      id: threadId,
      status: "error",
      archivedAt,
      deletedAt,
    }),
  );
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks",
    sdk: { threads: { get } },
  });
  disposers.push(() => harness.lifecycle.dispose());
  const store = createStore(bb);
  const project = store.tasks.createProject({
    name: "Work",
    prefix: "WRK",
    color: "blue",
  });
  const task = {
    ...store.tasks.createTask({
      projectId: project.id,
      title: "Archive work",
      status: "in_review",
    }),
    labelIds: [],
  };
  store.tasks.upsertTaskThread({
    taskId: task.id,
    threadId: "thr_worker",
    presetName: "Worker",
    title: "Worker",
    liveStatus: "completed",
  });
  const before = store.tasks.listTaskThreads(task.id);
  registerTasksApi(bb, store);
  function Probe() {
    const query = useTaskListMeta([task], "all");
    return <ThreadSummary taskKey={task.key} meta={query.data?.get(task.id)} />;
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
        listTaskWorkStatus: (input) =>
          harness.behavior.callRpc("listTaskWorkStatus", input),
      },
    },
  );
  await act(async () => {});
  const control = () =>
    slot.getByRole("button", { name: new RegExp(`Threads for ${task.key}`) });
  expect(control().textContent).toContain("1 Failed");
  expect(control().textContent).toContain("All archived");
  archivedAt = null;
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(control().textContent).toContain("1 Failed");
  expect(control().textContent).not.toContain("archived");
  archivedAt = 2;
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(control().textContent).toContain("All archived");
  deletedAt = 3;
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(control().textContent).toContain("1 Removed");
  expect(control().textContent).not.toContain("archived");
  expect(get).toHaveBeenCalledTimes(4);
  expect(store.tasks.listTaskThreads(task.id)).toEqual(before);
  expect(store.tasks.getTask(task.id)!.status).toBe("in_review");
  expect(
    harness.inspection.sdk.calls.every((call) =>
      ["threads.get", "plugins.list"].includes(call.path),
    ),
  ).toBe(true);
  expect(harness.realtimeSignals).toEqual([]);
  slot.lifecycle.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("shares settled environment successes, absence and failures across 501 sequential rows, then reads fresh PR lifecycle and recovery on the next refresh", async () => {
  let phase = 0;
  const get = vi.fn(async ({ threadId }: { threadId: string }) =>
    makeThreadResponse({
      id: threadId,
      status: "idle",
      environmentId:
        threadId === "thr_a" || threadId === "thr_b"
          ? "env_shared"
          : `env_${threadId}`,
    }),
  );
  const pullRequest = vi.fn(
    async ({ environmentId }: { environmentId: string }) => {
      if (environmentId === "env_thr_none")
        return { outcome: "absent" as const };
      if (environmentId === "env_thr_bad" && phase === 0)
        throw new Error("offline");
      return {
        outcome: "available" as const,
        pullRequest: {
          url: `https://github.com/koenvg/${environmentId === "env_shared" ? "bb-plugins" : "other"}/pull/42`,
          number: 42,
          title: "Work",
          state: phase === 0 ? ("open" as const) : ("merged" as const),
          updatedAt: "2026-10-02T00:00:00Z",
        },
      };
    },
  );
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks",
    sdk: { threads: { get }, environments: { pullRequest } },
  });
  disposers.push(() => harness.lifecycle.dispose());
  const store = createStore(bb);
  const project = store.tasks.createProject({
    name: "PR work",
    prefix: "PRW",
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
    for (const threadId of ["thr_a", "thr_b", "thr_bad", "thr_none"])
      store.tasks.upsertTaskThread({
        taskId: task.id,
        threadId,
        title: threadId,
        presetName: "Worker",
        liveStatus: "completed",
      });
  const before = store.tasks.listTaskThreads(tasks[0]!.id);
  registerTasksApi(bb, store);
  let latest: Map<string, TaskWorkStatus> | undefined;
  function Probe() {
    latest = useTaskListMeta(tasks, "all").data;
    return <button onClick={useTasksRefresh().refresh}>Refresh PRs</button>;
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
        listTaskWorkStatus: (input) =>
          harness.behavior.callRpc("listTaskWorkStatus", input),
      },
    },
  );
  await waitFor(() => expect(latest?.size).toBe(501));
  expect(pullRequest).toHaveBeenCalledTimes(3);
  expect(get).toHaveBeenCalledTimes(4);
  for (const task of tasks)
    expect(latest!.get(task.id)).toMatchObject({
      pullRequests: {
        availability: "partial",
        items: [
          {
            url: "https://github.com/koenvg/bb-plugins/pull/42",
            state: "open",
            threadIds: expect.arrayContaining(["thr_a", "thr_b"]),
            details: "unavailable",
          },
        ],
        unavailableThreadIds: ["thr_bad"],
      },
    });
  phase = 1;
  fireEvent.click(slot.getByText("Refresh PRs"));
  await waitFor(() => expect(pullRequest).toHaveBeenCalledTimes(6));
  await waitFor(() =>
    expect(latest!.get(tasks[500]!.id)).toMatchObject({
      pullRequests: {
        availability: "available",
        items: expect.arrayContaining([
          expect.objectContaining({
            state: "merged",
            threadIds: expect.arrayContaining(["thr_a", "thr_b"]),
          }),
          expect.objectContaining({
            url: "https://github.com/koenvg/other/pull/42",
            state: "merged",
            threadIds: ["thr_bad"],
          }),
        ]),
        unavailableThreadIds: [],
      },
    }),
  );
  for (const task of tasks)
    expect(latest!.get(task.id)!.pullRequests.items).toHaveLength(2);
  expect(get).toHaveBeenCalledTimes(8);
  expect(store.tasks.listTaskThreads(tasks[0]!.id)).toEqual(before);
  expect(store.tasks.getTask(tasks[0]!.id)!.status).toBe("in_review");
  expect(
    harness.inspection.sdk.calls.every((call) =>
      ["threads.get", "environments.pullRequest", "plugins.list"].includes(
        call.path,
      ),
    ),
  ).toBe(true);
  expect(harness.realtimeSignals).toEqual([]);
});
