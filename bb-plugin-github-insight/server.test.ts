import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pageOne from "./test/fixtures/pr-25337-overview-page-1.json";
import pageTwo from "./test/fixtures/pr-25337-overview-page-2.json";
import checkRunDetails from "./test/fixtures/pr-25337-check-run-details.json";
import readyToEnqueuePage from "./test/fixtures/pr-25693-overview-ready-to-enqueue.json";
import prFiles from "./test/fixtures/pr-25259-files.json";
import reviewThreads from "./test/fixtures/pr-25259-review-threads.json";
import reviewQueue from "./test/fixtures/review-queue.json";
import type { NewThreadRequest } from "@get-bb/plugin-sdk";
import type { LoadedReviewQueue, ReviewResult } from "./contract";
import type { PrSummary } from "./core/summary";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";
import {
  failed,
  linkedPr,
  ok,
  prHeadResponse,
  setup,
  type HostCall,
  type PullRequestResult,
} from "./test/plugin-harness";

function withPrState(state: "OPEN" | "MERGED" | "CLOSED") {
  return {
    ...pageOne,
    data: {
      repository: {
        ...pageOne.data.repository,
        pullRequest: { ...pageOne.data.repository.pullRequest, state },
      },
    },
  };
}

function pages(first: unknown = pageOne) {
  return ({ method, input }: HostCall) => {
    if (method === "fetchCheckRunDetails") return ok(checkRunDetails);
    const { after } = input as { after: string | null };
    return ok(after === null ? first : pageTwo);
  };
}

function overviewRefreshes(harness: Awaited<ReturnType<typeof setup>>) {
  return harness.experimental_hostRpcCalls.filter(
    (call) =>
      call.method === "fetchOverviewPage" &&
      (call.input as { after: string | null }).after === null,
  );
}

interface MetadataUpdate {
  threadId: string;
  pluginId: string;
  set?: { prSummary: PrSummary };
  remove?: string[];
}

function metadataUpdates(harness: Awaited<ReturnType<typeof setup>>) {
  return harness.sdk
    .callsTo("threads.updatePluginMetadata")
    .map(([args]) => args as MetadataUpdate);
}

async function settle() {
  for (let round = 0; round < 5; round++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("getInsight", () => {
  it("reports no PR and makes no GitHub call for a thread without an environment", async () => {
    const harness = await setup({ threads: [{ id: "thr_1", environmentId: null }] });

    const result = await harness.behavior.callRpc("getInsight", {
      threadId: "thr_1",
    });

    expect(result).toEqual({ kind: "no_pr" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });

  it("reports no PR and makes no GitHub call when bb links no PR", async () => {
    const harness = await setup({ threads: [{ id: "thr_1", environmentId: "env_1" }] });

    const result = await harness.behavior.callRpc("getInsight", {
      threadId: "thr_1",
    });

    expect(result).toEqual({ kind: "no_pr" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });

  it("reads every contexts page and the failure details through the thread's host", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: pages(),
    });

    const result = await harness.behavior.callRpc("getInsight", {
      threadId: "thr_1",
    });

    expect(harness.experimental_hostRpcCalls).toEqual([
      expect.objectContaining({
        method: "fetchOverviewPage",
        hostId: "host-1",
        input: { owner: "collibra", repo: "frontend", number: 25337, after: null },
      }),
      expect.objectContaining({
        input: { owner: "collibra", repo: "frontend", number: 25337, after: "MTAw" },
      }),
      expect.objectContaining({
        method: "fetchCheckRunDetails",
        hostId: "host-1",
        input: { ids: ["CR_kwDOHI7l-88AAAAZCnAPSQ", "CR_kwDOHI7l-88AAAAZCnoC7g"] },
      }),
    ]);
    expect(result).toMatchObject({
      kind: "ok",
      insight: { pr: { number: 25337, state: "open" } },
      error: null,
    });
  });

  it("reuses the last refresh instead of calling GitHub again", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: pages(),
    });

    await harness.behavior.callRpc("getInsight", { threadId: "thr_1" });
    await harness.behavior.callRpc("getInsight", { threadId: "thr_1" });

    expect(overviewRefreshes(harness)).toHaveLength(1);
  });

  it.each([
    [{ kind: "gh_missing" } as const, "gh not installed"],
    [{ kind: "gh_logged_out" } as const, "gh not logged in"],
    [{ kind: "rate_limited", resetAt: null } as const, "rate limited"],
  ])("names the gh failure %j", async (failure, message) => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: () => failed(failure),
    });

    const result = await harness.behavior.callRpc("getInsight", {
      threadId: "thr_1",
    });

    expect(result).toEqual({ kind: "error", message });
  });

  it("reports an error when bb cannot read the PR", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: { outcome: "unavailable", message: "gh not found" } },
    });

    const result = await harness.behavior.callRpc("getInsight", {
      threadId: "thr_1",
    });

    expect(result).toEqual({ kind: "error", message: "gh not found" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });
});

describe("refresh", () => {
  it("calls GitHub again at once and returns the new data", async () => {
    let first: unknown = pageOne;
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: (call) => pages(first)(call),
    });
    await harness.behavior.callRpc("getInsight", { threadId: "thr_1" });
    first = withPrState("MERGED");

    const result = await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    expect(overviewRefreshes(harness)).toHaveLength(2);
    expect(result).toMatchObject({
      kind: "ok",
      insight: { pr: { state: "merged" } },
    });
  });

  it("keeps the last good data with its time when a refresh fails", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-24T10:00:00Z") });
    let host: (call: HostCall) => unknown = pages();
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: (call) => host(call),
    });
    await harness.behavior.callRpc("getInsight", { threadId: "thr_1" });
    vi.setSystemTime(new Date("2026-09-24T10:05:00Z"));
    host = () => failed({ kind: "gh_logged_out" });

    const result = await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    expect(result).toMatchObject({
      kind: "ok",
      insight: { pr: { number: 25337 } },
      refreshedAt: Date.parse("2026-09-24T10:00:00Z"),
      error: "gh not logged in",
    });
  });

  it("does not tell open tabs when a refresh finds the same data", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: pages(),
    });
    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    expect(harness.realtimeSignals).toHaveLength(1);
  });
});

