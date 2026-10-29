import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it } from "vitest";
import { createStore } from ".";
import type { TaskStatus, TaskStatusTransition } from "../db";
import plugin from "../server";
import { mockPrStatusRpc } from "../test-fixtures";

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (disposers.length) await disposers.pop()!();
});

async function setup() {
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks",
    sdk: {
      threads: {
        spawn: async () => ({ id: "thr_worker" }),
        get: async ({ threadId }) => makeThreadResponse({ id: threadId, status: "idle" }),
      },
    },
  });
  disposers.push(() => harness.dispose());
  await plugin(bb);
  const db = bb.storage.database();
  const store = createStore(bb);
  const project = store.tasks.createProject({
    name: "Transitions",
    prefix: "TRN",
    color: "blue",
    linkedBbProjectId: "proj_fixture",
  });
  const task = (status: TaskStatus = "backlog", createdByThreadId?: string) =>
    store.tasks.createTask({ projectId: project.id, title: "Original", status, createdByThreadId });
  const rows = () =>
    db
      .prepare<[], TaskStatusTransition>(`SELECT id, task_id AS taskId,
    from_status AS fromStatus, to_status AS toStatus, changed_at AS changedAt
    FROM task_status_transitions ORDER BY id`)
      .all();
  const preset = () =>
    store.tasks.createPreset({
      name: "Fixture worker",
      providerId: "claude-code",
      modelId: "claude-sonnet-5",
      reasoningLevel: "high",
      serviceTier: null,
      permissionMode: "full",
      environmentKind: "project-default",
      baseBranch: null,
      machineId: null,
      instructions: "",
    });
  return { bb, harness, db, store, project, task, rows, preset };
}

