// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { createStore, registerTasksApi } from "../../api/index.js";
import { tasksRpcContract } from "../../shared/contract.js";
import { TasksRefreshProvider } from "../../shell/refresh.js";
import { useTaskListMeta } from "./data.js";
import { TaskRow } from "./row.js";
import { LIST_PREFERENCE_STORAGE_KEY } from "./list-preference.js";

const disposers: (() => Promise<void>)[] = [];
beforeEach(() => {
  window.localStorage.clear();
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
});
afterEach(async () => {
  cleanup();
  for (const dispose of disposers.splice(0)) await dispose();
});
const url = "https://github.com/acme/bb/pull/42";
const clear = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  pr: { url, number: 42, state: "open" },
  checks: {
    failed: 0,
    running: 0,
    cancelled: 0,
    passed: 3,
    skipped: 0,
    failedNames: [],
  },
  reviewers: { pending: 0, approved: 1, changesRequested: 0, pendingNames: [] },
  blockers: [],
  mergeQueue: null,
  error: null,
  ...overrides,
});
function host(
  packet: unknown,
  integration: "present" | "absent" | "disabled" | "error" = "present",
  metadataError = false,
) {
  const reads: string[] = [];
  const sdk = {
    plugins: {
      list: async () => {
        reads.push("plugins");
        if (integration === "error") throw Error("offline");
        return {
          plugins:
            integration === "absent"
              ? []
              : [
                  {
                    id: "github-insight",
                    enabled: integration !== "disabled",
                    status: integration === "disabled" ? "disabled" : "running",
                  },
                ],
        };
      },
    },
    threads: {
      get: async ({ threadId }: { threadId: string }) => {
        reads.push(`thread:${threadId}`);
        return makeThreadResponse({
          id: threadId,
          environmentId: "env_shared",
          status: "error",
          archivedAt: 1,
        });
      },
      getPluginMetadata: async ({ threadId }: { threadId: string }) => {
        reads.push(`metadata:${threadId}`);
        if (metadataError) throw Error("offline");
        return { prSummary: packet };
      },
    },
    environments: {
      pullRequest: async () => {
        reads.push("environment");
        return {
          outcome: "available",
          pullRequest: {
            url,
            number: 42,
            state: "open",
            title: "Work",
            updatedAt: "2020-01-01T00:00:00Z",
          },
        };
      },
    },
  };
  const { bb, harness } = createFakePluginHost({ pluginId: "tasks", sdk });
  disposers.push(() => harness.lifecycle.dispose());
  const store = createStore(bb);
  const project = store.tasks.createProject({
    name: "Acceptance",
    prefix: "ACC",
    color: "blue",
  });
  const task = store.tasks.createTask({
    projectId: project.id,
    title: "Preserve workflow",
    status: "in_review",
  });
  for (const threadId of ["thr_a", "thr_b"])
    store.tasks.upsertTaskThread({
      taskId: task.id,
      threadId,
      title: threadId,
      presetName: "Worker",
      liveStatus: "working",
    });
  registerTasksApi(bb, store);
  const call = (method: string, input: unknown) =>
    harness.behavior.callRpc(method, input);
  return { harness, store, project, task, reads, call };
}