describe("pr-poller", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date"],
      now: new Date("2026-09-24T10:00:00Z"),
    });
  });

  async function advance(ms: number) {
    await vi.advanceTimersByTimeAsync(ms);
    await settle();
  }

  it("refreshes an open PR every 60 seconds", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: pages(),
    });

    const run = harness.behavior.runService("pr-poller");
    await settle();
    expect(overviewRefreshes(harness)).toHaveLength(1);

    await advance(59_999);
    expect(overviewRefreshes(harness)).toHaveLength(1);

    await advance(1);
    expect(overviewRefreshes(harness)).toHaveLength(2);
    run.controller.abort();
  });

  it("refreshes the PR of a hidden thread", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1", visibility: "hidden" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: pages(),
    });

    const run = harness.behavior.runService("pr-poller");
    await settle();

    expect(overviewRefreshes(harness)).toHaveLength(1);
    run.controller.abort();
  });

  it("tells open tabs of every thread on the PR that the data changed", async () => {
    const harness = await setup({
      threads: [
        { id: "thr_1", environmentId: "env_1" },
        { id: "thr_2", environmentId: "env_2" },
      ],
      pullRequests: { env_1: linkedPr(25337), env_2: linkedPr(25337) },
      host: pages(),
    });
    const run = harness.behavior.runService("pr-poller");
    await settle();

    expect(harness.realtimeSignals).toEqual([
      { channel: "insight.updated", payload: { threadIds: ["thr_1", "thr_2"] } },
    ]);
    run.controller.abort();
  });

  it("refreshes a PR once when several threads share it", async () => {
    const harness = await setup({
      threads: [
        { id: "thr_1", environmentId: "env_1" },
        { id: "thr_2", environmentId: "env_1" },
        { id: "thr_3", environmentId: "env_2" },
        { id: "thr_4", environmentId: null },
      ],
      pullRequests: { env_1: linkedPr(25337), env_2: linkedPr(25337) },
      host: pages(),
    });

    const run = harness.behavior.runService("pr-poller");
    await settle();

    expect(overviewRefreshes(harness)).toHaveLength(1);
    run.controller.abort();
  });

  it("runs at most 4 refreshes at the same time", async () => {
    const pending: Array<() => void> = [];
    const threads = [1, 2, 3, 4, 5, 6].map((index) => ({
      id: `thr_${index}`,
      environmentId: `env_${index}`,
    }));
    const harness = await setup({
      threads,
      pullRequests: Object.fromEntries(
        threads.map((thread, index) => [thread.environmentId, linkedPr(index + 1)]),
      ),
      host: (call) => {
        const { after } = call.input as { after?: string | null };
        if (after !== null) return pages()(call);
        return new Promise((resolve) => {
          pending.push(() => resolve(pages()(call)));
        });
      },
    });

    const run = harness.behavior.runService("pr-poller");
    await settle();
    expect(overviewRefreshes(harness)).toHaveLength(4);

    pending.shift()!();
    await settle();
    expect(overviewRefreshes(harness)).toHaveLength(5);
    run.controller.abort();
  });

  it("stops when aborted while a GitHub call never answers", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: () => new Promise(() => {}),
    });

    const run = harness.behavior.runService("pr-poller");
    await settle();
    let stopped = false;
    void run.done.then(() => (stopped = true));

    run.controller.abort();
    await settle();

    expect(stopped).toBe(true);
  });

  it("stops refreshing a merged PR after one last refresh that records it", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337, "merged") },
      host: pages(withPrState("MERGED")),
    });

    const run = harness.behavior.runService("pr-poller");
    await settle();
    await advance(120_000);

    expect(overviewRefreshes(harness)).toHaveLength(1);
    expect(
      await harness.behavior.callRpc("getInsight", { threadId: "thr_1" }),
    ).toMatchObject({ kind: "ok", insight: { pr: { state: "merged" } } });
    run.controller.abort();
  });

  it("refreshes a closed PR again when bb reports it open again", async () => {
    const pullRequests = { env_1: linkedPr(25337, "closed") };
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests,
      host: pages(withPrState("CLOSED")),
    });
    const run = harness.behavior.runService("pr-poller");
    await settle();

    pullRequests.env_1 = linkedPr(25337, "open");
    await advance(60_000);

    expect(overviewRefreshes(harness)).toHaveLength(2);
    run.controller.abort();
  });

  it("waits until the reset time after a rate limit", async () => {
    let host = (_call: HostCall): unknown =>
      failed({ kind: "rate_limited", resetAt: Date.now() + 10 * 60_000 });
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: (call) => host(call),
    });

    const run = harness.behavior.runService("pr-poller");
    await settle();
    host = pages();
    await advance(10 * 60_000 - 1);
    expect(overviewRefreshes(harness)).toHaveLength(1);

    await advance(1);
    expect(overviewRefreshes(harness)).toHaveLength(2);
    run.controller.abort();
  });

  it("waits 5 minutes after a rate limit without a reset time", async () => {
    let host = (_call: HostCall): unknown =>
      failed({ kind: "rate_limited", resetAt: null });
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: (call) => host(call),
    });

    const run = harness.behavior.runService("pr-poller");
    await settle();
    host = pages();
    await advance(5 * 60_000 - 1);
    expect(overviewRefreshes(harness)).toHaveLength(1);

    await advance(1);
    expect(overviewRefreshes(harness)).toHaveLength(2);
    run.controller.abort();
  });

  it("keeps the latest reset time when refreshes in one poll disagree", async () => {
    const threads = [1, 2].map((index) => ({
      id: `thr_${index}`,
      environmentId: `env_${index}`,
    }));
    let host = ({ input }: HostCall): unknown =>
      failed({
        kind: "rate_limited",
        resetAt: (input as { number: number }).number === 1 ? Date.now() + 40 * 60_000 : null,
      });
    const harness = await setup({
      threads,
      pullRequests: { env_1: linkedPr(1), env_2: linkedPr(2) },
      host: (call) => host(call),
    });

    const run = harness.behavior.runService("pr-poller");
    await settle();
    host = pages();
    await advance(10 * 60_000);

    expect(overviewRefreshes(harness)).toHaveLength(2);
    run.controller.abort();
  });

  it("lets the user refresh while the poller waits on a rate limit", async () => {
    let host = (_call: HostCall): unknown => failed({ kind: "rate_limited", resetAt: null });
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: (call) => host(call),
    });
    const run = harness.behavior.runService("pr-poller");
    await settle();
    host = pages();

    const result = await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    expect(result).toMatchObject({ kind: "ok", error: null });
    run.controller.abort();
  });

  it("does not call GitHub for a newly opened tab while the poller waits on a rate limit", async () => {
    const harness = await setup({
      threads: [
        { id: "thr_1", environmentId: "env_1" },
        { id: "thr_2", environmentId: "env_2" },
      ],
      pullRequests: { env_1: linkedPr(1), env_2: linkedPr(2) },
      host: () => failed({ kind: "rate_limited", resetAt: null }),
    });
    const run = harness.behavior.runService("pr-poller");
    await settle();
    const callsBefore = harness.experimental_hostRpcCalls.length;

    const result = await harness.behavior.callRpc("getInsight", { threadId: "thr_2" });

    expect(result).toEqual({ kind: "error", message: "rate limited" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(callsBefore);
    run.controller.abort();
  });

  it("tells a thread that joins a running refresh when it finishes", async () => {
    let finish: () => void = () => {};
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }, { id: "thr_2", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: (call) => {
        const { after } = call.input as { after?: string | null };
        if (after !== null) return pages()(call);
        return new Promise((resolve) => {
          finish = () => resolve(pages()(call));
        });
      },
    });
    const first = harness.behavior.callRpc("refresh", { threadId: "thr_1" });
    await settle();
    const second = harness.behavior.callRpc("refresh", { threadId: "thr_2" });
    await settle();

    finish();
    await Promise.all([first, second]);

    expect(harness.realtimeSignals).toEqual([
      { channel: "insight.updated", payload: { threadIds: ["thr_1", "thr_2"] } },
    ]);
  });

  it("skips the rest of a poll once GitHub rate-limits it", async () => {
    const threads = [1, 2, 3, 4, 5, 6].map((index) => ({
      id: `thr_${index}`,
      environmentId: `env_${index}`,
    }));
    const harness = await setup({
      threads,
      pullRequests: Object.fromEntries(
        threads.map((thread, index) => [thread.environmentId, linkedPr(index + 1)]),
      ),
      host: () => failed({ kind: "rate_limited", resetAt: null }),
    });

    const run = harness.behavior.runService("pr-poller");
    await settle();

    expect(overviewRefreshes(harness)).toHaveLength(4);
    run.controller.abort();
  });

  it("ends when the plugin stops", async () => {
    const harness = await setup({ threads: [] });

    const run = harness.behavior.runService("pr-poller");
    await settle();
    run.controller.abort();

    await expect(run.done).resolves.toBeUndefined();
  });
});

describe("refresh on idle", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date"],
      now: new Date("2026-09-24T10:00:00Z"),
    });
  });

  async function advance(ms: number) {
    await vi.advanceTimersByTimeAsync(ms);
    await settle();
  }

  async function goIdle(harness: Awaited<ReturnType<typeof setup>>, threadId: string) {
    await harness.behavior.emitThreadEvent("thread.idle", {
      thread: makeThreadResponse({ id: threadId }),
      lastAssistantText: null,
    });
    await settle();
  }

  it("refreshes the PR and writes the summary when its thread goes idle", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: pages(),
    });

    await goIdle(harness, "thr_1");

    expect(overviewRefreshes(harness)).toHaveLength(1);
    expect(metadataUpdates(harness)).toEqual([
      expect.objectContaining({ threadId: "thr_1", set: { prSummary: expect.objectContaining({ version: 1 }) } }),
    ]);
  });

  it("joins a poll of the same PR instead of fetching again", async () => {
    let release: () => void = () => {};
    const answer = pages();
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: (call) => {
        if (overviewRefreshes(harness).length > 1 || call.method !== "fetchOverviewPage") return answer(call);
        return new Promise((resolve) => { release = () => resolve(answer(call)); });
      },
    });
    const run = harness.behavior.runService("pr-poller");
    await settle();

    await goIdle(harness, "thr_1");
    release();
    await settle();

    expect(overviewRefreshes(harness)).toHaveLength(1);
    run.controller.abort();
  });

  it("tries once more after 10 seconds when bb links the PR late", async () => {
    const pullRequests: Record<string, PullRequestResult> = {};
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests,
      host: pages(),
    });

    await goIdle(harness, "thr_1");
    pullRequests.env_1 = linkedPr(25337);
    await advance(9_999);
    expect(overviewRefreshes(harness)).toHaveLength(0);

    await advance(1);
    expect(overviewRefreshes(harness)).toHaveLength(1);
  });

  it("stops after the second try when bb still links no PR", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      host: pages(),
    });

    await goIdle(harness, "thr_1");
    await advance(60_000);

    expect(harness.sdk.callsTo("environments.pullRequest")).toHaveLength(2);
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });

  it("makes no GitHub request while the service waits on a rate limit", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: () => failed({ kind: "rate_limited", resetAt: null }),
    });
    const run = harness.behavior.runService("pr-poller");
    await settle();
    const callsBefore = harness.experimental_hostRpcCalls.length;

    await goIdle(harness, "thr_1");

    expect(harness.experimental_hostRpcCalls).toHaveLength(callsBefore);
    run.controller.abort();
  });

  it("makes no GitHub request for a PR that is merged on GitHub and on bb", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337, "merged") },
      host: pages(withPrState("MERGED")),
    });
    const run = harness.behavior.runService("pr-poller");
    await settle();

    await goIdle(harness, "thr_1");

    expect(overviewRefreshes(harness)).toHaveLength(1);
    run.controller.abort();
  });

  it("logs a warning and does not throw when bb cannot read the PR", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: { outcome: "unavailable", message: "gh is not signed in" } as PullRequestResult },
    });

    const { errors } = await harness.behavior.emitThreadEvent("thread.idle", {
      thread: makeThreadResponse({ id: "thr_1" }),
      lastAssistantText: null,
    });
    await settle();

    expect(errors).toEqual([]);
    expect(harness.logEntries).toContainEqual({
      level: "warn",
      message: "PR refresh on idle for thread thr_1 failed: gh is not signed in",
    });
  });

  it("does not try again after the plugin unloads during the wait", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      host: pages(),
    });

    await goIdle(harness, "thr_1");
    await harness.dispose();
    await advance(10_000);

    expect(harness.sdk.callsTo("environments.pullRequest")).toHaveLength(1);
  });
});

