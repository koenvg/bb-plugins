import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { afterEach, expect, it, vi } from "vitest";
import { createStore, registerTasksApi } from "./index.js";
import { tasksRpcContract } from "../shared/contract.js";

import { primaryBucket } from "../views/list/pr-presentation.js";

function clearSummary(overrides: Record<string, unknown> = {}) {
  return summary({
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
    ...overrides,
  });
}

it("reports Ready through public RPC and presentation only with explicit complete fresh producer evidence", async () => {
  const { read } = setup({ thr_a: clearSummary() });
  const pr = (await read()).pullRequests.items[0]!;
  expect(pr).toMatchObject({
    details: "available",
    rich: { readiness: "ready" },
  });
  expect(primaryBucket(pr).label).toBe("Ready to merge");
});

it("withholds Ready from fresh metadata when the current environment PR association is unreadable", async () => {
  const { read, store, task, harness } = setup(
    { thr_a: clearSummary() },
    { host: async () => { throw Error("offline"); } },
  );
  const before = store.tasks.listTaskThreads(task.id);
  const result = await read();
  expect(result.pullRequests).toMatchObject({
    availability: "partial",
    unavailableThreadIds: ["thr_a"],
    items: [{
      url: URL,
      state: "open",
      threadIds: ["thr_a"],
      details: "incomplete",
      detailsReason: "association_unavailable",
      rich: { readiness: "unknown", checks: { passed: 3 } },
    }],
  });
  expect(primaryBucket(result.pullRequests.items[0]!).label).not.toContain("Ready");
  expect(store.tasks.getTask(task.id)?.status).toBe("in_review");
  expect(store.tasks.listTaskThreads(task.id)).toEqual(before);
  expect(harness.realtimeSignals).toEqual([]);
});

it("retains a known conflict when current association uncertainty suppresses Ready", async () => {
  const { read } = setup(
    { thr_a: clearSummary({ blockers: ["conflicts"] }) },
    { host: async () => { throw Error("offline"); } },
  );
  const pr = (await read()).pullRequests.items[0]!;
  expect(pr).toMatchObject({
    details: "incomplete",
    detailsReason: "association_unavailable",
    rich: { readiness: "blocked", conditions: ["conflicts"] },
  });
  expect(primaryBucket(pr).label).toBe("Conflicts");
});

it.each(["merged", "closed"] as const)(
  "preserves historical %s lifecycle/counts when the current association is unavailable",
  async (state) => {
    const { read } = setup(
      { thr_a: clearSummary({ pr: { url: URL, number: 42, state } }) },
      { host: async () => { throw Error("offline"); } },
    );
    const pr = (await read()).pullRequests.items[0]!;
    expect(pr).toMatchObject({
      state,
      details: "available",
      threadIds: ["thr_a"],
      rich: { checks: { passed: 3 } },
    });
    expect(primaryBucket(pr).label).toBe(state === "merged" ? "Merged" : "Closed");
  },
);

it.each([
  [{ mergeQueue: undefined }, "missing_prerequisites"],
  [{ mergeable: "UNKNOWN" }, "unsupported_conditions"],
  [{ mergeStateStatus: "UNKNOWN" }, "unsupported_conditions"],
  [{ reviewDecision: "FUTURE_DECISION" }, "unsupported_conditions"],
  [{ unresolvedThreads: -1 }, "unsupported_conditions"],
  [
    {
      checks: {
        failed: 0,
        running: 0,
        cancelled: 0,
        passed: 3,
        skipped: 0,
        failedNames: ["unit"],
      },
    },
    "contradictory_evidence",
  ],
  [
    {
      reviewers: {
        pending: 0,
        approved: 1,
        changesRequested: 0,
        pendingNames: ["koen"],
      },
    },
    "contradictory_evidence",
  ],
])(
  "suppresses Ready and exposes incomplete producer prerequisites %#",
  async (overrides, reason) => {
    const { read } = setup({ thr_a: clearSummary(overrides) });
    const pr = (await read()).pullRequests.items[0]!;
    expect(pr).toMatchObject({ details: "incomplete", detailsReason: reason });
    expect(primaryBucket(pr).label).not.toContain("Ready");
  },
);