it.each([
  ["complete", {}, "present", false, true],
  ["absent integration", {}, "absent", false, false],
  ["disabled integration", {}, "disabled", false, false],
  ["detection failure", {}, "error", false, false],
  ["metadata read failure", {}, "present", true, false],
  ["missing metadata", null, "present", false, false],
  ["unsupported version", { version: 2 }, "present", false, false],
  ["malformed time", { updatedAt: "yesterday" }, "present", false, false],
  ["stale", { updatedAt: "2020-01-01T00:00:00Z" }, "present", false, false],
  ["refresh error", { error: "offline" }, "present", false, false],
  ["missing queue", { mergeQueue: undefined }, "present", false, false],
  [
    "unknown queue",
    { mergeQueue: { state: "FUTURE" } },
    "present",
    false,
    false,
  ],
  [
    "queued",
    { mergeQueue: { state: "queued", position: 1 } },
    "present",
    false,
    false,
  ],
  [
    "queue failed",
    { mergeQueue: { state: "failed", position: 1 } },
    "present",
    false,
    false,
  ],
  ["unknown blocker", { blockers: ["FUTURE"] }, "present", false, false],
  ["conflict", { blockers: ["conflicts"] }, "present", false, false],
  [
    "failed checks",
    {
      checks: {
        failed: 1,
        running: 0,
        cancelled: 0,
        passed: 3,
        skipped: 0,
        failedNames: ["unit"],
      },
    },
    "present",
    false,
    false,
  ],
  [
    "running checks",
    {
      checks: {
        failed: 0,
        running: 1,
        cancelled: 0,
        passed: 3,
        skipped: 0,
        failedNames: [],
      },
    },
    "present",
    false,
    false,
  ],
  [
    "cancelled checks",
    {
      checks: {
        failed: 0,
        running: 0,
        cancelled: 1,
        passed: 3,
        skipped: 0,
        failedNames: [],
      },
    },
    "present",
    false,
    false,
  ],
  [
    "review requested",
    { reviewDecision: "CHANGES_REQUESTED" },
    "present",
    false,
    false,
  ],
  [
    "review pending",
    { reviewDecision: "REVIEW_REQUIRED" },
    "present",
    false,
    false,
  ],
  ["unknown mergeability", { mergeable: "UNKNOWN" }, "present", false, false],
  ["missing counts", { checks: {} }, "present", false, false],
  [
    "contradictory names",
    {
      reviewers: {
        pending: 0,
        approved: 1,
        changesRequested: 0,
        pendingNames: ["koen"],
      },
    },
    "present",
    false,
    false,
  ],
] as const)(
  "end-to-end loader/RPC/reader/row/drill-down is honest for %s",
  async (_name, overrides, integration, metadataError, ready) => {
    const { task, store, call, reads, harness } = host(
      overrides === null ? null : clear(overrides),
      integration,
      metadataError,
    );
    const before = store.tasks.listTaskThreads(task.id);
    const onOpen = vi.fn();
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
          labelsById={new Map()}
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
          listTaskWorkStatus: (input) => call("listTaskWorkStatus", input),
        },
      },
    );
    const link = await slot.findByRole("link", {
      name: /Open GitHub PR acme\/bb #42/,
    });
    expect(link.textContent?.includes("Ready to merge")).toBe(ready);
    expect(
      slot.getByRole("button", { name: /Change status, currently In Review/ }),
    ).toBeTruthy();
    expect(
      slot.getByRole("button", { name: /Threads for/ }).textContent,
    ).toContain("All threads archived");
    expect(
      slot.getByRole("button", { name: /Threads for/ }).textContent,
    ).toContain("2 Failed");
    fireEvent.click(slot.getByRole("button", { name: /PR details/ }));
    const dialog = await slot.findByRole("dialog", {
      name: `PRs for ${task.key}`,
    });
    expect(
      within(dialog).getAllByRole("link", { name: /Open thread/ }),
    ).toHaveLength(2);
    if (integration === "absent")
      expect(dialog.textContent).toContain("GitHub Insight is not installed");
    if (_name === "unknown queue")
      expect(dialog.textContent).toContain("FUTURE");
    if (_name === "queue failed")
      expect(dialog.textContent).toContain("Queue failed");
    expect(onOpen).not.toHaveBeenCalled();
    expect(store.tasks.getTask(task.id)?.status).toBe("in_review");
    expect(store.tasks.listTaskThreads(task.id)).toEqual(before);
    expect(harness.realtimeSignals).toEqual([]);
    expect(reads.filter((r) => r === "plugins")).toHaveLength(1);
    expect(reads.filter((r) => r === "environment")).toHaveLength(1);
    expect(reads.filter((r) => r.startsWith("thread:"))).toHaveLength(2);
    expect(reads.filter((r) => r.startsWith("metadata:"))).toHaveLength(
      integration === "present" ? 2 : 0,
    );
  },
);