describe("prSummary metadata", () => {
  it("writes the summary to the metadata of every thread on the PR", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-24T10:00:00Z") });
    const harness = await setup({
      threads: [
        { id: "thr_1", environmentId: "env_1" },
        { id: "thr_2", environmentId: "env_2" },
      ],
      pullRequests: { env_1: linkedPr(25337), env_2: linkedPr(25337) },
      host: pages(),
    });
    const run = harness.behavior.runService("pr-poller");
    await settle();

    expect(metadataUpdates(harness)).toEqual(
      ["thr_1", "thr_2"].map((threadId) => ({
        threadId,
        pluginId: "github-insight",
        set: {
          prSummary: expect.objectContaining({
            version: 1,
            updatedAt: "2026-09-24T10:00:00.000Z",
            pr: { number: 25337, url: "https://github.com/collibra/frontend/pull/25337", state: "open" },
            error: null,
          }),
        },
      })),
    );
    run.controller.abort();
  });

  it("does not write when a refresh finds the same summary", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: pages(),
    });
    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    expect(metadataUpdates(harness)).toHaveLength(1);
  });

  it("writes the newer refresh time every 30 minutes when the data stays the same", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date"],
      now: new Date("2026-09-24T10:00:00Z"),
    });
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: pages(),
    });
    const run = harness.behavior.runService("pr-poller");
    await settle();

    await vi.advanceTimersByTimeAsync(29 * 60_000);
    await settle();
    expect(metadataUpdates(harness)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(60_000);
    await settle();
    expect(metadataUpdates(harness)).toHaveLength(2);
    expect(metadataUpdates(harness)[1]).toMatchObject({
      set: { prSummary: { updatedAt: "2026-09-24T10:30:00.000Z" } },
    });
    run.controller.abort();
  });

  it("keeps the last good data and sets the error when a refresh fails", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-24T10:00:00Z") });
    let host: (call: HostCall) => unknown = pages();
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: (call) => host(call),
    });
    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });
    vi.setSystemTime(new Date("2026-09-24T10:05:00Z"));
    host = () => failed({ kind: "rate_limited", resetAt: null });

    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    const [good, failing] = metadataUpdates(harness).map((update) => update.set?.prSummary);
    expect(failing).toEqual({ ...good, error: "rate limited" });
  });

  it("puts a fixed error text in the summary instead of raw gh output", async () => {
    let host: (call: HostCall) => unknown = pages();
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: (call) => host(call),
    });
    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });
    host = () => failed({ kind: "failed", message: "HTTP 502 from api.github.com" });

    const result = await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    expect(result).toMatchObject({ error: "HTTP 502 from api.github.com" });
    expect(metadataUpdates(harness)[1]?.set?.prSummary.error).toBe("refresh failed");
  });

  it("removes the old summary when the first refresh of a thread's new PR fails", async () => {
    const pullRequests: Record<string, PullRequestResult> = { env_1: linkedPr(1) };
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests,
      host: (call) =>
        (call.input as { number?: number }).number === 2
          ? failed({ kind: "gh_logged_out" })
          : pages()(call),
    });
    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });
    pullRequests.env_1 = linkedPr(2);

    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    expect(metadataUpdates(harness)[1]).toEqual({
      threadId: "thr_1",
      pluginId: "github-insight",
      remove: ["prSummary"],
    });
  });

  it("removes the summary once when bb no longer links a PR to the thread", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date"],
      now: new Date("2026-09-24T10:00:00Z"),
    });
    const pullRequests: Record<string, PullRequestResult> = { env_1: linkedPr(25337) };
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests,
      host: pages(),
    });
    const run = harness.behavior.runService("pr-poller");
    await settle();

    pullRequests.env_1 = { outcome: "absent" };
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    await settle();

    expect(metadataUpdates(harness).slice(1)).toEqual([
      { threadId: "thr_1", pluginId: "github-insight", remove: ["prSummary"] },
    ]);
    run.controller.abort();
  });

  it("removes the summary of a thread without an environment", async () => {
    const harness = await setup({ threads: [{ id: "thr_1", environmentId: null }] });

    const run = harness.behavior.runService("pr-poller");
    await settle();
    run.controller.abort();

    expect(metadataUpdates(harness)).toEqual([
      { threadId: "thr_1", pluginId: "github-insight", remove: ["prSummary"] },
    ]);
  });

  it("keeps the summary when bb cannot read the PR", async () => {
    const pullRequests: Record<string, PullRequestResult> = { env_1: linkedPr(25337) };
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests,
      host: pages(),
    });
    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });
    pullRequests.env_1 = { outcome: "unavailable", message: "gh not found" };

    await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    expect(metadataUpdates(harness)).toHaveLength(1);
  });

  it("still returns the insight when the metadata write fails", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host: pages(),
    });
    harness.sdk.stub("threads.updatePluginMetadata", async () => {
      throw new Error("HTTP 500");
    });

    const result = await harness.behavior.callRpc("refresh", { threadId: "thr_1" });

    expect(result).toMatchObject({ kind: "ok", error: null });
  });
});

function recordedReviewHost({ method }: HostCall) {
  if (method === "fetchPrFiles") return ok(prFiles);
  if (method === "fetchReviewThreads") return ok(reviewThreads);
  if (method === "fetchPrHead") return ok(prHeadResponse());
  throw new Error(`unexpected host call ${method}`);
}

const DRAFT_FILE = "apps/shell/e2e/utils/elements/createTreeGrid.ts";

function commentDraftRow(commitOid: string, line: number) {
  return { v: 1, path: DRAFT_FILE, side: "RIGHT", line, startLine: null, body: `Line ${line}`, commitOid, updatedAt: 1, source: "agent" };
}