type Fixture = Awaited<ReturnType<typeof setup>>;
function expectRows(f: Fixture, expected: Array<[string, TaskStatus, TaskStatus]>) {
  const rows = f.rows();
  expect(rows).toEqual(
    expected.map(([taskId, fromStatus, toStatus], index) => ({
      id: index + 1,
      taskId,
      fromStatus,
      toStatus,
      changedAt: rows[index]?.changedAt,
    })),
  );
  for (const row of rows)
    expect(row.changedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
}

describe("status history through public RPC and SDK CLI fixtures", () => {
  for (const method of ["updateTask", "boardMove"] as const) {
    it(`${method} persists transitions and excludes same-status retries`, async () => {
      const f = await setup();
      const task = f.task("todo");
      for (const status of ["in_progress", "in_review", "done", "done", "todo"] as const) {
        expect(await f.harness.behavior.callRpc(method, { taskId: task.id, status })).toMatchObject(
          {
            ok: true,
            task: { id: task.id, status },
          },
        );
      }
      expectRows(f, [
        [task.id, "todo", "in_progress"],
        [task.id, "in_progress", "in_review"],
        [task.id, "in_review", "done"],
        [task.id, "done", "todo"],
      ]);
    });

    it(`${method} records nothing for creator refusal and records a successful retry after archive`, async () => {
      const f = await setup();
      const task = f.task("backlog", "thr_creator");
      const before = f.store.tasks.getTask(task.id);
      expect(
        await f.harness.behavior.callRpc(method, { taskId: task.id, status: "todo" }),
      ).toMatchObject({
        ok: false,
        error: { code: "creator_thread_open" },
      });
      expect(f.store.tasks.getTask(task.id)).toEqual(before);
      expectRows(f, []);
      f.harness.sdk.stub("threads.get", async ({ threadId }) =>
        makeThreadResponse({ id: threadId, archivedAt: 1 }),
      );
      expect(
        await f.harness.behavior.callRpc(method, { taskId: task.id, status: "todo" }),
      ).toMatchObject({
        ok: true,
        task: { status: "todo", createdByThreadId: "thr_creator" },
      });
      expectRows(f, [[task.id, "backlog", "todo"]]);
    });

    it(`${method} excludes rejected completion and records only the successful retry`, async () => {
      const f = await setup();
      const task = f.task("in_review");
      f.store.tasks.upsertTaskThread({
        taskId: task.id,
        threadId: "thr_worker",
        title: "Worker",
        presetName: "Fixture",
        liveStatus: "completed",
      });
      f.harness.sdk.stub("threads.get", async ({ threadId }) =>
        makeThreadResponse({ id: threadId, environmentId: "env_work" }),
      );
      f.harness.sdk.stub(
        "plugins.callRpc",
        mockPrStatusRpc(async () => ({
          outcome: "available",
          pullRequest: {
            number: 347,
            url: "https://github.com/acme/tasks/pull/347",
            title: "Work",
            state: "open",
            baseRefName: "main",
            headRefName: "work",
            updatedAt: "2026-01-01T00:00:00.000Z",
            checks: {
              state: "passing",
              totalCount: 1,
              passedCount: 1,
              failedCount: 0,
              pendingCount: 0,
            },
            review: { state: "none", reviewRequestCount: 0 },
            mergeability: { state: "mergeable", mergeStateStatus: null, mergeable: null },
            attention: "none",
            autoMerge: false,
            inMergeQueue: false,
          },
        })),
      );
      const before = f.store.tasks.getTask(task.id);
      expect(
        await f.harness.behavior.callRpc(method, { taskId: task.id, status: "done" }),
      ).toMatchObject({
        ok: false,
        error: { code: "task_pr_open" },
      });
      expect(f.store.tasks.getTask(task.id)).toEqual(before);
      expectRows(f, []);
      f.harness.sdk.stub(
        "plugins.callRpc",
        mockPrStatusRpc(async () => ({ outcome: "absent" })),
      );
      expect(
        await f.harness.behavior.callRpc(method, { taskId: task.id, status: "done" }),
      ).toMatchObject({ ok: true, task: { status: "done" } });
      expectRows(f, [[task.id, "in_review", "done"]]);
    });
  }

  it("rolls status and history back if a subsequent API label insert or blocker operation fails", async () => {
    const f = await setup();
    const task = f.task("todo");
    const label = f.store.tasks.createLabel({
      projectId: f.project.id,
      name: "Label",
      color: "blue",
    });
    f.store.tasks.updateTask(task.id, { status: "in_progress" });
    const before = f.store.tasks.getTask(task.id);
    const history = f.rows();
    f.db.exec(`CREATE TRIGGER test_abort_label BEFORE INSERT ON task_labels
      BEGIN SELECT RAISE(ABORT, 'forced label failure'); END;`);
    await expect(
      f.harness.behavior.callRpc("updateTask", {
        taskId: task.id,
        status: "in_review",
        title: "Must roll back",
        labelIds: [label.id],
      }),
    ).rejects.toThrow("forced label failure");
    expect(f.store.tasks.getTask(task.id)).toEqual(before);
    expect(f.rows()).toEqual(history);
    expect(f.store.taskLabelIds([task.id]).get(task.id)).toEqual([]);
    f.db.exec("DROP TRIGGER test_abort_label");
    expect(
      await f.harness.behavior.callRpc("updateTask", {
        taskId: task.id,
        status: "in_review",
        title: "Must roll back",
        labelIds: [label.id],
        addBlockerTaskIds: [task.id],
      }),
    ).toMatchObject({ ok: false, error: { code: "dependency_self" } });
    expect(f.store.tasks.getTask(task.id)).toEqual(before);
    expect(f.rows()).toEqual(history);
    expect(f.store.taskLabelIds([task.id]).get(task.id)).toEqual([]);
    expect(f.store.tasks.listBlockers(task.id)).toEqual([]);
    expect(
      await f.harness.behavior.callRpc("updateTask", {
        taskId: task.id,
        status: "in_review",
        labelIds: [label.id],
      }),
    ).toMatchObject({ ok: true, task: { status: "in_review" } });
    expectRows(f, [
      [task.id, "todo", "in_progress"],
      [task.id, "in_progress", "in_review"],
    ]);
  });

  it("SDK CLI --status and --state persist exact rows, with no retry or rejected-update rows", async () => {
    const f = await setup();
    const created = await f.harness.behavior.runCli(
      ["create", "--project", "TRN", "--title", "CLI task", "--json"],
      { threadId: "thr_creator" },
    );
    expect(created).toMatchObject({ exitCode: 0, stderr: "" });
    const task = JSON.parse(created.stdout).task;
    expect(task).toMatchObject({
      key: "TRN-1",
      status: "backlog",
      createdByThreadId: "thr_creator",
    });
    expectRows(f, []);
    for (const args of [
      ["--status", "todo"],
      ["--state", "todo"],
      ["--status", "invalid"],
    ]) {
      expect(
        await f.harness.behavior.runCli(["update", task.key, ...args, "--json"]),
      ).toMatchObject({ exitCode: 1 });
      expect(f.store.tasks.getTask(task.id)).toMatchObject({
        title: "CLI task",
        status: "backlog",
      });
      expectRows(f, []);
    }
    f.harness.sdk.stub("threads.get", async ({ threadId }) =>
      makeThreadResponse({ id: threadId, archivedAt: 1 }),
    );
    for (const [option, status] of [
      ["--status", "todo"],
      ["--status", "todo"],
      ["--state", "in_progress"],
      ["--state", "in_progress"],
    ]) {
      const result = await f.harness.behavior.runCli([
        "update",
        task.key,
        option!,
        status!,
        "--json",
      ]);
      expect(result, result.stderr).toMatchObject({ exitCode: 0 });
      expect(JSON.parse(result.stdout).task).toMatchObject({ id: task.id, status });
    }
    expectRows(f, [
      [task.id, "backlog", "todo"],
      [task.id, "todo", "in_progress"],
    ]);
    const before = f.rows();
    const snapshot = f.store.tasks.getTask(task.id);
    const rejected = await f.harness.behavior.runCli([
      "update",
      task.key,
      "--status",
      "done",
      "--blocked-by",
      task.key,
      "--json",
    ]);
    expect(rejected).toMatchObject({ exitCode: 1 });
    expect(f.store.tasks.getTask(task.id)).toEqual(snapshot);
    expect(f.rows()).toEqual(before);
  });
});

describe("status history through fixture-only delegation", () => {
  it.each(["backlog", "todo", "in_progress", "in_review", "done", "canceled"] as const)(
    "delegation from %s records only a promotion",
    async (status) => {
      const f = await setup();
      const task = f.task(status);
      const preset = f.preset();
      expect(
        await f.harness.behavior.callRpc("delegate", { taskId: task.id, presetId: preset.id }),
      ).toEqual({ threadId: "thr_worker" });
      const promoted = status === "backlog" || status === "todo";
      expect(f.store.tasks.getTask(task.id)?.status).toBe(promoted ? "in_progress" : status);
      expect(f.store.tasks.listTaskThreads(task.id)).toMatchObject([
        { threadId: "thr_worker", liveStatus: "idle" },
      ]);
      expectRows(f, promoted ? [[task.id, status, "in_progress"]] : []);
    },
  );

  it("leaves no attachment or history after spawn or promotion persistence failure", async () => {
    const f = await setup();
    const task = f.task("todo");
    const preset = f.preset();
    const before = f.store.tasks.getTask(task.id);
    f.harness.sdk.stub("threads.spawn", async () => {
      throw new Error("fixture spawn refused");
    });
    await expect(
      f.harness.behavior.callRpc("delegate", { taskId: task.id, presetId: preset.id }),
    ).rejects.toThrow("fixture spawn refused");
    expect(f.store.tasks.getTask(task.id)).toEqual(before);
    expect(f.store.tasks.listTaskThreads(task.id)).toEqual([]);
    expectRows(f, []);
    f.harness.sdk.stub("threads.spawn", async () => ({ id: "thr_worker" }));
    f.db.exec(`CREATE TRIGGER test_abort_history BEFORE INSERT ON task_status_transitions
      BEGIN SELECT RAISE(ABORT, 'forced promotion failure'); END;`);
    await expect(
      f.harness.behavior.callRpc("delegate", { taskId: task.id, presetId: preset.id }),
    ).rejects.toThrow("forced promotion failure");
    expect(f.store.tasks.getTask(task.id)).toEqual(before);
    expect(f.store.tasks.listTaskThreads(task.id)).toEqual([]);
    expectRows(f, []);
    f.db.exec("DROP TRIGGER test_abort_history");
    expect(
      await f.harness.behavior.callRpc("delegate", { taskId: task.id, presetId: preset.id }),
    ).toEqual({ threadId: "thr_worker" });
    expectRows(f, [[task.id, "todo", "in_progress"]]);
  });
});