const app = await loadPluginApp(() => import("../../app.js"));
it.each(["all", "project", "active"])(
  "real %s list preserves filtered dimmed parents and visible children through the public RPC",
  async (scope) => {
    const { store, task, project, call } = host(
      clear({ blockers: ["conflicts", "behind", "unresolved_threads"] }),
    );
    const child = store.tasks.createTask({
      projectId: project.id,
      title: "Matching child",
      status: "todo",
      parentTaskId: task.id,
    });
    store.tasks.upsertTaskThread({
      taskId: child.id,
      threadId: "thr_a",
      title: "Shared",
      presetName: "Worker",
      liveStatus: "working",
    });
    const filters = {
      statuses: ["todo"],
      priorities: [],
      labelNames: [],
      dependency: null,
    };
    window.localStorage.setItem(
      LIST_PREFERENCE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        scopes: {
          all: { filters, sort: "manual" },
          active: { filters, sort: "manual" },
          [`project:${project.id}`]: { filters, sort: "manual" },
        },
      }),
    );
    const rpc = Object.fromEntries(
      [
        "listProjects",
        "listFolders",
        "listPresets",
        "sidebarSummary",
        "listLabels",
        "listTasks",
        "getTaskByKey",
        "listTaskWorkStatus",
      ].map((method) => [method, (input: unknown) => call(method, input)]),
    );
    const slot = renderSlot(
      app.navPanels[0]!,
      {
        subPath:
          scope === "project" ? project.id : scope === "active" ? "active" : "",
      },
      { rpc },
    );
    const childControl = await slot.findByRole("button", {
      name: new RegExp(`PR details for ${child.key}`),
    });
    const childRow = childControl.closest("[data-task-key]")!;
    const parentRow = slot
      .getByRole("button", { name: new RegExp(`PR details for ${task.key}`) })
      .closest("[data-task-key]")!;
    expect(parentRow.getAttribute("data-dimmed")).toBe("true");
    expect(childRow.getAttribute("data-dimmed")).toBeNull();
    for (const row of [parentRow, childRow])
      expect(
        within(row as HTMLElement).getByRole("link", { name: /Open GitHub PR/ })
          .textContent,
      ).toContain("Conflicts");
    fireEvent.click(childControl);
    const dialog = await slot.findByRole("dialog", {
      name: `PRs for ${child.key}`,
    });
    expect(dialog.textContent).toContain("Behind");
    expect(dialog.textContent).toContain("Unresolved comments");
    fireEvent.keyDown(dialog, { key: "o" });
    expect(slot.inspection.navigateCalls).toEqual([]);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(childControl));
    expect(
      slot.inspection.rpcCalls.filter((c) =>
        /listComments|listAttachments|update|archive|merge|review/i.test(
          c.method,
        ),
      ),
    ).toEqual([]);
    expect(store.tasks.getTask(task.id)?.status).toBe("in_review");
    expect(store.tasks.getTask(child.id)?.status).toBe("todo");
    expect(
      tasksRpcContract.listTaskWorkStatus.output.parse(
        await call("listTaskWorkStatus", { taskIds: [child.id] }),
      ).byTaskId[child.id]?.pullRequests.items,
    ).toHaveLength(1);
  },
);