describe("getReview", () => {

  it("reports no PR and makes no GitHub call when bb links no PR", async () => {
    const harness = await setup({ threads: [{ id: "thr_1", environmentId: "env_1" }] });

    const result = await harness.behavior.callRpc("getReview", { threadId: "thr_1" });

    expect(result).toEqual({ kind: "no_pr" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });

  it("reads the PR files and review threads through the thread's host", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25259) },
      host: recordedReviewHost,
    });

    await harness.behavior.callRpc("getReview", { threadId: "thr_1" });

    const pr = { owner: "collibra", repo: "frontend", number: 25259 };
    expect(harness.experimental_hostRpcCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "fetchPrFiles", hostId: "host-1", input: pr }),
        expect.objectContaining({
          method: "fetchReviewThreads",
          hostId: "host-1",
          input: { ...pr, after: null },
        }),
        expect.objectContaining({ method: "fetchPrHead", hostId: "host-1", input: pr }),
      ]),
    );
  });

  it("returns the files and places the threads on their lines", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25259) },
      host: recordedReviewHost,
    });

    const result = (await harness.behavior.callRpc("getReview", {
      threadId: "thr_1",
    })) as ReviewResult;

    if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
    expect(result.files.map((file) => file.path)).toEqual([
      "apps/shell/e2e/catalog/integrations/components/asset/generic-configuration/createDatabricksOutboundSyncConfigurationComponent.ts",
      "apps/shell/e2e/catalog/integrations/components/helpers/clickWithScrollHelper.ts",
      "apps/shell/e2e/utils/elements/createTreeGrid.ts",
    ]);
    expect(result.threads.placed.map(({ thread, lineNumber }) => [thread.id, lineNumber])).toEqual([
      ["PRRT_kwDOHI7l-86jxqt3", 151],
      ["PRRT_kwDOHI7l-86jxula", 46],
    ]);
    expect(result.threads.outdated.map((thread) => thread.id)).toEqual([
      "PRRT_kwDOHI7l-86jvKxS",
      "PRRT_kwDOHI7l-86jx0SN",
    ]);
  });

  it("returns the PR head, the comment drafts at the head and at an older commit, and the summary draft", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25259) },
      host: recordedReviewHost,
      kv: {
        "comment:collibra/frontend#25259:d_head": commentDraftRow("def456", 10),
        "comment:collibra/frontend#25259:d_old": commentDraftRow("abc123", 20),
        "comment:collibra/frontend#1:d_other": commentDraftRow("def456", 30),
        "summary:collibra/frontend#25259": { v: 1, body: "Two issues", updatedAt: 1, source: "agent" },
      },
    });

    const result = (await harness.behavior.callRpc("getReview", { threadId: "thr_1" })) as ReviewResult;

    if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
    expect(result.head).toEqual({
      prNodeId: "PR_kwDOUoz3mM8AAAABGSCovQ",
      oid: "def456",
      state: "OPEN",
      viewerIsAuthor: false,
    });
    expect(result.commentDrafts.map(({ id, commitOid }) => [id, commitOid])).toEqual([
      ["d_head", "def456"],
      ["d_old", "abc123"],
    ]);
    expect(result.summaryDraft).toEqual({ body: "Two issues", updatedAt: 1, source: "agent" });
  });

  it("returns no drafts when the PR has none", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25259) },
      host: recordedReviewHost,
    });

    const result = (await harness.behavior.callRpc("getReview", { threadId: "thr_1" })) as ReviewResult;

    expect(result).toMatchObject({ kind: "ok", commentDrafts: [], summaryDraft: null });
  });

  it.each(["fetchPrFiles", "fetchReviewThreads", "fetchPrHead"])(
    "names the gh failure when %s fails",
    async (failing) => {
      const harness = await setup({
        threads: [{ id: "thr_1", environmentId: "env_1" }],
        pullRequests: { env_1: linkedPr(25259) },
        host: (call) => (call.method === failing ? failed({ kind: "gh_logged_out" }) : recordedReviewHost(call)),
      });

      const result = await harness.behavior.callRpc("getReview", { threadId: "thr_1" });

      expect(result).toEqual({ kind: "error", message: "gh not logged in" });
    },
  );

  it("calls GitHub again on each load", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25259) },
      host: recordedReviewHost,
    });

    await harness.behavior.callRpc("getReview", { threadId: "thr_1" });
    await harness.behavior.callRpc("getReview", { threadId: "thr_1" });

    expect(harness.experimental_hostRpcCalls).toHaveLength(6);
  });
});

describe("reply and resolve", () => {
  const REVIEW_THREAD = "PRRT_kwDOHI7l-86jxula";
  const BODY = 'Fixed in "abc123"\nThanks';

  function replyResponse(state: "SUBMITTED" | "PENDING") {
    return ok({ data: { addPullRequestReviewThreadReply: { comment: { id: "PRRC_1", state } } } });
  }

  function writeHost(results: { reply?: unknown; resolve?: unknown } = {}) {
    const overview = pages();
    return (call: HostCall) => {
      if (call.method === "replyToThread") return results.reply ?? replyResponse("SUBMITTED");
      if (call.method === "setThreadResolved") return results.resolve ?? ok({ data: {} });
      if (call.method === "fetchOverviewPage" || call.method === "fetchCheckRunDetails") return overview(call);
      throw new Error(`unexpected host call ${call.method}`);
    };
  }

  function setupWithPr(host = writeHost()) {
    return setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25259) },
      host,
    });
  }

  function writes(harness: Awaited<ReturnType<typeof setup>>) {
    return harness.experimental_hostRpcCalls
      .filter(({ method }) => method === "replyToThread" || method === "setThreadResolved")
      .map(({ method, input, hostId }) => ({ method, input, hostId }));
  }

  it("posts the reply through the thread's host and makes no other write", async () => {
    const harness = await setupWithPr();

    const result = await harness.behavior.callRpc("reply", {
      threadId: "thr_1",
      reviewThreadId: REVIEW_THREAD,
      body: BODY,
      resolve: false,
    });

    expect(result).toEqual({ kind: "posted", pendingReviewUrl: null, resolveError: null });
    expect(writes(harness)).toEqual([
      { method: "replyToThread", input: { threadId: REVIEW_THREAD, body: BODY }, hostId: "host-1" },
    ]);
  });

  it("posts the reply and then resolves the thread on 'Post + resolve'", async () => {
    const harness = await setupWithPr();

    const result = await harness.behavior.callRpc("reply", {
      threadId: "thr_1",
      reviewThreadId: REVIEW_THREAD,
      body: BODY,
      resolve: true,
    });

    expect(result).toEqual({ kind: "posted", pendingReviewUrl: null, resolveError: null });
    expect(writes(harness).map(({ method, input }) => [method, input])).toEqual([
      ["replyToThread", { threadId: REVIEW_THREAD, body: BODY }],
      ["setThreadResolved", { threadId: REVIEW_THREAD, resolved: true }],
    ]);
  });

  it("reports a failed post and does not resolve", async () => {
    const harness = await setupWithPr(writeHost({ reply: failed({ kind: "failed", message: "Could not resolve to a node" }) }));

    const result = await harness.behavior.callRpc("reply", {
      threadId: "thr_1",
      reviewThreadId: REVIEW_THREAD,
      body: BODY,
      resolve: true,
    });

    expect(result).toEqual({ kind: "post_failed", message: "Could not resolve to a node" });
    expect(writes(harness).map(({ method }) => method)).toEqual(["replyToThread"]);
  });

  it("keeps the posted reply and reports the error when the resolve after it fails", async () => {
    const harness = await setupWithPr(writeHost({ resolve: failed({ kind: "gh_logged_out" }) }));

    const result = await harness.behavior.callRpc("reply", {
      threadId: "thr_1",
      reviewThreadId: REVIEW_THREAD,
      body: BODY,
      resolve: true,
    });

    expect(result).toEqual({ kind: "posted", pendingReviewUrl: null, resolveError: "gh not logged in" });
  });

  it("keeps the posted reply when the resolve after it throws", async () => {
    const harness = await setupWithPr(({ method }) => {
      if (method === "replyToThread") return replyResponse("SUBMITTED");
      throw new Error("host call timed out");
    });

    const result = await harness.behavior.callRpc("reply", {
      threadId: "thr_1",
      reviewThreadId: REVIEW_THREAD,
      body: BODY,
      resolve: true,
    });

    expect(result).toEqual({ kind: "posted", pendingReviewUrl: null, resolveError: expect.stringContaining("host call timed out") });
  });

  it("reports the reply as posted when GitHub's response has an unknown shape", async () => {
    const harness = await setupWithPr(writeHost({ reply: ok({ data: null }) }));

    const result = await harness.behavior.callRpc("reply", {
      threadId: "thr_1",
      reviewThreadId: REVIEW_THREAD,
      body: BODY,
      resolve: false,
    });

    expect(result).toEqual({ kind: "posted", pendingReviewUrl: null, resolveError: null });
  });

  it("links the PR when GitHub puts the reply in the user's pending review", async () => {
    const harness = await setupWithPr(writeHost({ reply: replyResponse("PENDING") }));

    const result = await harness.behavior.callRpc("reply", {
      threadId: "thr_1",
      reviewThreadId: REVIEW_THREAD,
      body: BODY,
      resolve: false,
    });

    expect(result).toEqual({
      kind: "posted",
      pendingReviewUrl: "https://github.com/collibra/frontend/pull/25259",
      resolveError: null,
    });
  });

  it("does not write when the thread has no PR", async () => {
    const harness = await setup({ threads: [{ id: "thr_1", environmentId: null }], host: writeHost() });

    const reply = await harness.behavior.callRpc("reply", {
      threadId: "thr_1",
      reviewThreadId: REVIEW_THREAD,
      body: BODY,
      resolve: true,
    });
    const resolve = await harness.behavior.callRpc("setResolved", {
      threadId: "thr_1",
      reviewThreadId: REVIEW_THREAD,
      resolved: true,
    });

    expect(reply).toEqual({ kind: "post_failed", message: "No pull request for this thread" });
    expect(resolve).toEqual({ kind: "error", message: "No pull request for this thread" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });

  it.each([true, false])("sets the thread resolved to %s", async (resolved) => {
    const harness = await setupWithPr();

    const result = await harness.behavior.callRpc("setResolved", {
      threadId: "thr_1",
      reviewThreadId: REVIEW_THREAD,
      resolved,
    });

    expect(result).toEqual({ kind: "ok" });
    expect(writes(harness)).toEqual([
      { method: "setThreadResolved", input: { threadId: REVIEW_THREAD, resolved }, hostId: "host-1" },
    ]);
  });

  it("writes the new PR summary before the resolve returns", async () => {
    const harness = await setupWithPr();

    await harness.behavior.callRpc("setResolved", {
      threadId: "thr_1",
      reviewThreadId: REVIEW_THREAD,
      resolved: true,
    });

    expect(metadataUpdates(harness)).toEqual([
      expect.objectContaining({ threadId: "thr_1", set: { prSummary: expect.objectContaining({ version: 1 }) } }),
    ]);
  });

  it("reads the PR again after the resolve when a refresh was already running", async () => {
    let releaseFirst: () => void = () => {};
    const write = writeHost();
    const harness = await setupWithPr((call) => {
      const firstPage = call.method === "fetchOverviewPage" && (call.input as { after: string | null }).after === null;
      if (!firstPage || overviewRefreshes(harness).length > 1) return write(call);
      return new Promise((resolve) => { releaseFirst = () => resolve(write(call)); });
    });
    const running = harness.behavior.callRpc("refresh", { threadId: "thr_1" });
    await settle();

    const resolving = harness.behavior.callRpc("setResolved", {
      threadId: "thr_1",
      reviewThreadId: REVIEW_THREAD,
      resolved: true,
    });
    await settle();
    releaseFirst();
    await Promise.all([running, resolving]);

    const refreshes = overviewRefreshes(harness);
    expect(harness.experimental_hostRpcCalls
      .filter((call) => call.method === "setThreadResolved" || refreshes.includes(call))
      .map((call) => call.method)).toEqual(["fetchOverviewPage", "setThreadResolved", "fetchOverviewPage"]);
  });

  it("writes the new PR summary before a post and resolve returns", async () => {
    const harness = await setupWithPr();

    await harness.behavior.callRpc("reply", {
      threadId: "thr_1",
      reviewThreadId: REVIEW_THREAD,
      body: BODY,
      resolve: true,
    });

    expect(metadataUpdates(harness)).toHaveLength(1);
  });

  it("reports a failed resolve", async () => {
    const harness = await setupWithPr(writeHost({ resolve: failed({ kind: "rate_limited", resetAt: null }) }));

    const result = await harness.behavior.callRpc("setResolved", {
      threadId: "thr_1",
      reviewThreadId: REVIEW_THREAD,
      resolved: true,
    });

    expect(result).toEqual({ kind: "error", message: "rate limited" });
  });
});

