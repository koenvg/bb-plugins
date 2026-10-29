import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStore, registerTasksApi } from "./index.js";
import { taskDurationSchema, tasksRpcContract, type TaskStatus } from "../shared/contract.js";

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  while (disposers.length) await disposers.pop()!();
});

function setup() {
  const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
  disposers.push(() => harness.dispose());
  const store = createStore(bb);
  registerTasksApi(bb, store);
  const db = bb.storage.database();
  const project = store.tasks.createProject({ name: "Duration", prefix: "DUR", color: "blue" });
  const task = store.tasks.createTask({ projectId: project.id, title: "Elapsed", status: "todo" });
  const call = (method: string, input: unknown) => harness.behavior.callRpc(method, input);
  const transition = async (status: TaskStatus, changedAt: string) => {
    await call("updateTask", { taskId: task.id, status });
    db.prepare(`UPDATE task_status_transitions SET changed_at = ?
      WHERE id = (SELECT MAX(id) FROM task_status_transitions WHERE task_id = ?)`).run(
      changedAt,
      task.id,
    );
  };
  const lookup = async () =>
    tasksRpcContract.getTaskByKey.output.parse(await call("getTaskByKey", { taskKey: task.key }))
      .task!;
  return { store, db, project, task, call, transition, lookup };
}

const completed = {
  kind: "completed",
  startedAt: "2026-10-19T09:00:00.000Z",
  completedAt: "2026-10-21T17:00:00.000Z",
  milliseconds: 201_600_000,
  interrupted: false,
  statisticsEligible: true,
} as const;

describe("single-task duration from persisted status history", () => {
  it("includes review and reopened periods and reads the last completion", async () => {
    const f = setup();
    for (const [status, at] of [
      ["in_progress", "2026-10-19T09:00:00.000Z"],
      ["in_review", "2026-10-19T17:00:00.000Z"],
      ["done", "2026-10-20T09:00:00.000Z"],
      ["in_progress", "2026-10-20T11:00:00.000Z"],
      ["in_review", "2026-10-21T10:00:00.000Z"],
      ["done", "2026-10-21T17:00:00.000Z"],
    ] as const)
      await f.transition(status, at);
    expect((await f.lookup()).duration).toEqual(completed);
    const byId = tasksRpcContract.getTask.output.parse(
      await f.call("getTask", { taskId: f.task.id }),
    );
    expect(byId.task?.duration).toEqual(completed);
    const unrelated = tasksRpcContract.updateTask.output.parse(
      await f.call("updateTask", {
        taskId: f.task.id,
        title: "Renamed",
      }),
    );
    expect(unrelated.ok && unrelated.task.duration).toEqual(completed);
  });

  it.each(["todo", "backlog"] as const)(
    "retains elapsed time after interruption via %s",
    async (status) => {
      const f = setup();
      await f.transition("in_progress", completed.startedAt);
      await f.transition(status, "2026-10-20T09:00:00.000Z");
      await f.transition("in_progress", "2026-10-20T11:00:00.000Z");
      await f.transition("done", completed.completedAt);
      expect((await f.lookup()).duration).toEqual({
        ...completed,
        interrupted: true,
        statisticsEligible: false,
      });
    },
  );

  it("returns synchronous duration after trigger-backed board moves and updates", async () => {
    const f = setup();
    const created = tasksRpcContract.createTask.output.parse(
      await f.call("createTask", {
        projectId: f.project.id,
        title: "New",
      }),
    );
    expect(created.ok && created.task.duration).toEqual({
      kind: "unavailable",
      reason: "missing-start",
      interrupted: false,
      statisticsEligible: false,
    });
    await f.transition("in_progress", completed.startedAt);
    const unfinished = await f.lookup();
    expect(unfinished.duration).toEqual({
      kind: "unfinished",
      startedAt: completed.startedAt,
      interrupted: false,
      statisticsEligible: false,
    });
    const done = tasksRpcContract.boardMove.output.parse(
      await f.call("boardMove", { taskId: f.task.id, status: "done" }),
    );
    expect(done.ok && done.task.duration.kind).toBe("completed");
    const canceled = tasksRpcContract.updateTask.output.parse(
      await f.call("updateTask", { taskId: f.task.id, status: "canceled" }),
    );
    expect(canceled.ok && canceled.task.duration).toEqual({
      kind: "excluded",
      reason: "canceled",
      interrupted: false,
      statisticsEligible: false,
    });
    await f.transition("in_progress", "2026-10-21T10:00:00.000Z");
    await f.transition("done", completed.completedAt);
    expect((await f.lookup()).duration).toEqual(completed);
  });

  it("reports missing or invalid history without using task timestamps", async () => {
    const f = setup();
    expect((await f.lookup()).duration).toMatchObject({
      kind: "unavailable",
      reason: "missing-start",
    });
    await f.transition("in_progress", completed.startedAt);
    f.db.prepare("UPDATE tasks SET status = 'done' WHERE id = ?").run(f.task.id);
    f.db.prepare("DELETE FROM task_status_transitions WHERE to_status = 'done'").run();
    expect((await f.lookup()).duration).toMatchObject({
      kind: "unavailable",
      reason: "missing-completion",
    });
    f.db.prepare("UPDATE task_status_transitions SET changed_at = 'invalid'").run();
    expect((await f.lookup()).duration).toMatchObject({
      kind: "unavailable",
      reason: "invalid-timestamp",
    });
    f.db.prepare("DELETE FROM task_status_transitions").run();
    expect((await f.lookup()).duration).toMatchObject({
      kind: "unavailable",
      reason: "missing-start",
    });
  });

  it("keeps bulk task and thread inventories history-free", async () => {
    const f = setup();
    const read = vi.spyOn(f.store.tasks, "listTaskStatusTransitions");
    for (let index = 0; index < 3; index++)
      f.store.tasks.createTask({ projectId: f.project.id, title: `Bulk ${index}` });
    f.store.tasks.upsertTaskThread({
      taskId: f.task.id,
      threadId: "thr_fixture",
      presetName: "Fixture",
      title: "Worker",
      liveStatus: "idle",
    });
    const list = tasksRpcContract.listTasks.output.parse(
      await f.call("listTasks", { projectId: f.project.id }),
    );
    const threads = tasksRpcContract.getTasksForThread.output.parse(
      await f.call("getTasksForThread", { threadId: "thr_fixture" }),
    );
    expect(list.tasks).toHaveLength(4);
    for (const task of list.tasks) expect(task).not.toHaveProperty("duration");
    expect(threads.tasks.map((task) => task.id)).toEqual([f.task.id]);
    expect(threads.tasks[0]).not.toHaveProperty("duration");
    expect(read).not.toHaveBeenCalled();
    await f.lookup();
    expect(read).toHaveBeenCalledExactlyOnceWith(f.task.id);
  });
});