it("integrates mixed attachments, multiple/shared PRs, archive/removal/failures and mounted updates with read-only lookup counts and global concurrency", async () => {
  let phase = 0,
    active = 0,
    peak = 0;
  const counts = { threads: 0, environments: 0, metadata: 0, plugins: 0 };
  const sdkRead = async <T,>(
    kind: keyof typeof counts,
    read: () => T,
  ): Promise<T> => {
    counts[kind]++;
    active++;
    peak = Math.max(peak, active);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2));
      return read();
    } finally {
      active--;
    }
  };
  const ids = [
    "conflict",
    "ready_a",
    "ready_b",
    "merged",
    "queue",
    "unknown",
    "stale",
    "error",
    "removed",
    "idle",
  ];
  const repo = (id: string) => (id.startsWith("ready") ? "ready" : id);
  const packet = (id: string) =>
    clear({
      pr: {
        url: `https://github.com/acme/${repo(id)}/pull/42`,
        number: 42,
        state: id === "merged" ? "merged" : "open",
      },
      updatedAt: ["merged", "stale"].includes(id)
        ? "2020-01-01T00:00:00Z"
        : new Date().toISOString(),
      blockers:
        id === "conflict" || (phase > 0 && id.startsWith("ready"))
          ? ["conflicts", "checks_failed", "unresolved_threads", "behind"]
          : [],
      mergeQueue:
        id === "queue"
          ? { state: "queued", position: 2 }
          : id === "unknown"
            ? { state: "FUTURE", position: 1 }
            : null,
    });
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks",
    sdk: {
      plugins: {
        list: () =>
          sdkRead("plugins", () => ({
            plugins: [
              { id: "github-insight", enabled: true, status: "running" },
            ],
          })),
      },
      threads: {
        get: ({ threadId }: { threadId: string }) =>
          sdkRead("threads", () => {
            const id = threadId.slice(4);
            if (id === "error") throw Error("offline");
            return makeThreadResponse({
              id: threadId,
              status:
                id === "conflict"
                  ? "error"
                  : id === "ready_a"
                    ? "active"
                    : "idle",
              archivedAt: id === "ready_a" ? null : 1,
              deletedAt: id === "removed" ? 1 : null,
              environmentId: id === "idle" ? null : `env_${repo(id)}`,
            });
          }),
        getPluginMetadata: ({ threadId }: { threadId: string }) =>
          sdkRead("metadata", () =>
            ["error", "removed", "idle"].includes(threadId.slice(4))
              ? {}
              : { prSummary: packet(threadId.slice(4)) },
          ),
      },
      environments: {
        pullRequest: ({ environmentId }: { environmentId: string }) =>
          sdkRead("environments", () => ({
            outcome: "available",
            pullRequest: {
              ...packet(environmentId.slice(4)).pr,
              title: environmentId,
              updatedAt: "2020-01-01T00:00:00Z",
            },
          })),
      },
    },
  });
  disposers.push(() => harness.lifecycle.dispose());
  const store = createStore(bb);
  const project = store.tasks.createProject({
    name: "Mixed",
    prefix: "MIX",
    color: "blue",
  });
  const mixed = store.tasks.createTask({
    projectId: project.id,
    title: "Mixed outcomes",
    status: "in_review",
  });
  const terminal = store.tasks.createTask({
    projectId: project.id,
    title: "Archived merged work",
    status: "in_review",
  });
  const shared = store.tasks.createTask({
    projectId: project.id,
    title: "Shared ready work",
    status: "todo",
  });
  for (const [task, attached] of [
    [mixed, ids],
    [terminal, ["merged"]],
    [shared, ["ready_a", "ready_b"]],
  ] as const)
    for (const id of attached)
      store.tasks.upsertTaskThread({
        taskId: task.id,
        threadId: `thr_${id}`,
        title: id,
        presetName: "Worker",
        liveStatus: "completed",
      });
  const tasks = [mixed, terminal, shared].map((task) => ({
    ...task,
    labelIds: [],
  }));
  const before = tasks.map((task) => store.tasks.listTaskThreads(task.id));
  registerTasksApi(bb, store);
  let latest: ReturnType<typeof useTaskListMeta>["data"];
  function Overview() {
    latest = useTaskListMeta(tasks, "all").data;
    return (
      <>
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            meta={latest?.get(task.id)}
            project={undefined}
            showProject={false}
            labelsById={new Map()}
            projectLabels={[]}
            onEdit={() => {}}
            onOpen={() => {
              throw Error("unexpected task open");
            }}
            pending={false}
            openMenu={null}
            onOpenMenuChange={() => {}}
          />
        ))}
      </>
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
        listTaskWorkStatus: (input) =>
          harness.behavior.callRpc("listTaskWorkStatus", input),
      },
    },
  );
  const control = await slot.findByRole("button", {
    name: /PRs for MIX-1: 6 PRs/,
  });
  expect(control.textContent).toContain("1 Conflicts");
  expect(control.textContent).toContain("2 lookups unavailable");
  expect(control.getAttribute("aria-label")).toContain("1 Ready to merge");
  expect(
    latest?.get(mixed.id)?.threads.find((t) => t.threadId === "thr_removed"),
  ).toMatchObject({ execution: "removed", archive: "unknown" });
  expect(
    slot.getByRole("link", { name: /Open GitHub PR acme\/ready #42/ })
      .textContent,
  ).toContain("Ready to merge");
  const terminalRow = slot
    .getByRole("link", { name: /Open GitHub PR acme\/merged #42/ })
    .closest("[data-task-key]")!;
  expect(terminalRow.textContent).toContain("All threads archived");
  expect(
    within(terminalRow as HTMLElement).getByRole("button", {
      name: /Change status, currently In Review/,
    }),
  ).toBeTruthy();
  expect(counts).toEqual({
    threads: 10,
    environments: 6,
    metadata: 10,
    plugins: 1,
  });
  expect(peak).toBe(8);
  fireEvent.click(control);
  const dialog = await slot.findByRole("dialog", { name: "PRs for MIX-1" });
  expect(
    within(dialog).getAllByRole("link", { name: /Open GitHub PR/ }),
  ).toHaveLength(6);
  expect(dialog.textContent).toContain("FUTURE");
  expect(dialog.textContent).toContain("Details stale");
  expect(dialog.textContent).toContain("Behind");
  expect(dialog.textContent).toContain("thr_ready_a");
  expect(dialog.textContent).toContain("thr_ready_b");
  fireEvent.keyDown(dialog, { key: "Escape" });
  phase++;
  await slot.behavior.emitRealtime("tasks:changed", {
    taskId: shared.id,
    projectId: project.id,
  });
  await waitFor(() => expect(counts.metadata).toBe(20));
  await waitFor(() =>
    expect(
      slot.getByRole("link", { name: /Open GitHub PR acme\/ready #42/ })
        .textContent,
    ).toContain("Conflicts"),
  );
  expect(counts).toEqual({
    threads: 20,
    environments: 12,
    metadata: 20,
    plugins: 2,
  });
  expect(tasks.map((task) => store.tasks.listTaskThreads(task.id))).toEqual(
    before,
  );
  expect(store.tasks.getTask(mixed.id)?.status).toBe("in_review");
  expect(store.tasks.getTask(terminal.id)?.status).toBe("in_review");
  expect(harness.realtimeSignals).toEqual([]);
});