describe("drafts from the tab", () => {
  const REVIEW_THREAD = "PRRT_kwDOHI7l-86jxula";

  function reviewHost(reply: unknown = ok({ data: { addPullRequestReviewThreadReply: { comment: { id: "PRRC_1", state: "SUBMITTED" } } } })) {
    return ({ method }: HostCall) => {
      if (method === "fetchPrFiles" || method === "fetchReviewThreads" || method === "fetchPrHead") {
        return recordedReviewHost({ method, input: null });
      }
      if (method === "replyToThread") return reply;
      if (method === "setThreadResolved") return ok({ data: {} });
      throw new Error(`unexpected host call ${method}`);
    };
  }

  function setupWithPr(host = reviewHost()) {
    return setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25259) },
      host,
    });
  }

  async function draftsOf(harness: Awaited<ReturnType<typeof setup>>) {
    const result = (await harness.behavior.callRpc("getReview", { threadId: "thr_1" })) as ReviewResult;
    if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
    return result.drafts;
  }

  async function saveDraft(harness: Awaited<ReturnType<typeof setup>>, body: string) {
    return harness.behavior.callRpc("saveDraft", { threadId: "thr_1", reviewThreadId: REVIEW_THREAD, body });
  }

  async function post(harness: Awaited<ReturnType<typeof setup>>, resolve: boolean) {
    return harness.behavior.callRpc("reply", { threadId: "thr_1", reviewThreadId: REVIEW_THREAD, body: "Edited", resolve });
  }

  it("saves the edited text as the user's draft without a GitHub write or a review update", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_700_000_000_000);
    const harness = await setupWithPr();

    const result = await saveDraft(harness, "Edited");

    expect(result).toEqual({ kind: "ok" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
    expect(harness.realtimeSignals).toHaveLength(0);
    expect(await draftsOf(harness)).toEqual({
      [REVIEW_THREAD]: { body: "Edited", updatedAt: 1_700_000_000_000, source: "user" },
    });
  });

  it.each([false, true])("deletes the draft after a successful post (resolve: %s)", async (resolve) => {
    const harness = await setupWithPr();
    await saveDraft(harness, "Edited");

    await post(harness, resolve);

    expect(await draftsOf(harness)).toEqual({});
  });

  it("keeps the draft when the post fails", async () => {
    const harness = await setupWithPr(reviewHost(failed({ kind: "gh_logged_out" })));
    await saveDraft(harness, "Edited");

    await post(harness, false);

    expect(Object.keys(await draftsOf(harness))).toEqual([REVIEW_THREAD]);
  });

  it("discards the draft without a GitHub write and tells the open tab", async () => {
    const harness = await setupWithPr();
    await saveDraft(harness, "Edited");

    const result = await harness.behavior.callRpc("discardDraft", { threadId: "thr_1", reviewThreadId: REVIEW_THREAD });

    expect(result).toEqual({ kind: "ok" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
    expect(harness.realtimeSignals).toEqual([{ channel: "review.updated", payload: { threadId: "thr_1" } }]);
    expect(await draftsOf(harness)).toEqual({});
  });

  it("does not save or discard a draft when the thread has no PR", async () => {
    const harness = await setup({ threads: [{ id: "thr_1", environmentId: null }], host: reviewHost() });

    const saved = await saveDraft(harness, "Edited");
    const discarded = await harness.behavior.callRpc("discardDraft", { threadId: "thr_1", reviewThreadId: REVIEW_THREAD });

    expect(saved).toEqual({ kind: "error", message: "No pull request for this thread" });
    expect(discarded).toEqual({ kind: "error", message: "No pull request for this thread" });
  });
});

