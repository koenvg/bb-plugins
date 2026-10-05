import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStore, registerTasksApi } from "./index.js";
import { createWorkStatusReader } from "./work-status.js";
import { tasksRpcContract } from "../shared/contract.js";

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
  vi.useRealTimers();
});
const pr = (
  state: "open" | "draft" | "merged" | "closed" = "open",
  url = "https://github.com/acme/bb/pull/42",
  updatedAt = "2026-10-02T00:00:00Z",
) => ({
  outcome: "available" as const,
  pullRequest: { url, number: 42, title: "Work", state, updatedAt },
});
const refresh = (i: number, step: "start" | "continue" | "finish") => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  step,
});
function setup(
  get: (input: { threadId: string }) => Promise<ReturnType<typeof makeThreadResponse>>,
  pullRequest: (input: { environmentId: string }) => Promise<unknown>,
) {
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks",
    sdk: { threads: { get }, environments: { pullRequest } },
  });
  disposers.push(() => harness.lifecycle.dispose());
  const store = createStore(bb);
  const project = store.tasks.createProject({
    name: "PRs",
    prefix: "PRS",
    color: "blue",
  });
  const task = store.tasks.createTask({
    projectId: project.id,
    title: "Work",
    status: "in_review",
  });
  registerTasksApi(bb, store);
  const attach = (id: string) =>
    store.tasks.upsertTaskThread({
      taskId: task.id,
      threadId: id,
      title: id,
      presetName: "Worker",
      liveStatus: "completed",
    });
  const read = async () =>
    tasksRpcContract.listTaskWorkStatus.output.parse(
      await harness.behavior.callRpc("listTaskWorkStatus", {
        taskIds: [task.id],
      }),
    ).byTaskId[task.id]!;
  return { bb, harness, store, task, attach, read };
}

