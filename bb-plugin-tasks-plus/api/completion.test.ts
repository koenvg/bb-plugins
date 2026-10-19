import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it } from "vitest";
import { createStore } from ".";
import plugin from "../server";

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (disposers.length) await disposers.pop()!();
});

type Lookup = Awaited<ReturnType<BbPluginApi["sdk"]["environments"]["pullRequest"]>>;
function pullRequest(state: "open" | "draft" | "merged" | "closed") {
  return {
    outcome: "available",
    pullRequest: {
      number: 321,
      url: "https://github.com/acme/bb/pull/321",
      title: "Completion guard",
      state,
      baseRefName: "main",
      headRefName: "fix/completion",
      updatedAt: "2026-10-19T10:00:00.000Z",
      checks: { state: "passing", totalCount: 1, passedCount: 1, failedCount: 0, pendingCount: 0 },
      review: { state: "none", reviewRequestCount: 0 },
      mergeability: { state: "mergeable", mergeStateStatus: null, mergeable: null },
      attention: "none",
      autoMerge: false,
      inMergeQueue: false,
    },
  } satisfies Lookup;
}

async function setup(lookup: Lookup = pullRequest("open")) {
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks",
    sdk: {
      threads: {
        get: async ({ threadId }) =>
          makeThreadResponse({ id: threadId, environmentId: "env_work", archivedAt: 1 }),
      },
      environments: { pullRequest: async () => lookup },
    },
  });
  disposers.push(() => harness.dispose());
  await plugin(bb);
  const store = createStore(bb);
  const project = store.tasks.createProject({ name: "Completion", prefix: "CMP", color: "blue" });
  const task = store.tasks.createTask({
    projectId: project.id,
    title: "Original",
    status: "in_review",
  });
  const attach = (threadId: string) =>
    store.tasks.upsertTaskThread({
      taskId: task.id,
      threadId,
      title: "Worker",
      presetName: "Attached",
      liveStatus: "completed",
    });
  attach("thr_work");
  return { harness, store, task, project, attach };
}

const openError = {
  code: "task_pr_open",
  message:
    "CMP-1 has an open or draft pull request: https://github.com/acme/bb/pull/321. Use in_review until it is merged or closed.",
};