describe("comment and summary drafts from the tab", () => {
  const KV = {
    "comment:collibra/frontend#25259:d1": commentDraftRow("abc123", 10),
    "comment:collibra/frontend#25259:d2": commentDraftRow("abc123", 20),
  };

  function setupWithPr() {
    return setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25259) },
      host: recordedReviewHost,
      kv: KV,
    });
  }

  async function reviewOf(harness: Awaited<ReturnType<typeof setup>>) {
    const result = (await harness.behavior.callRpc("getReview", { threadId: "thr_1" })) as ReviewResult;
    if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
    return result;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_700_000_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves the edited body of a comment draft and keeps its anchor and commit", async () => {
    const harness = await setupWithPr();

    const result = await harness.behavior.callRpc("saveCommentDraft", { threadId: "thr_1", draftId: "d1", body: "Edited" });

    expect(result).toEqual({ kind: "ok" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
    expect((await reviewOf(harness)).commentDrafts[0]).toEqual({
      ...commentDraftRow("abc123", 10),
      v: undefined,
      id: "d1",
      body: "Edited",
      updatedAt: 1_700_000_000_000,
      source: "user",
    });
  });

  it("does not create a comment draft that is gone", async () => {
    const harness = await setupWithPr();

    const result = await harness.behavior.callRpc("saveCommentDraft", { threadId: "thr_1", draftId: "d9", body: "Edited" });

    expect(result).toEqual({ kind: "error", message: "Comment draft d9 is gone" });
    expect((await reviewOf(harness)).commentDrafts.map(({ id }) => id)).toEqual(["d1", "d2"]);
  });

  it("deletes a comment draft without a GitHub write and tells the open tab", async () => {
    const harness = await setupWithPr();

    const result = await harness.behavior.callRpc("deleteCommentDraft", { threadId: "thr_1", draftId: "d1" });

    expect(result).toEqual({ kind: "ok" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
    expect(harness.realtimeSignals).toEqual([{ channel: "review.updated", payload: { threadId: "thr_1" } }]);
    expect((await reviewOf(harness)).commentDrafts.map(({ id }) => id)).toEqual(["d2"]);
  });

  it("saves the summary draft as the user's", async () => {
    const harness = await setupWithPr();

    const result = await harness.behavior.callRpc("saveSummaryDraft", { threadId: "thr_1", body: "Looks good" });

    expect(result).toEqual({ kind: "ok" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
    expect((await reviewOf(harness)).summaryDraft).toEqual({
      body: "Looks good",
      updatedAt: 1_700_000_000_000,
      source: "user",
    });
  });

  it("does not publish a review update for an edit, so the tab does not load GitHub again on each key press", async () => {
    const harness = await setupWithPr();

    await harness.behavior.callRpc("saveCommentDraft", { threadId: "thr_1", draftId: "d1", body: "Edited" });
    await harness.behavior.callRpc("saveSummaryDraft", { threadId: "thr_1", body: "Looks good" });

    expect(harness.realtimeSignals).toHaveLength(0);
  });

  it("does not touch drafts when the thread has no PR", async () => {
    const harness = await setup({ threads: [{ id: "thr_1", environmentId: null }], kv: KV });
    const noPr = { kind: "error", message: "No pull request for this thread" };

    expect(await harness.behavior.callRpc("saveCommentDraft", { threadId: "thr_1", draftId: "d1", body: "x" })).toEqual(noPr);
    expect(await harness.behavior.callRpc("deleteCommentDraft", { threadId: "thr_1", draftId: "d1" })).toEqual(noPr);
    expect(await harness.behavior.callRpc("saveSummaryDraft", { threadId: "thr_1", body: "x" })).toEqual(noPr);
    expect(harness.realtimeSignals).toHaveLength(0);
  });
});

describe("submitReview", () => {
  const READS = new Set(["fetchPrFiles", "fetchReviewThreads", "fetchPrHead", "fetchOverviewPage", "fetchCheckRunDetails", "fetchReviewQueue"]);
  const DRAFTS = {
    "comment:collibra/frontend#25259:d1": commentDraftRow("abc123", 10),
    "comment:collibra/frontend#25259:d2": { ...commentDraftRow("abc123", 20), startLine: 18 },
    "comment:collibra/frontend#25259:d3": commentDraftRow("abc123", 30),
    "summary:collibra/frontend#25259": { v: 1, body: "Agent summary", updatedAt: 1, source: "agent" },
  };
  const SUBMITTED = ok({ data: { addPullRequestReview: { pullRequestReview: { id: "PRR_1", state: "APPROVED", url: "u" } } } });

  function submitHost(options: { head?: Parameters<typeof prHeadResponse>[0]; submit?: unknown } = {}) {
    const overview = pages();
    return (call: HostCall) => {
      if (call.method === "fetchPrHead") return ok(prHeadResponse(options.head));
      if (call.method === "submitReview") return options.submit ?? SUBMITTED;
      if (call.method === "fetchOverviewPage" || call.method === "fetchCheckRunDetails") return overview(call);
      return recordedReviewHost(call);
    };
  }

  function setupWithPr(host = submitHost(), kv: Record<string, unknown> = DRAFTS) {
    return setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25259) },
      host,
      kv,
    });
  }

  function writes(harness: Awaited<ReturnType<typeof setup>>) {
    return harness.experimental_hostRpcCalls
      .filter(({ method }) => !READS.has(method))
      .map(({ method, input, hostId }) => ({ method, input, hostId }));
  }

  async function reviewOf(harness: Awaited<ReturnType<typeof setup>>) {
    const result = (await harness.behavior.callRpc("getReview", { threadId: "thr_1" })) as ReviewResult;
    if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
    return result;
  }

  it("sends one review with the body, the verdict, and all comment drafts on the drafts' commit", async () => {
    const harness = await setupWithPr();

    const result = await harness.behavior.callRpc("submitReview", { threadId: "thr_1", event: "APPROVE", body: "Ship it" });

    expect(result).toEqual({ kind: "submitted" });
    expect(writes(harness)).toEqual([
      {
        method: "submitReview",
        hostId: "host-1",
        input: {
          pullRequestId: "PR_kwDOUoz3mM8AAAABGSCovQ",
          commitOid: "abc123",
          event: "APPROVE",
          body: "Ship it",
          threads: [
            { path: DRAFT_FILE, side: "RIGHT", line: 10, startLine: null, body: "Line 10" },
            { path: DRAFT_FILE, side: "RIGHT", line: 20, startLine: 18, body: "Line 20" },
            { path: DRAFT_FILE, side: "RIGHT", line: 30, startLine: null, body: "Line 30" },
          ],
        },
      },
    ]);
  });

  it("deletes the drafts, tells the open tab, and refreshes the PR tab after a submit", async () => {
    const harness = await setupWithPr();

    await harness.behavior.callRpc("submitReview", { threadId: "thr_1", event: "APPROVE", body: "Ship it" });

    expect(harness.realtimeSignals).toContainEqual({ channel: "review.updated", payload: { threadId: "thr_1" } });
    expect(metadataUpdates(harness)).toEqual([
      expect.objectContaining({ threadId: "thr_1", set: { prSummary: expect.objectContaining({ version: 1 }) } }),
    ]);
    expect(await reviewOf(harness)).toMatchObject({ commentDrafts: [], summaryDraft: null });
  });

  it("sends the review on the PR head when there are no comment drafts", async () => {
    const harness = await setupWithPr(submitHost(), {});

    const result = await harness.behavior.callRpc("submitReview", { threadId: "thr_1", event: "APPROVE", body: "" });

    expect(result).toEqual({ kind: "submitted" });
    expect(writes(harness).map(({ input }) => input)).toEqual([
      { pullRequestId: "PR_kwDOUoz3mM8AAAABGSCovQ", commitOid: "def456", event: "APPROVE", body: "", threads: [] },
    ]);
  });

  it("marks the PR reviewed at the submitted commit, so the next queue load tracks it", async () => {
    const harness = await setupWithPr(submitHost(), {});

    await harness.behavior.callRpc("submitReview", { threadId: "thr_1", event: "APPROVE", body: "" });
    await settle();

    expect(harness.experimental_hostRpcCalls.filter(({ method }) => method === "fetchReviewQueue").map(({ input }) => input)).toEqual([
      { tracked: [{ owner: "collibra", repo: "frontend", number: 25259 }] },
    ]);
  });

  it("keeps all drafts and names the GitHub error when the submit fails", async () => {
    const harness = await setupWithPr(submitHost({ submit: failed({ kind: "gh_logged_out" }) }));

    const result = await harness.behavior.callRpc("submitReview", { threadId: "thr_1", event: "COMMENT", body: "Notes" });

    expect(result).toEqual({ kind: "error", message: "gh not logged in", url: null });
    expect(harness.realtimeSignals).toHaveLength(0);
    const review = await reviewOf(harness);
    expect(review.commentDrafts).toHaveLength(3);
    expect(review.summaryDraft).toMatchObject({ body: "Agent summary" });
  });

  it("links the PR when the user has a pending review on GitHub", async () => {
    const pending = "GraphQL: User can only have one pending review per pull request (addPullRequestReview)";
    const harness = await setupWithPr(submitHost({ submit: failed({ kind: "failed", message: pending }) }));

    const result = await harness.behavior.callRpc("submitReview", { threadId: "thr_1", event: "COMMENT", body: "Notes" });

    expect(result).toEqual({
      kind: "error",
      message: "You have a pending review on GitHub. Submit or delete it there, then submit again.",
      url: "https://github.com/collibra/frontend/pull/25259",
    });
    expect(await reviewOf(harness)).toMatchObject({ commentDrafts: expect.arrayContaining([expect.anything()]) });
  });

  it.each([
    ["MERGED", "Pull request is merged"],
    ["CLOSED", "Pull request is closed"],
  ] as const)("rejects a submit on a %s PR without a GitHub write", async (state, message) => {
    const harness = await setupWithPr(submitHost({ head: { state } }));

    const result = await harness.behavior.callRpc("submitReview", { threadId: "thr_1", event: "COMMENT", body: "Notes" });

    expect(result).toEqual({ kind: "error", message, url: null });
    expect(writes(harness)).toEqual([]);
    expect((await reviewOf(harness)).commentDrafts).toHaveLength(3);
  });

  it("rejects Request changes without a body", async () => {
    const harness = await setupWithPr();

    const result = await harness.behavior.callRpc("submitReview", { threadId: "thr_1", event: "REQUEST_CHANGES", body: " " });

    expect(result).toEqual({ kind: "error", message: "Add a summary to request changes", url: null });
    expect(writes(harness)).toEqual([]);
  });

  it("rejects Approve on the viewer's own PR", async () => {
    const harness = await setupWithPr(submitHost({ head: { viewerDidAuthor: true } }));

    const result = await harness.behavior.callRpc("submitReview", { threadId: "thr_1", event: "APPROVE", body: "" });

    expect(result).toEqual({ kind: "error", message: "On your own pull request you can only comment", url: null });
    expect(writes(harness)).toEqual([]);
  });

  it("rejects a comment draft with an empty body", async () => {
    const harness = await setupWithPr(submitHost(), {
      "comment:collibra/frontend#25259:d1": { ...commentDraftRow("abc123", 10), body: "  " },
    });

    const result = await harness.behavior.callRpc("submitReview", { threadId: "thr_1", event: "COMMENT", body: "" });

    expect(result).toEqual({
      kind: "error",
      message: `Comment draft on ${DRAFT_FILE}:10 is empty. Add text or delete it.`,
      url: null,
    });
    expect(writes(harness)).toEqual([]);
  });

  it("rejects comment drafts on more than one commit", async () => {
    const harness = await setupWithPr(submitHost(), {
      "comment:collibra/frontend#25259:d1": commentDraftRow("abc123", 10),
      "comment:collibra/frontend#25259:d2": commentDraftRow("def456", 20),
    });

    const result = await harness.behavior.callRpc("submitReview", { threadId: "thr_1", event: "COMMENT", body: "" });

    expect(result).toEqual({
      kind: "error",
      message: "Comment drafts are on more than one commit (abc123, def456). Delete the older ones.",
      url: null,
    });
    expect(writes(harness)).toEqual([]);
  });

  it("reports the load error and makes no write when GitHub cannot be read", async () => {
    const harness = await setupWithPr((call) =>
      call.method === "fetchPrHead" ? failed({ kind: "gh_logged_out" }) : submitHost()(call),
    );

    const result = await harness.behavior.callRpc("submitReview", { threadId: "thr_1", event: "COMMENT", body: "x" });

    expect(result).toEqual({ kind: "error", message: "gh not logged in", url: null });
    expect(writes(harness)).toEqual([]);
  });

  it("does not write when the thread has no PR", async () => {
    const harness = await setup({ threads: [{ id: "thr_1", environmentId: null }], kv: DRAFTS });

    const result = await harness.behavior.callRpc("submitReview", { threadId: "thr_1", event: "COMMENT", body: "x" });

    expect(result).toEqual({ kind: "error", message: "No pull request for this thread", url: null });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });
});