describe("basic list PR lifecycle without optional plugins", () => {
  it("deduplicates canonical URLs, keeps all shared threads and equal numbers in different repositories, and preserves all four states", async () => {
    const pullRequest = vi.fn(async ({ environmentId }: { environmentId: string }) => {
      switch (environmentId) {
        case "env_a":
          return pr("open", "https://GITHUB.com/Acme/BB/pull/42/?from=bb#discussion");
        case "env_b":
          return pr("open");
        case "env_draft":
          return pr("draft", "https://github.com/acme/other/pull/42");
        case "env_merged":
          return pr("merged", "https://github.com/acme/merged/pull/42");
        default:
          return pr("closed", "https://github.com/acme/closed/pull/42");
      }
    });
    const { read, attach, store, task, harness } = setup(
      async ({ threadId }) =>
        makeThreadResponse({
          id: threadId,
          environmentId: `env_${threadId.slice(4)}`,
          archivedAt: 1,
          status: "error",
        }),
      pullRequest,
    );
    for (const id of ["thr_a", "thr_b", "thr_draft", "thr_merged", "thr_closed"]) attach(id);
    const before = store.tasks.listTaskThreads(task.id);
    const result = await read();
    expect(result.pullRequests.availability).toBe("available");
    expect(result.pullRequests.items).toHaveLength(4);
    expect(result.pullRequests.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://github.com/acme/bb/pull/42",
          state: "open",
          details: "unavailable",
          threadIds: expect.arrayContaining(["thr_a", "thr_b"]),
        }),
        expect.objectContaining({
          url: "https://github.com/acme/other/pull/42",
          state: "draft",
        }),
        expect.objectContaining({ state: "merged" }),
        expect.objectContaining({ state: "closed" }),
      ]),
    );
    expect(pullRequest).toHaveBeenCalledTimes(5);
    expect(result.threads.every((t) => t.execution === "failed" && t.archive === "archived")).toBe(
      true,
    );
    expect(store.tasks.getTask(task.id)!.status).toBe("in_review");
    expect(store.tasks.listTaskThreads(task.id)).toEqual(before);
    expect(
      harness.inspection.sdk.calls.every((call) =>
        ["threads.get", "environments.pullRequest", "plugins.list"].includes(call.path),
      ),
    ).toBe(true);
    expect(harness.realtimeSignals).toEqual([]);
  });

  it("keeps merged work alongside partial, explicit unavailable, unreadable and removed attachments, and confirms absence only from completed reads", async () => {
    const pullRequest = vi.fn(async ({ environmentId }: { environmentId: string }) => {
      if (environmentId === "env_absent") return { outcome: "absent" };
      if (environmentId === "env_error") throw new Error("offline");
      if (environmentId === "env_unavailable")
        return { outcome: "unavailable", message: "offline" };
      return pr("merged");
    });
    const { read, attach } = setup(async ({ threadId }) => {
      if (threadId === "thr_unreadable") throw new Error("offline");
      return makeThreadResponse({
        id: threadId,
        environmentId: threadId === "thr_no_env" ? null : `env_${threadId.slice(4)}`,
        deletedAt: threadId === "thr_removed" ? 1 : null,
      });
    }, pullRequest);
    for (const id of [
      "thr_merged",
      "thr_absent",
      "thr_error",
      "thr_unavailable",
      "thr_unreadable",
      "thr_removed",
      "thr_no_env",
    ])
      attach(id);
    const result = await read();
    expect(result.pullRequests).toMatchObject({
      availability: "partial",
      items: [expect.objectContaining({ state: "merged" })],
      unavailableThreadIds: expect.arrayContaining([
        "thr_error",
        "thr_unavailable",
        "thr_unreadable",
        "thr_removed",
      ]),
    });
    expect(result.pullRequests.unavailableThreadIds).toHaveLength(4);
    expect(pullRequest).toHaveBeenCalledTimes(4);
    const absent = setup(
      async ({ threadId }) => makeThreadResponse({ id: threadId, environmentId: "env_absent" }),
      pullRequest,
    );
    absent.attach("thr_absent");
    expect((await absent.read()).pullRequests).toEqual({
      availability: "available",
      items: [],
      unavailableThreadIds: [],
    });
  });

  it.each([
    "https://evil.test/acme/bb/pull/42",
    "javascript:alert(42)",
    "https://github.com/acme/bb/pull/43",
    "https://github.com/acme/bb/issues/42",
  ])("treats invalid identity %s as unavailable, not confirmed absence", async (url) => {
    const { read, attach } = setup(
      async ({ threadId }) => makeThreadResponse({ id: threadId, environmentId: "env_pr" }),
      async () => pr("open", url),
    );
    attach("thr_a");
    expect((await read()).pullRequests).toEqual({
      availability: "unavailable",
      items: [],
      unavailableThreadIds: ["thr_a"],
    });
  });

  it("uses a newer lifecycle and exposes unresolved same-identity conflicts without losing links or threads", async () => {
    const { read, attach } = setup(
      async ({ threadId }) =>
        makeThreadResponse({
          id: threadId,
          environmentId: `env_${threadId.slice(4)}`,
        }),
      async ({ environmentId }) =>
        environmentId === "env_a" ? pr("merged", undefined, "2026-10-01T00:00:00Z") : pr("open"),
    );
    attach("thr_a");
    attach("thr_b");
    expect((await read()).pullRequests.items[0]).toMatchObject({
      state: "open",
      threadIds: expect.arrayContaining(["thr_a", "thr_b"]),
    });
    const conflicting = setup(
      async ({ threadId }) =>
        makeThreadResponse({
          id: threadId,
          environmentId: `env_${threadId.slice(4)}`,
        }),
      async ({ environmentId }) => (environmentId === "env_a" ? pr("merged") : pr("open")),
    );
    conflicting.attach("thr_a");
    conflicting.attach("thr_b");
    expect((await conflicting.read()).pullRequests.items[0]).toMatchObject({
      url: "https://github.com/acme/bb/pull/42",
      state: "unknown",
      threadIds: expect.arrayContaining(["thr_a", "thr_b"]),
    });
  });

  it.each([
    ["thr_old", "thr_unordered", "thr_new"],
    ["thr_old", "thr_new", "thr_unordered"],
    ["thr_unordered", "thr_old", "thr_new"],
    ["thr_unordered", "thr_new", "thr_old"],
    ["thr_new", "thr_old", "thr_unordered"],
    ["thr_new", "thr_unordered", "thr_old"],
  ])(
    "retains undated Open evidence regardless of attachment order %s, %s, %s",
    async (...order) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-03T00:00:00Z"));
      const { read, attach, store, task } = setup(
        async ({ threadId }) =>
          makeThreadResponse({
            id: threadId,
            environmentId: `env_${threadId.slice(4)}`,
          }),
        async ({ environmentId }) =>
          environmentId === "env_old"
            ? pr("open", undefined, "2026-10-01T00:00:00Z")
            : environmentId === "env_unordered"
              ? pr("open", undefined, "invalid timestamp")
              : pr("merged", undefined, "2026-10-02T00:00:00Z"),
      );
      for (const id of [...order].reverse()) {
        attach(id);
        vi.advanceTimersByTime(1_000);
      }
      expect(store.tasks.listTaskThreads(task.id).map((thread) => thread.threadId)).toEqual(order);
      expect((await read()).pullRequests).toMatchObject({
        availability: "available",
        items: [
          {
            url: "https://github.com/acme/bb/pull/42",
            state: "unknown",
            threadIds: expect.arrayContaining(order),
            details: "unavailable",
          },
        ],
        unavailableThreadIds: [],
      });
      expect((await read()).pullRequests.items[0]!.threadIds).toHaveLength(3);
      expect(store.tasks.getTask(task.id)!.status).toBe("in_review");
    },
  );

  it("shares environment and thread concurrency globally across refresh sessions", async () => {
    let active = 0,
      peak = 0;
    const releases: (() => void)[] = [];
    const pause = async () => {
      peak = Math.max(peak, ++active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
    };
    const get = vi.fn(async ({ threadId }: { threadId: string }) => {
      await pause();
      return makeThreadResponse({
        id: threadId,
        environmentId: `env_${threadId}`,
      });
    });
    const pullRequest = vi.fn(async () => {
      await pause();
      return pr();
    });
    const { bb, store, task, attach } = setup(get, pullRequest);
    for (let i = 0; i < 12; i++) attach(`thr_${i}`);
    const reader = createWorkStatusReader({
      store: store.tasks,
      threads: bb.sdk.threads,
      environments: bb.sdk.environments,
      now: () => new Date(),
    });
    const first = reader([task.id], refresh(1, "start"));
    while (pullRequest.mock.calls.length < 8) {
      releases.splice(0).forEach((resolve) => resolve());
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const second = reader([task.id], refresh(2, "start"));
    let done = false;
    const both = Promise.all([first, second]).then(() => {
      done = true;
    });
    while (!done) {
      releases.splice(0).forEach((resolve) => resolve());
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await both;
    expect(peak).toBe(8);
    expect(get).toHaveBeenCalledTimes(24);
    expect(pullRequest).toHaveBeenCalledTimes(24);
    reader.dispose();
  });

  it("keeps the combined 4096 observation budget and explicit overflow, releases environments on finish and expiry, and recovers next refresh", async () => {
    vi.useFakeTimers();
    const get = vi.fn(async ({ threadId }: { threadId: string }) =>
      makeThreadResponse({ id: threadId, environmentId: `env_${threadId}` }),
    );
    const pullRequest = vi.fn(async () => pr());
    const { bb, store, task, attach } = setup(get, pullRequest);
    attach("thr_template");
    const template = store.tasks.listTaskThreads(task.id)[0]!;
    let attached = Array.from({ length: 2050 }, (_, i) => ({
      ...template,
      threadId: `thr_${i}`,
    }));
    const reader = createWorkStatusReader({
      store: { getTask: () => task, listTaskThreads: () => attached },
      threads: bb.sdk.threads,
      environments: bb.sdk.environments,
      now: () => new Date(),
    });
    const first = await reader([task.id], refresh(1, "start"));
    expect(get).toHaveBeenCalledTimes(2050);
    expect(pullRequest).toHaveBeenCalledTimes(2046);
    expect(first.byTaskId[task.id]!.pullRequests.unavailableThreadIds).toHaveLength(4);
    await reader([task.id], refresh(1, "continue"));
    expect(pullRequest).toHaveBeenCalledTimes(2046);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(
      (await reader([task.id], refresh(1, "continue"))).byTaskId[task.id]!.pullRequests
        .availability,
    ).toBe("unavailable");
    expect(pullRequest).toHaveBeenCalledTimes(2046);
    attached = attached.slice(-4);
    expect(
      (await reader([task.id], refresh(2, "start"))).byTaskId[task.id]!.pullRequests.availability,
    ).toBe("available");
    expect(pullRequest).toHaveBeenCalledTimes(2050);
    await reader([], refresh(2, "finish"));
    expect(
      (await reader([task.id], refresh(2, "continue"))).byTaskId[task.id]!.pullRequests
        .availability,
    ).toBe("unavailable");
    reader.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