it.each([
  [
    {
      blockers: [
        "conflicts",
        "behind",
        "unresolved_threads",
        "blocked",
        "checks_running",
        "review_required",
      ],
    },
    "Conflicts",
  ],
  [{ mergeable: "CONFLICTING", mergeStateStatus: "CLEAN" }, "Conflicts"],
  [{ reviewDecision: "CHANGES_REQUESTED" }, "Changes requested"],
  [{ mergeStateStatus: "BLOCKED" }, "Other merge blockers"],
  [{ unresolvedThreads: 2 }, "Unresolved comments"],
  [{ mergeStateStatus: "BEHIND" }, "Behind"],
])(
  "cross-checks producer decisions and codes while preserving every blocker %#",
  async (overrides, label) => {
    const { read } = setup({ thr_a: clearSummary(overrides) });
    const pr = (await read()).pullRequests.items[0]!;
    expect(primaryBucket(pr).label).toBe(label);
    expect(pr.rich?.readiness).not.toBe("ready");
    if (label === "Conflicts" && "blockers" in overrides)
      expect(pr.rich?.conditions).toEqual(
        expect.arrayContaining([
          "conflicts",
          "behind",
          "unresolved_threads",
          "blocked",
          "checks_running",
          "review_required",
        ]),
      );
  },
);

it.each([
  ["queued", "Queued"],
  ["awaiting_checks", "Queued, awaiting checks"],
  ["merging", "Queued, merging"],
  ["failed", "Queue failed"],
])(
  "retains additive %s queue activity despite an empty blockers array",
  async (state, label) => {
    const { read } = setup({
      thr_a: clearSummary({ mergeQueue: { position: 2, state } }),
    });
    const pr = (await read()).pullRequests.items[0]!;
    expect(pr).toMatchObject({
      details: "available",
      rich: { queue: { state, position: 2 } },
    });
    expect(primaryBucket(pr)).toMatchObject({
      label,
      problem: state === "failed",
    });
    expect(pr.rich?.readiness).toBe("blocked");
  },
);

it.each([
  [{ state: "queued", position: 2, newRule: "blocked" }, "Queued"],
  [{ state: "failed", position: "invalid" }, "Queue failed"],
  [{ state: "FUTURE", position: 2 }, "Open"],
  [{}, "Open"],
  [false, "Open"],
])(
  "preserves recognized queue cues and uninterpretable secondary evidence %#",
  async (queue, label) => {
    const { read } = setup({ thr_a: clearSummary({ mergeQueue: queue }) });
    const pr = (await read()).pullRequests.items[0]!;
    expect(pr).toMatchObject({
      details: "incomplete",
      detailsReason: "unsupported_queue",
    });
    expect(pr.rich?.queue?.reported).toBe(JSON.stringify(queue));
    expect(primaryBucket(pr).label).toBe(label);
    expect(pr.rich?.readiness).not.toBe("ready");
  },
);

it.each([
  [
    [
      "conflicts",
      "checks_failed",
      "changes_requested",
      "blocked",
      "checks_running",
      "review_required",
      "unresolved_threads",
      "behind",
    ],
    "Conflicts",
  ],
  [
    [
      "checks_failed",
      "changes_requested",
      "blocked",
      "checks_running",
      "review_required",
      "unresolved_threads",
      "behind",
    ],
    "Checks failing",
  ],
  [
    [
      "changes_requested",
      "blocked",
      "checks_running",
      "review_required",
      "unresolved_threads",
      "behind",
    ],
    "Changes requested",
  ],
  [
    [
      "blocked",
      "checks_running",
      "review_required",
      "unresolved_threads",
      "behind",
    ],
    "Other merge blockers",
  ],
  [
    ["checks_running", "review_required", "unresolved_threads", "behind"],
    "Checks running",
  ],
  [["review_required", "unresolved_threads", "behind"], "Awaiting review"],
  [["unresolved_threads", "behind"], "Unresolved comments"],
  [["behind"], "Behind"],
  [[], "Ready to merge"],
])(
  "selects exactly one deterministic primary while retaining simultaneous conditions %#",
  async (blockers, label) => {
    const { read } = setup({ thr_a: clearSummary({ blockers }) });
    const result = await read();
    expect(result.pullRequests.items).toHaveLength(1);
    expect(primaryBucket(result.pullRequests.items[0]!).label).toBe(label);
    expect(result.pullRequests.items[0]?.rich?.conditions).toEqual(
      expect.arrayContaining(blockers),
    );
  },
);

it.each(["draft", "merged", "closed"] as const)(
  "preserves %s lifecycle and never labels it Ready",
  async (state) => {
    const { read } = setup({
      thr_a: clearSummary({
        pr: { number: 42, url: URL, state },
        blockers: ["conflicts", "checks_failed"],
      }),
    });
    const pr = (await read()).pullRequests.items[0]!;
    expect(primaryBucket(pr).label).toBe(
      state === "draft"
        ? "Draft, conflicts"
        : state === "merged"
          ? "Merged"
          : "Closed",
    );
  },
);