function acmeApiPr(number: number): PullRequestResult {
  const linked = linkedPr(number);
  return { ...linked, pullRequest: { ...linked.pullRequest, url: `https://github.com/acme/api/pull/${number}` } };
}

describe("review queue", () => {
  it("reports loading before the first load and makes no GitHub call", async () => {
    const harness = await setup({ threads: [], host: () => ok(reviewQueue) });

    expect(await harness.behavior.callRpc("getReviewQueue", {})).toEqual({ kind: "loading" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });

  it("loads in the review-queue service, stores and publishes the view, and serves it", async () => {
    const harness = await setup({ threads: [], host: () => ok(reviewQueue) });

    const run = harness.behavior.runService("review-queue");
    await settle();
    run.controller.abort();

    expect(harness.experimental_hostRpcCalls.map((call) => call.method)).toEqual(["fetchReviewQueue"]);
    const stored = await harness.behavior.callRpc("getReviewQueue", {});
    expect(stored).toMatchObject({ kind: "ok" });
    expect(harness.realtimeSignals).toEqual([{ channel: "review-queue.updated", payload: stored }]);
    expect(harness.experimental_hostRpcCalls).toHaveLength(1);
  });

  it("serves the stored view after a plugin reload", async () => {
    const harness = await setup({ threads: [], host: () => ok(reviewQueue) });
    const loaded = await harness.behavior.callRpc("refreshReviewQueue", {});

    const reloaded = await harness.lifecycle.reload(plugin);

    expect(await reloaded.harness.behavior.callRpc("getReviewQueue", {})).toEqual(loaded);
  });

  it("fetches the queue on the primary host and links projects and threads", async () => {
    const harness = await setup({
      threads: [{ id: "thr_1", environmentId: "env_1", archivedAt: null, updatedAt: 1 }],
      pullRequests: { env_1: linkedPr(15) },
      projects: [{ id: "prj_api", kind: "standard", gitRemoteUrl: "git@github.com:Acme/API.git", updatedAt: 1 }],
      primaryHostId: "host-7",
      host: () => ok(reviewQueue),
    });

    const result = (await harness.behavior.callRpc("refreshReviewQueue", {})) as LoadedReviewQueue;

    expect(harness.experimental_hostRpcCalls).toEqual([
      expect.objectContaining({ method: "fetchReviewQueue", input: { tracked: [] }, hostId: "host-7" }),
    ]);
    if (result.kind !== "ok") throw new Error(result.message);
    const api = result.needsReview.find((group) => group.repo === "acme/api")!;
    expect(api.prs.map(({ number, projectIds, thread }) => ({ number, projectIds, thread }))).toEqual([
      { number: 15, projectIds: ["prj_api"], thread: null },
      { number: 12, projectIds: ["prj_api"], thread: null },
    ]);
  });

  it("links a hidden thread and the hidden review threads of this plugin, and fetches their PRs", async () => {
    const harness = await setup({
      threads: [
        { id: "thr_hidden", environmentId: "env_1", visibility: "hidden", updatedAt: 2 },
        {
          id: "thr_review",
          environmentId: "env_2",
          visibility: "hidden",
          originPluginId: "github-insight",
          createdAt: 5,
          updatedAt: 1,
          status: "idle",
        },
        { id: "thr_foreign", environmentId: null, visibility: "hidden", originPluginId: "other-plugin" },
      ],
      pullRequests: { env_1: acmeApiPr(15) },
      pluginMetadata: {
        thr_review: { "review-pr": { v: 1, repo: "acme/api", number: 12, title: "Add caching", url: "https://github.com/acme/api/pull/12" } },
        thr_foreign: { "review-pr": { v: 1, repo: "acme/api", number: 9, title: "x", url: "https://github.com/acme/api/pull/9" } },
      },
      projects: [{ id: "prj_api", kind: "standard", gitRemoteUrl: "git@github.com:Acme/API.git", updatedAt: 1 }],
      host: () => ok(reviewQueue),
    });

    const result = (await harness.behavior.callRpc("refreshReviewQueue", {})) as LoadedReviewQueue;

    if (result.kind !== "ok") throw new Error(result.message);
    const api = result.needsReview.find((group) => group.repo === "acme/api")!;
    expect(api.prs.map(({ number, thread }) => ({ number, thread }))).toEqual([
      { number: 15, thread: { id: "thr_hidden", status: "idle", isReviewThread: false } },
      { number: 12, thread: { id: "thr_review", status: "idle", isReviewThread: true } },
    ]);
    expect(harness.experimental_hostRpcCalls[0]!.input).toEqual({ tracked: [{ owner: "acme", repo: "api", number: 12 }] });
  });

  it("reports the gh failure text", async () => {
    const harness = await setup({ threads: [], host: () => failed({ kind: "gh_logged_out" }) });

    const result = await harness.behavior.callRpc("refreshReviewQueue", {});

    expect(result).toEqual({ kind: "error", message: "gh not logged in", lastGood: null });
  });

  it("reports no host available without a primary host", async () => {
    const harness = await setup({ threads: [], primaryHostId: null });

    const result = await harness.behavior.callRpc("refreshReviewQueue", {});

    expect(result).toEqual({ kind: "error", message: "No host available", lastGood: null });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });
});

describe("startReview", () => {
  const request = {
    projectId: "prj_api",
    providerId: "claude-code",
    model: "opus",
    reasoningLevel: "high",
    permissionMode: "default",
    executionInputSources: {},
    environment: { type: "host", hostId: "host-1", workspace: { type: "managed-worktree", baseBranch: { kind: "default" } } },
    input: [{ type: "text", text: "gh pr checkout 15", mentions: [] }],
  } as unknown as NewThreadRequest;
  const pr = { repo: "acme/api", number: 15, title: "Add rate limits", url: "https://github.com/acme/api/pull/15" };

  it("spawns a hidden thread from the composer request with the review-pr metadata", async () => {
    const spawned: unknown[] = [];
    const harness = await setup({
      threads: [],
      spawn: async (args) => {
        spawned.push(args);
        return makeThreadResponse({ id: "thr_review" });
      },
    });

    const result = await harness.behavior.callRpc("startReview", { pr, request });

    expect(spawned).toEqual([
      {
        ...request,
        visibility: "hidden",
        pluginMetadata: { "review-pr": { v: 1, ...pr } },
        origin: "plugin",
        originPluginId: "github-insight",
      },
    ]);
    expect(result).toEqual({ threadId: "thr_review" });
  });

  it("publishes the queue with the new thread on its PR row without a GitHub call", async () => {
    const harness = await setup({
      threads: [],
      host: () => ok(reviewQueue),
      spawn: async () => makeThreadResponse({ id: "thr_review" }),
    });
    await harness.behavior.callRpc("refreshReviewQueue", {});
    harness.sdk.stub("threads.list", async () => [
      makeThreadResponse({ id: "thr_review", originPluginId: "github-insight", visibility: "hidden" }),
    ]);
    harness.sdk.stub("threads.getPluginMetadata", async () => ({ "review-pr": { v: 1, ...pr } }));

    await harness.behavior.callRpc("startReview", { pr, request });
    await settle();

    expect(harness.experimental_hostRpcCalls).toHaveLength(1);
    const update = harness.realtimeSignals.at(-1)!.payload as LoadedReviewQueue;
    if (update.kind !== "ok") throw new Error(update.message);
    const row = update.needsReview.flatMap((group) => group.prs).find((pr) => pr.number === 15)!;
    expect(row.thread?.id).toBe("thr_review");
  });

  it("rejects when spawn fails", async () => {
    const harness = await setup({
      threads: [],
      spawn: async () => {
        throw new Error("project not found");
      },
    });

    await expect(harness.behavior.callRpc("startReview", { pr, request })).rejects.toThrow("project not found");
  });
});

describe("archiveReview", () => {
  const reviewPr = { v: 1, repo: "acme/api", number: 15, title: "Add rate limits", url: "https://github.com/acme/api/pull/15" };

  it("archives a thread with review-pr metadata", async () => {
    const harness = await setup({
      threads: [{ id: "thr_review", environmentId: null }],
      pluginMetadata: { thr_review: { "review-pr": reviewPr } },
    });

    const result = await harness.behavior.callRpc("archiveReview", { threadId: "thr_review" });

    expect(result).toEqual({ kind: "ok" });
    expect(harness.sdk.callsTo("threads.archive").map(([args]) => args)).toEqual([
      expect.objectContaining({ threadId: "thr_review" }),
    ]);
  });

  it("refuses a thread without review-pr metadata", async () => {
    const harness = await setup({
      threads: [{ id: "thr_other", environmentId: null }],
      pluginMetadata: { thr_other: { prSummary: {} } },
    });

    const result = await harness.behavior.callRpc("archiveReview", { threadId: "thr_other" });

    expect(result).toEqual({ kind: "error", message: "This thread is not a review thread" });
    expect(harness.sdk.callsTo("threads.archive")).toHaveLength(0);
  });
});

describe("runMergeAction", () => {
  const HEAD = pageOne.data.repository.pullRequest.headRefOid;

  const readyPage = {
    ...pageOne,
    data: {
      repository: {
        ...pageOne.data.repository,
        viewerDefaultMergeMethod: "SQUASH",
        squashMergeAllowed: true,
        pullRequest: {
          ...pageOne.data.repository.pullRequest,
          mergeStateStatus: "CLEAN",
          isMergeQueueEnabled: false,
        },
      },
    },
  };

  function mergeHost(merge: unknown = ok({ data: { mergePullRequest: { pullRequest: { state: "MERGED" } } } })) {
    const overview = pages(readyPage);
    return (call: HostCall) => (call.method === "mergePullRequest" ? merge : overview(call));
  }

  function setupWithPr(host = mergeHost()) {
    return setup({
      threads: [{ id: "thr_1", environmentId: "env_1" }],
      pullRequests: { env_1: linkedPr(25337) },
      host,
    });
  }

  function writes(method: string) {
    return (harness: Awaited<ReturnType<typeof setup>>) =>
      harness.experimental_hostRpcCalls
        .filter((call) => call.method === method)
        .map(({ input, hostId }) => ({ input, hostId }));
  }
  const merges = writes("mergePullRequest");
  const enqueues = writes("enqueuePullRequest");

  it("merges with the cached PR id and method through the thread's host and refreshes", async () => {
    const harness = await setupWithPr();
    await harness.behavior.callRpc("getInsight", { threadId: "thr_1" });

    const result = await harness.behavior.callRpc("runMergeAction", {
      threadId: "thr_1",
      action: "merge",
      expectedHeadOid: HEAD,
    });

    expect(result).toEqual({ kind: "ok" });
    expect(merges(harness)).toEqual([
      {
        input: { pullRequestId: "PR_kwDOHI7l-88AAAABEiddXg", mergeMethod: "SQUASH", expectedHeadOid: HEAD },
        hostId: "host-1",
      },
    ]);
    expect(overviewRefreshes(harness)).toHaveLength(2);
  });

  it("does not merge before the tab has read the PR", async () => {
    const harness = await setupWithPr();

    const result = await harness.behavior.callRpc("runMergeAction", {
      threadId: "thr_1",
      action: "merge",
      expectedHeadOid: HEAD,
    });

    expect(result).toEqual({ kind: "error", message: "Refresh the PR and try again." });
    expect(merges(harness)).toEqual([]);
  });

  it("gives the GitHub error when GitHub rejects the merge", async () => {
    const harness = await setupWithPr(
      mergeHost(failed({ kind: "failed", message: "Head branch was modified. Review and try the merge again." })),
    );
    await harness.behavior.callRpc("getInsight", { threadId: "thr_1" });

    const result = await harness.behavior.callRpc("runMergeAction", {
      threadId: "thr_1",
      action: "merge",
      expectedHeadOid: HEAD,
    });

    expect(result).toEqual({
      kind: "error",
      message: "Head branch was modified. Review and try the merge again.",
    });
  });

  it("reports the merge as done when the refresh after it fails", async () => {
    let merged = false;
    const overview = mergeHost();
    const harness = await setupWithPr((call) => {
      if (call.method === "mergePullRequest") merged = true;
      else if (merged) return failed({ kind: "failed", message: "HTTP 502" });
      return overview(call);
    });
    await harness.behavior.callRpc("getInsight", { threadId: "thr_1" });

    const result = await harness.behavior.callRpc("runMergeAction", {
      threadId: "thr_1",
      action: "merge",
      expectedHeadOid: HEAD,
    });

    expect(result).toEqual({ kind: "ok" });
    expect(overviewRefreshes(harness)).toHaveLength(2);
  });

  it("enqueues a ready merge queue PR with the cached PR id through the thread's host and refreshes", async () => {
    const overview = pages(readyToEnqueuePage);
    const harness = await setupWithPr((call) =>
      call.method === "enqueuePullRequest"
        ? ok({ data: { enqueuePullRequest: { mergeQueueEntry: { state: "QUEUED" } } } })
        : overview(call),
    );
    await harness.behavior.callRpc("getInsight", { threadId: "thr_1" });
    const { id, headRefOid } = readyToEnqueuePage.data.repository.pullRequest;

    const result = await harness.behavior.callRpc("runMergeAction", {
      threadId: "thr_1",
      action: "enqueue",
      expectedHeadOid: headRefOid,
    });

    expect(result).toEqual({ kind: "ok" });
    expect(enqueues(harness)).toEqual([
      { input: { pullRequestId: id, expectedHeadOid: headRefOid }, hostId: "host-1" },
    ]);
    expect(merges(harness)).toEqual([]);
    expect(overviewRefreshes(harness)).toHaveLength(2);
  });

  it("offers no CLI command that merges or enqueues", async () => {
    const harness = await setupWithPr();

    const help = await harness.behavior.runCli(["--help"]);

    expect(help.stdout).not.toMatch(/merge|enqueue/i);
    expect(merges(harness)).toEqual([]);
    expect(enqueues(harness)).toEqual([]);
  });
});