describe("duration transport invariants", () => {
  it("accepts the completed union branches including zero", () => {
    expect(taskDurationSchema.parse(completed)).toEqual(completed);
    expect(
      taskDurationSchema.parse({
        ...completed,
        milliseconds: 0,
        interrupted: true,
        statisticsEligible: false,
      }),
    ).toMatchObject({ milliseconds: 0 });
  });
  it.each([
    { milliseconds: -1 },
    { milliseconds: Infinity },
    { milliseconds: NaN },
    { interrupted: true },
    { statisticsEligible: false },
    { reason: "canceled" },
    { milliseconds: undefined },
    { completedAt: undefined },
  ])("rejects invalid completed result %j", (patch) => {
    expect(taskDurationSchema.safeParse({ ...completed, ...patch }).success).toBe(false);
  });
  it.each([
    { kind: "unfinished", startedAt: "start", interrupted: false, statisticsEligible: true },
    { kind: "excluded", reason: "missing-start", interrupted: false, statisticsEligible: false },
    { kind: "unavailable", reason: "unknown", interrupted: false, statisticsEligible: false },
    {
      kind: "unavailable",
      reason: "missing-start",
      interrupted: false,
      statisticsEligible: false,
      milliseconds: 0,
    },
  ])("rejects invalid non-completed result %j", (value) => {
    expect(taskDurationSchema.safeParse(value).success).toBe(false);
  });
  it("requires duration on single-task results but not bulk lists", async () => {
    const f = setup();
    const { duration: _, ...task } = await f.lookup();
    for (const schema of [tasksRpcContract.getTask.output, tasksRpcContract.getTaskByKey.output]) {
      expect(schema.safeParse({ task }).success).toBe(false);
      expect(schema.safeParse({ task: null }).success).toBe(true);
    }
    for (const schema of [
      tasksRpcContract.createTask.output,
      tasksRpcContract.updateTask.output,
      tasksRpcContract.boardMove.output,
    ]) {
      expect(schema.safeParse({ ok: true, task }).success).toBe(false);
    }
    expect(
      tasksRpcContract.listTasks.output.safeParse({ tasks: [task], nextCursor: null }).success,
    ).toBe(true);
  });
});