it.each([false, true])(
  "does not let equal-time contradictory readiness evidence or an unreadable association certify readiness, partialRead=%s",
  async (partialRead) => {
    const { read } = setup(
      {
        thr_a: clearSummary(),
        thr_b: partialRead
          ? null
          : clearSummary({ blockers: ["checks_failed"] }),
      },
      partialRead
        ? {
            getMetadata: async (id) => {
              if (id === "thr_b") throw Error("offline");
              return { prSummary: clearSummary() };
            },
          }
        : {},
    );
    const pr = (await read()).pullRequests.items[0]!;
    expect(pr.threadIds).toEqual(expect.arrayContaining(["thr_a", "thr_b"]));
    expect(pr.details).not.toBe("available");
    expect(primaryBucket(pr).label).not.toContain("Ready");
  },
);
const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
  vi.useRealTimers();
});
const URL = "https://github.com/acme/bb/pull/42";
function summary(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    updatedAt: "2026-10-02T11:45:00Z",
    pr: { number: 42, url: URL, state: "open" },
    checks: {
      failed: 2,
      running: 1,
      cancelled: 0,
      passed: 3,
      skipped: 1,
      failedNames: ["unit", "lint"],
    },
    reviewers: {
      pending: 1,
      approved: 1,
      changesRequested: 1,
      pendingNames: ["koen"],
    },
    blockers: [
      "checks_failed",
      "checks_running",
      "review_required",
      "changes_requested",
    ],
    mergeQueue: null,
    error: null,
    ...overrides,
  };
}
function setup(
  metadata: Record<string, unknown> = { thr_a: summary() },
  options: {
    plugins?: () => Promise<unknown>;
    getMetadata?: (id: string) => Promise<unknown>;
    host?: (id: string) => Promise<unknown>;
  } = {},
) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  const plugins = vi.fn(
    options.plugins ??
      (async () => ({
        plugins: [{ id: "github-insight", enabled: true, status: "running" }],
      })),
  );
  const getMetadata = vi.fn(async ({ threadId }: { threadId: string }) =>
    options.getMetadata
      ? options.getMetadata(threadId)
      : { prSummary: metadata[threadId] },
  );
  const host = vi.fn(async ({ environmentId }: { environmentId: string }) =>
    options.host
      ? options.host(environmentId.slice(4))
      : {
          outcome: "available",
          pullRequest: {
            number: 42,
            url: URL,
            state: "open",
            title: "Work",
            updatedAt: "2026-10-02T11:00:00Z",
          },
        },
  );
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks",
    sdk: {
      plugins: { list: plugins },
      threads: {
        get: async ({ threadId }: { threadId: string }) =>
          makeThreadResponse({
            id: threadId,
            environmentId: `env_${threadId}`,
            archivedAt: 1,
          }),
        getPluginMetadata: getMetadata,
      },
      environments: { pullRequest: host },
    },
  });
  disposers.push(() => harness.lifecycle.dispose());
  const store = createStore(bb);
  const project = store.tasks.createProject({
    name: "Rich",
    prefix: "RCH",
    color: "blue",
  });
  const task = store.tasks.createTask({
    projectId: project.id,
    title: "Work",
    status: "in_review",
  });
  for (const threadId of Object.keys(metadata))
    store.tasks.upsertTaskThread({
      taskId: task.id,
      threadId,
      title: threadId,
      presetName: "Worker",
      liveStatus: "completed",
    });
  registerTasksApi(bb, store);
  const read = async (refresh?: {
    id: string;
    step: "start" | "continue" | "finish";
  }) =>
    tasksRpcContract.listTaskWorkStatus.output.parse(
      await harness.behavior.callRpc("listTaskWorkStatus", {
        taskIds: [task.id],
        ...(refresh ? { refresh } : {}),
      }),
    ).byTaskId[task.id]!;
  return { read, store, task, harness, plugins, getMetadata, host };
}