describe("task completion PR gate", () => {
  for (const method of ["updateTask", "boardMove"] as const) {
    it.each(["open", "draft"] as const)(
      `blocks %s PR completion through ${method} without writes`,
      async (state) => {
        const { harness, store, task, project } = await setup(pullRequest(state));
        const before = store.tasks.getTask(task.id);
        const signalsBefore = harness.inspection.realtimeSignals.length;
        const extra = method === "updateTask" ? { title: "Must not save", priority: "urgent" } : {};
        expect(
          await harness.behavior.callRpc(method, { taskId: task.id, status: "done", ...extra }),
        ).toEqual({
          ok: false,
          error: openError,
        });
        expect(store.tasks.getTask(task.id)).toEqual(before);
        expect(harness.inspection.realtimeSignals.slice(signalsBefore)).toEqual([]);
        expect(await harness.behavior.callRpc("sidebarSummary", null)).toEqual({
          projects: [{ projectId: project.id, taskCount: 1, activeAgentCount: 0 }],
        });
      },
    );

    it.each(["merged", "closed", "absent"] as const)(
      `allows %s PR completion through ${method}`,
      async (state) => {
        const { harness, store, task } = await setup(
          state === "absent" ? { outcome: "absent" } : pullRequest(state),
        );
        expect(
          await harness.behavior.callRpc(method, { taskId: task.id, status: "done" }),
        ).toMatchObject({
          ok: true,
          task: { id: task.id, status: "done" },
        });
        expect(store.tasks.getTask(task.id)?.status).toBe("done");
      },
    );

    it(`blocks unavailable lookup through ${method} and permits in_review`, async () => {
      const { harness, store, task } = await setup({
        outcome: "unavailable",
        message: "GitHub offline",
      });
      expect(await harness.behavior.callRpc(method, { taskId: task.id, status: "done" })).toEqual({
        ok: false,
        error: {
          code: "task_pr_unavailable",
          message:
            "Cannot verify pull requests for CMP-1. Retry the lookup or use in_review; done requires a successful lookup for every attached thread.",
        },
      });
      expect(store.tasks.getTask(task.id)?.status).toBe("in_review");
      expect(
        await harness.behavior.callRpc(method, { taskId: task.id, status: "in_review" }),
      ).toMatchObject({
        ok: true,
        task: { status: "in_review" },
      });
    });
  }

  it("rejects CLI done in text and JSON, without saving labels, blockers, or fields", async () => {
    const { harness, store, task, project } = await setup();
    const label = store.tasks.createLabel({ projectId: project.id, name: "Guard", color: "blue" });
    const downstream = store.tasks.createTask({ projectId: project.id, title: "Downstream" });
    store.tasks.addTaskDependency(task.id, downstream.id);
    const before = store.tasks.getTask(task.id);
    for (const json of [false, true]) {
      const result = await harness.behavior.runCli([
        "update",
        task.key,
        "--status",
        "done",
        "--title",
        "Must not save",
        "--add-label",
        label.name,
        "--unblocked-by",
        downstream.key,
        ...(json ? ["--json"] : []),
      ]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(openError.message);
      if (json) expect(JSON.parse(result.stdout)).toEqual({ ok: false, error: openError });
      expect(store.tasks.getTask(task.id)).toEqual(before);
      expect(store.tasks.listBlockedTasks(task.id).map((t) => t.key)).toEqual([downstream.key]);
      expect(store.taskLabelIds([task.id]).get(task.id)).toEqual([]);
    }
    expect(
      await harness.behavior.runCli(["update", task.key, "--status", "in_review", "--json"]),
    ).toMatchObject({ exitCode: 0 });
  });

  it("does not let a merged PR or failed second lookup hide another open PR", async () => {
    const { harness, task, attach } = await setup(pullRequest("merged"));
    attach("thr_open");
    attach("thr_failed");
    harness.sdk.stub("threads.get", async ({ threadId }) => {
      if (threadId === "thr_failed") throw new Error("offline");
      return makeThreadResponse({
        id: threadId,
        environmentId: threadId === "thr_open" ? "env_open" : "env_work",
      });
    });
    harness.sdk.stub("environments.pullRequest", async ({ environmentId }) =>
      environmentId === "env_open"
        ? {
            ...pullRequest("open"),
            pullRequest: {
              ...pullRequest("open").pullRequest,
              number: 322,
              url: "https://github.com/acme/bb/pull/322",
            },
          }
        : pullRequest("merged"),
    );
    expect(
      await harness.behavior.callRpc("updateTask", { taskId: task.id, status: "done" }),
    ).toMatchObject({
      ok: false,
      error: { code: "task_pr_open", message: expect.stringContaining("/pull/322") },
    });
  });

  it("rechecks after an open PR merges rather than using an earlier result", async () => {
    const { harness, store, task } = await setup();
    expect(
      await harness.behavior.callRpc("updateTask", { taskId: task.id, status: "done" }),
    ).toMatchObject({ ok: false });
    harness.sdk.stub("environments.pullRequest", async () => pullRequest("merged"));
    expect(
      await harness.behavior.callRpc("updateTask", { taskId: task.id, status: "done" }),
    ).toMatchObject({
      ok: true,
      task: { status: "done" },
    });
    expect(store.tasks.getTask(task.id)?.status).toBe("done");
  });

  it.each(["thread", "environment"] as const)("blocks a thrown %s lookup", async (boundary) => {
    const { harness, task } = await setup();
    harness.sdk.stub(
      boundary === "thread" ? "threads.get" : "environments.pullRequest",
      async () => {
        throw new Error("offline");
      },
    );
    expect(
      await harness.behavior.callRpc("updateTask", { taskId: task.id, status: "done" }),
    ).toMatchObject({
      ok: false,
      error: { code: "task_pr_unavailable" },
    });
  });

  it("allows unattached tasks and confirmed threads without environments", async () => {
    const { harness, store, task, project } = await setup();
    const unattached = store.tasks.createTask({ projectId: project.id, title: "Report only" });
    expect(
      await harness.behavior.callRpc("updateTask", { taskId: unattached.id, status: "done" }),
    ).toMatchObject({
      ok: true,
      task: { status: "done" },
    });
    harness.sdk.stub("threads.get", async ({ threadId }) =>
      makeThreadResponse({ id: threadId, environmentId: null }),
    );
    expect(
      await harness.behavior.callRpc("boardMove", { taskId: task.id, status: "done" }),
    ).toMatchObject({
      ok: true,
      task: { status: "done" },
    });
  });

  it("does not query PRs for ordinary field edits or non-done status changes", async () => {
    const { harness, store, task } = await setup();
    const callsBefore = harness.sdk.calls.length;
    expect(
      await harness.behavior.callRpc("updateTask", {
        taskId: task.id,
        title: "Edited",
        status: "in_progress",
      }),
    ).toMatchObject({
      ok: true,
      task: { title: "Edited", status: "in_progress" },
    });
    expect(store.tasks.getTask(task.id)?.title).toBe("Edited");
    expect(harness.sdk.calls.slice(callsBefore)).toEqual([]);
  });
});
