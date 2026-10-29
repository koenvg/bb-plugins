import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it } from "vitest";
import { calculateTaskDuration } from "../shared/task-duration.js";
import { createTasksStore, type TaskStatus } from ".";

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (disposers.length) await disposers.pop()!();
});

function setup() {
  const { bb, harness } = createFakePluginHost({ pluginId: "task-duration" });
  disposers.push(() => harness.dispose());
  const db = bb.storage.database();
  const store = createTasksStore(db);
  const project = store.createProject({ name: "Duration", prefix: "DUR", color: "blue" });
  const task = (status: TaskStatus = "todo") =>
    store.createTask({ projectId: project.id, title: "Task", status });
  const duration = (taskId: string) =>
    calculateTaskDuration({
      status: store.getTask(taskId)!.status,
      transitions: store.listTaskStatusTransitions(taskId),
    });
  return { db, store, task, duration };
}

describe("task duration through persisted history", () => {
  for (const writer of ["updateTask", "updatePosition"] as const) {
    it(`${writer} exposes isolated id-ordered history and includes reopened time`, () => {
      const f = setup();
      const task = f.task();
      const other = f.task();
      f.store[writer](task.id, { status: "in_progress" });
      f.store[writer](other.id, { status: "in_progress" });
      f.store[writer](task.id, { status: "in_review" });
      f.store[writer](task.id, { status: "done" });
      f.store[writer](task.id, { status: "in_progress" });
      f.store[writer](task.id, { status: "done" });

      f.db
        .prepare("UPDATE task_status_transitions SET changed_at = ? WHERE id = ?")
        .run("2026-01-01T00:00:00.000Z", 1);
      f.db
        .prepare("UPDATE task_status_transitions SET changed_at = ? WHERE id = ?")
        .run("2026-01-03T08:00:00.000Z", 2);
      f.db
        .prepare("UPDATE task_status_transitions SET changed_at = ? WHERE id = ?")
        .run("2026-01-04T00:00:00.000Z", 3);
      f.db
        .prepare("UPDATE task_status_transitions SET changed_at = ? WHERE id = ?")
        .run("2026-01-02T00:00:00.000Z", 4);
      f.db
        .prepare("UPDATE task_status_transitions SET changed_at = ? WHERE id = ?")
        .run("2026-01-02T00:00:00.000Z", 5);
      f.db
        .prepare("UPDATE task_status_transitions SET changed_at = ? WHERE id = ?")
        .run("2026-01-03T08:00:00.000Z", 6);
      expect(f.store.listTaskStatusTransitions(task.id)).toEqual([
        {
          id: 1,
          taskId: task.id,
          fromStatus: "todo",
          toStatus: "in_progress",
          changedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: 3,
          taskId: task.id,
          fromStatus: "in_progress",
          toStatus: "in_review",
          changedAt: "2026-01-04T00:00:00.000Z",
        },
        {
          id: 4,
          taskId: task.id,
          fromStatus: "in_review",
          toStatus: "done",
          changedAt: "2026-01-02T00:00:00.000Z",
        },
        {
          id: 5,
          taskId: task.id,
          fromStatus: "done",
          toStatus: "in_progress",
          changedAt: "2026-01-02T00:00:00.000Z",
        },
        {
          id: 6,
          taskId: task.id,
          fromStatus: "in_progress",
          toStatus: "done",
          changedAt: "2026-01-03T08:00:00.000Z",
        },
      ]);
      expect(f.store.listTaskStatusTransitions(other.id)).toEqual([
        {
          id: 2,
          taskId: other.id,
          fromStatus: "todo",
          toStatus: "in_progress",
          changedAt: "2026-01-03T08:00:00.000Z",
        },
      ]);
      expect(f.store.listTaskStatusTransitions("missing' OR 1 = 1 --")).toEqual([]);
      expect(f.duration(task.id)).toEqual({
        kind: "completed",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-03T08:00:00.000Z",
        milliseconds: 201600000,
        interrupted: false,
        statisticsEligible: true,
      });
    });

    it(`${writer} ignores no-ops and rolled-back transitions`, () => {
      const f = setup();
      const task = f.task();
      f.store[writer](task.id, { status: "todo" });
      expect(f.store.listTaskStatusTransitions(task.id)).toEqual([]);
      f.store[writer](task.id, { status: "in_progress" });
      f.db
        .prepare("UPDATE task_status_transitions SET changed_at = ? WHERE id = ?")
        .run("2026-01-01T00:00:00.000Z", 1);
      expect(() =>
        f.db.transaction(() => {
          f.store[writer](task.id, { status: "done" });
          throw new Error("rollback");
        })(),
      ).toThrow("rollback");
      expect(f.store.getTask(task.id)?.status).toBe("in_progress");
      expect(f.store.listTaskStatusTransitions(task.id)).toEqual([
        {
          id: 1,
          taskId: task.id,
          fromStatus: "todo",
          toStatus: "in_progress",
          changedAt: "2026-01-01T00:00:00.000Z",
        },
      ]);
      expect(f.duration(task.id)).toEqual({
        kind: "unfinished",
        startedAt: "2026-01-01T00:00:00.000Z",
        interrupted: false,
        statisticsEligible: false,
      });
    });
  }

  it("keeps interrupted completion numeric and never restarts its clock", () => {
    const f = setup();
    const task = f.task();
    f.store.updateTask(task.id, { status: "in_progress" });
    f.store.updatePosition(task.id, { status: "backlog" });
    f.store.updateTask(task.id, { status: "in_progress" });
    f.store.updatePosition(task.id, { status: "done" });
    f.db
      .prepare("UPDATE task_status_transitions SET changed_at = ? WHERE id = ?")
      .run("2026-01-01T00:00:00.000Z", 1);
    f.db
      .prepare("UPDATE task_status_transitions SET changed_at = ? WHERE id = ?")
      .run("2026-01-08T08:00:00.000Z", 4);
    expect(f.duration(task.id)).toEqual({
      kind: "completed",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-08T08:00:00.000Z",
      milliseconds: 633600000,
      interrupted: true,
      statisticsEligible: false,
    });
  });

  it("does not substitute task timestamps for unrecorded endpoints", () => {
    const f = setup();
    const task = f.task("done");
    f.db
      .prepare("UPDATE tasks SET created_at = ?, updated_at = ? WHERE id = ?")
      .run("1900-01-01T00:00:00.000Z", "2999-01-01T00:00:00.000Z", task.id);
    expect(f.store.getTask(task.id)).toMatchObject({
      status: "done",
      createdAt: "1900-01-01T00:00:00.000Z",
      updatedAt: "2999-01-01T00:00:00.000Z",
    });
    expect(f.store.listTaskStatusTransitions(task.id)).toEqual([]);
    expect(f.duration(task.id)).toEqual({
      kind: "unavailable",
      reason: "missing-start",
      interrupted: false,
      statisticsEligible: false,
    });
    f.store.updateTask(task.id, { status: "in_progress" });
    f.store.updatePosition(task.id, { status: "done" });
    expect(f.duration(task.id)).toEqual({
      kind: "unavailable",
      reason: "missing-start",
      interrupted: false,
      statisticsEligible: false,
    });
    const recorded = f.task();
    f.store.updateTask(recorded.id, { status: "in_progress" });
    f.store.updatePosition(recorded.id, { status: "done" });
    f.db
      .prepare("UPDATE task_status_transitions SET changed_at = ? WHERE id = ?")
      .run("2026-01-01T00:00:00.000Z", 3);
    f.db
      .prepare("UPDATE task_status_transitions SET changed_at = ? WHERE id = ?")
      .run("2026-01-01T02:00:00.000Z", 4);
    f.db
      .prepare("UPDATE tasks SET created_at = ?, updated_at = ? WHERE id = ?")
      .run("1900-01-01T00:00:00.000Z", "2999-01-01T00:00:00.000Z", recorded.id);
    expect(f.duration(recorded.id)).toEqual({
      kind: "completed",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T02:00:00.000Z",
      milliseconds: 7200000,
      interrupted: false,
      statisticsEligible: true,
    });
  });
});