it("reads producer-shaped rich details for attached archived threads without mutating workflow, associations or external state", async () => {
  const { read, task, store, harness, getMetadata, plugins } = setup();
  const before = store.tasks.listTaskThreads(task.id);
  const result = await read();
  expect(result.pullRequests.items[0]).toMatchObject({
    state: "open",
    details: "available",
    rich: {
      refreshedAt: "2026-10-02T11:45:00Z",
      checks: { failed: 2, running: 1, passed: 3 },
      reviewers: { pending: 1, changesRequested: 1 },
      conditions: expect.arrayContaining([
        "checks_failed",
        "checks_running",
        "changes_requested",
        "review_required",
      ]),
    },
  });
  expect(result.threads[0]).toMatchObject({
    archive: "archived",
    execution: "idle",
  });
  expect(getMetadata).toHaveBeenCalledWith({
    threadId: "thr_a",
    pluginId: "github-insight",
  });
  expect(plugins).toHaveBeenCalledTimes(1);
  expect(store.tasks.getTask(task.id)?.status).toBe("in_review");
  expect(store.tasks.listTaskThreads(task.id)).toEqual(before);
  expect(harness.realtimeSignals).toEqual([]);
});

it.each(["open", "draft", "merged", "closed"] as const)(
  "ages archived %s details using metadata observation time, never host updatedAt",
  async (state) => {
    const { read } = setup(
      {
        thr_a: summary({
          updatedAt: "2020-01-01T00:00:00Z",
          pr: { number: 42, url: URL, state },
        }),
      },
      {
        host: async () => ({
          outcome: "available",
          pullRequest: {
            number: 42,
            url: URL,
            state,
            title: "Work",
            updatedAt: "2026-10-02T11:00:00Z",
          },
        }),
      },
    );
    expect((await read()).pullRequests.items[0]).toMatchObject({
      state,
      details: state === "open" || state === "draft" ? "stale" : "available",
      rich: { refreshedAt: "2020-01-01T00:00:00Z" },
    });
  },
);

it.each([
  [summary({ version: 2 }), "unavailable", "unsupported_version"],
  [summary({ updatedAt: "yesterday" }), "unavailable", "invalid_metadata"],
  [
    summary({ updatedAt: "2026-10-03T12:00:00Z" }),
    "unavailable",
    "invalid_metadata",
  ],
  [summary({ checks: { failed: -1 } }), "unavailable", "invalid_metadata"],
  [summary({ error: "GitHub offline" }), "unavailable", "refresh_error"],
  [
    summary({ blockers: ["future_rule", "checks_failed"] }),
    "incomplete",
    "unsupported_conditions",
  ],
  [
    summary({ mergeQueue: { state: "WAITING", extra: "unknown" } }),
    "incomplete",
    "unsupported_queue",
  ],
  [summary({ mergeQueue: {} }), "incomplete", "unsupported_queue"],
])(
  "keeps host lifecycle but never treats invalid or additive producer evidence as complete %#",
  async (packet, details, reason) => {
    const { read } = setup({ thr_a: packet });
    expect((await read()).pullRequests.items[0]).toMatchObject({
      url: URL,
      state: "open",
      details,
      detailsReason: reason,
    });
  },
);

it("uses newest same-PR evidence, retains all associations, and falls back to old valid terminal metadata when host is unreadable", async () => {
  const fresh = summary({
    updatedAt: "2026-10-02T11:55:00Z",
    checks: {
      failed: 0,
      running: 0,
      cancelled: 0,
      passed: 9,
      skipped: 0,
      failedNames: [],
    },
    blockers: [],
  });
  const { read } = setup({ thr_old: summary(), thr_new: fresh });
  expect((await read()).pullRequests.items).toEqual([
    expect.objectContaining({
      details: "available",
      threadIds: expect.arrayContaining(["thr_old", "thr_new"]),
      rich: expect.objectContaining({
        refreshedAt: "2026-10-02T11:55:00Z",
        checks: expect.objectContaining({ failed: 0, passed: 9 }),
      }),
    }),
  ]);
  const terminal = setup(
    {
      thr_a: summary({
        updatedAt: "2020-01-01T00:00:00Z",
        pr: { number: 42, url: URL, state: "merged" },
      }),
    },
    {
      host: async () => {
        throw new Error("offline");
      },
    },
  );
  expect((await terminal.read()).pullRequests).toMatchObject({
    availability: "partial",
    items: [
      expect.objectContaining({
        url: URL,
        state: "merged",
        details: "available",
      }),
    ],
    unavailableThreadIds: ["thr_a"],
  });
});

it.each([
  ["thr_old", "thr_bad", "thr_new"],
  ["thr_old", "thr_new", "thr_bad"],
  ["thr_bad", "thr_old", "thr_new"],
  ["thr_bad", "thr_new", "thr_old"],
  ["thr_new", "thr_old", "thr_bad"],
  ["thr_new", "thr_bad", "thr_old"],
])(
  "does not lose unorderable malformed rich evidence in attachment order %s %s %s",
  async (...order) => {
    const packets = {
      thr_old: summary({ updatedAt: "2026-10-02T11:00:00Z" }),
      thr_bad: summary({ updatedAt: "invalid" }),
      thr_new: summary({ updatedAt: "2026-10-02T11:55:00Z" }),
    };
    const { read } = setup(
      Object.fromEntries(
        order.map((id) => [id, packets[id as keyof typeof packets]]),
      ),
    );
    expect((await read()).pullRequests.items[0]).toMatchObject({
      state: "open",
      details: "unavailable",
      detailsReason: "conflict",
      threadIds: expect.arrayContaining(order),
    });
  },
);

it.each([
  [
    summary({ checks: { failed: -1 }, updatedAt: "2026-10-02T11:59:00Z" }),
    "unavailable",
  ],
  [
    summary({ checks: { failed: -1 }, updatedAt: "2026-10-02T10:00:00Z" }),
    "available",
  ],
  [
    summary({
      checks: {
        failed: 9,
        running: 1,
        cancelled: 0,
        passed: 3,
        skipped: 1,
        failedNames: [],
      },
    }),
    "unavailable",
  ],
])(
  "only decisive newer evidence supersedes malformed/conflicting details %#",
  async (other, details) => {
    const { read } = setup({ thr_a: summary(), thr_b: other });
    expect((await read()).pullRequests.items[0]?.details).toBe(details);
  },
);

it("uses newer lifecycle evidence but never applies details across an incompatible lifecycle or different current PR", async () => {
  const { read } = setup(undefined, {
    host: async () => ({
      outcome: "available",
      pullRequest: {
        number: 42,
        url: URL,
        title: "Merged",
        state: "merged",
        updatedAt: "2026-10-02T11:59:00Z",
      },
    }),
  });
  expect((await read()).pullRequests.items[0]).toMatchObject({
    state: "merged",
    details: "unavailable",
    detailsReason: "lifecycle_mismatch",
  });
  const newerMetadata = setup({
    thr_a: summary({ pr: { number: 42, url: URL, state: "draft" } }),
  });
  expect((await newerMetadata.read()).pullRequests.items[0]).toMatchObject({
    state: "draft",
    details: "available",
  });
  const different = setup(undefined, {
    host: async () => ({
      outcome: "available",
      pullRequest: {
        number: 42,
        url: "https://github.com/acme/other/pull/42",
        title: "Other",
        state: "open",
        updatedAt: "2026-10-02T11:59:00Z",
      },
    }),
  });
  expect((await different.read()).pullRequests.items).toEqual([
    expect.objectContaining({
      url: "https://github.com/acme/other/pull/42",
      details: "unavailable",
      detailsReason: "identity_mismatch",
    }),
  ]);
  const absent = setup(undefined, {
    host: async () => ({ outcome: "absent" }),
  });
  expect((await absent.read()).pullRequests).toEqual({
    availability: "available",
    items: [],
    unavailableThreadIds: [],
  });
});

it("keeps unresolved equal-time lifecycle conflicts unavailable", async () => {
  const { read } = setup({
    thr_a: summary(),
    thr_b: summary({ pr: { number: 42, url: URL, state: "merged" } }),
  });
  expect((await read()).pullRequests.items[0]).toMatchObject({
    state: "unknown",
    details: "unavailable",
    detailsReason: "conflict",
  });
});

it.each([
  [async () => ({ plugins: [] }), "integration_absent"],
  [
    async () => ({
      plugins: [{ id: "github-insight", enabled: false, status: "running" }],
    }),
    "integration_disabled",
  ],
  [
    async () => {
      throw new Error("permission");
    },
    "integration_error",
  ],
  [
    async () => ({
      plugins: [{ id: "github-insight", enabled: true, status: "error" }],
    }),
    "integration_error",
  ],
] as const)(
  "isolates optional integration availability failures %# and checks only once per refresh",
  async (plugins, reason) => {
    const {
      read,
      getMetadata,
      plugins: detection,
    } = setup(undefined, { plugins });
    const id = "00000000-0000-4000-8000-000000000001";
    for (const step of ["start", "continue", "finish"] as const)
      expect((await read({ id, step })).pullRequests.items[0]).toMatchObject({
        state: "open",
        details: "unavailable",
        detailsReason: reason,
      });
    expect(detection).toHaveBeenCalledTimes(1);
    expect(getMetadata).not.toHaveBeenCalled();
    await read({ id: "00000000-0000-4000-8000-000000000002", step: "start" });
    expect(detection).toHaveBeenCalledTimes(2);
  },
);

it("isolates metadata read failures, preserves known counts and re-reads failed/absent metadata next independent refresh", async () => {
  let failed = true;
  const { read, getMetadata, plugins } = setup(
    { thr_a: summary(), thr_b: summary(), thr_none: undefined },
    {
      getMetadata: async (id) => {
        if (id === "thr_b" && failed) throw new Error("offline");
        return { prSummary: id === "thr_none" ? undefined : summary() };
      },
    },
  );
  const id = "00000000-0000-4000-8000-000000000001";
  for (const step of ["start", "continue", "finish"] as const)
    expect((await read({ id, step })).pullRequests.items[0]).toMatchObject({
      details: "incomplete",
      detailsReason: "metadata_error",
      rich: { checks: { failed: 2 } },
      threadIds: expect.arrayContaining(["thr_a", "thr_b", "thr_none"]),
    });
  expect(getMetadata).toHaveBeenCalledTimes(3);
  expect(plugins).toHaveBeenCalledTimes(1);
  failed = false;
  expect((await read()).pullRequests.items[0]).toMatchObject({
    details: "available",
  });
  expect(getMetadata).toHaveBeenCalledTimes(6);
  expect(plugins).toHaveBeenCalledTimes(2);
});

it("bounds combined thread/environment/metadata retention at 4096 with explicit rich overflow, fixed expiry, early release and next-refresh recovery", async () => {
  const packets = Object.fromEntries(
    Array.from({ length: 1400 }, (_, i) => [`thr_${i}`, summary()]),
  );
  const { read, getMetadata, plugins } = setup(packets);
  const id = "00000000-0000-4000-8000-000000000001";
  const first = await read({ id, step: "start" });
  expect(getMetadata).toHaveBeenCalledTimes(1296); // 1400 threads + 1400 environments + 1296 summaries.
  expect(first.pullRequests.items[0]).toMatchObject({
    details: "incomplete",
    detailsReason: "budget_exceeded",
    threadIds: expect.arrayContaining(["thr_0", "thr_1399"]),
  });
  expect(first.pullRequests.items[0]?.threadIds).toHaveLength(1400);
  await read({ id, step: "continue" });
  expect(getMetadata).toHaveBeenCalledTimes(1296);
  expect(plugins).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60_000);
  expect((await read({ id, step: "continue" })).availability).toBe(
    "unavailable",
  );
  expect(getMetadata).toHaveBeenCalledTimes(1296);
  expect((await read()).pullRequests.items[0]?.details).toBe("available");
  expect(getMetadata).toHaveBeenCalledTimes(2696);
  const other = "00000000-0000-4000-8000-000000000002";
  await read({ id: other, step: "start" });
  await read({ id: other, step: "finish" });
  expect((await read({ id: other, step: "continue" })).availability).toBe(
    "unavailable",
  );
  expect(vi.getTimerCount()).toBe(0);
});

it("shares the global eight-read SDK concurrency limit with optional detection and metadata across simultaneous refreshes", async () => {
  let active = 0,
    peak = 0,
    calls = 0;
  const releases: (() => void)[] = [];
  const pause = async () => {
    calls++;
    peak = Math.max(peak, ++active);
    await new Promise<void>((resolve) => releases.push(resolve));
    active--;
  };
  const { read } = setup(
    Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`thr_${i}`, summary()]),
    ),
    {
      plugins: async () => {
        await pause();
        return {
          plugins: [{ id: "github-insight", enabled: true, status: "running" }],
        };
      },
      host: async () => {
        await pause();
        return {
          outcome: "available",
          pullRequest: {
            url: URL,
            number: 42,
            state: "open",
            title: "Work",
            updatedAt: "2026-10-02T11:00:00Z",
          },
        };
      },
      getMetadata: async () => {
        await pause();
        return { prSummary: summary() };
      },
    },
  );
  let done = false;
  const both = Promise.all([
    read({ id: "00000000-0000-4000-8000-000000000001", step: "start" }),
    read({ id: "00000000-0000-4000-8000-000000000002", step: "start" }),
  ]).then(() => {
    done = true;
  });
  while (!done) {
    releases.splice(0).forEach((resolve) => resolve());
    await vi.advanceTimersByTimeAsync(0);
  }
  await both;
  expect(calls).toBe(50);
  expect(peak).toBe(8);
});
