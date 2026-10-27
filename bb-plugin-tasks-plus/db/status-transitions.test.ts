import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it } from "vitest";
import { createTasksStore, type TaskStatus, type TaskStatusTransition } from ".";
import { initializeTasksSchema } from "./schema";

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (disposers.length) await disposers.pop()!();
});

function setup() {
  const { bb, harness } = createFakePluginHost({ pluginId: "status-transitions" });
  disposers.push(() => harness.dispose());
  const db = bb.storage.database();
  const store = createTasksStore(db);
  const project = store.createProject({ name: "Transitions", prefix: "TRN", color: "blue" });
  const task = (status?: TaskStatus, createdByThreadId?: string) =>
    store.createTask({ projectId: project.id, title: "Task", status, createdByThreadId });
  const rows = () =>
    db
      .prepare<[], TaskStatusTransition>(`SELECT id, task_id AS taskId,
      from_status AS fromStatus, to_status AS toStatus, changed_at AS changedAt
      FROM task_status_transitions ORDER BY id`)
      .all();
  const now = () =>
    db.prepare<[], { time: string }>("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS time").get()!
      .time;
  return { bb, harness, db, store, project, task, rows, now };
}

type Fixture = ReturnType<typeof setup>;
function expectRows(f: Fixture, expected: Array<[string, TaskStatus, TaskStatus]>, firstId = 1) {
  const rows = f.rows();
  expect(rows).toEqual(
    expected.map(([taskId, fromStatus, toStatus], index) => ({
      id: firstId + index,
      taskId,
      fromStatus,
      toStatus,
      changedAt: rows[index]?.changedAt,
    })),
  );
  for (const row of rows) {
    expect(row.changedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(row.changedAt).toISOString()).toBe(row.changedAt);
  }
}

function version13(f: Fixture) {
  f.db.exec(`DROP TRIGGER IF EXISTS task_status_transitions_tasks_update;
    DROP TABLE IF EXISTS task_status_transitions;
    DELETE FROM schema_version WHERE version = 14;`);
}

describe("persisted task status transitions", () => {
  for (const writer of ["updateTask", "updatePosition"] as const) {
    it(`${writer} records every workflow status and return transition`, () => {
      const f = setup();
      const task = f.task("backlog");
      const statuses = ["todo", "in_progress", "in_review", "done", "canceled", "backlog"] as const;
      const expected: Array<[string, TaskStatus, TaskStatus]> = [];
      let previous: TaskStatus = "backlog";
      for (const status of statuses) {
        expect(f.store[writer](task.id, { status }).status).toBe(status);
        expected.push([task.id, previous, status]);
        previous = status;
      }
      expectRows(f, expected);
    });

    it(`${writer} leaves no history for missing tasks, validation failures or outer rollback`, () => {
      const f = setup();
      const task = f.task("todo");
      const before = f.store.getTask(task.id);
      expect(() => f.store[writer]("missing", { status: "done" })).toThrow(/not found/i);
      expect(() =>
        f.store[writer](
          task.id,
          writer === "updateTask"
            ? { status: "done", parentTaskId: task.id }
            : { status: "done", beforeTaskId: task.id },
        ),
      ).toThrow();
      expect(() =>
        f.db.transaction(() => {
          f.store[writer](task.id, { status: "done" });
          expect(f.rows()).toHaveLength(1);
          throw new Error("outer rollback");
        })(),
      ).toThrow("outer rollback");
      expect(f.store.getTask(task.id)).toEqual(before);
      expectRows(f, []);
      f.store[writer](task.id, { status: "in_progress" });
      expectRows(f, [[task.id, "todo", "in_progress"]]);
    });

    it(`${writer} rolls back task writes when SQL or history insertion fails`, () => {
      const f = setup();
      const task = f.task("todo");
      const neighbor = f.task("in_review");
      f.db.prepare("UPDATE tasks SET position = 0 WHERE id = ?").run(neighbor.id);
      const before = f.db.prepare("SELECT * FROM tasks ORDER BY id").all();
      for (const target of ["tasks", "task_status_transitions"]) {
        f.db
          .exec(`CREATE TRIGGER test_abort BEFORE ${target === "tasks" ? "UPDATE OF status" : "INSERT"}
          ON ${target} BEGIN SELECT RAISE(ABORT, 'forced write failure'); END;`);
        expect(() =>
          f.store[writer](task.id, {
            status: "in_review",
            ...(writer === "updatePosition" ? { afterTaskId: neighbor.id } : {}),
          }),
        ).toThrow("forced write failure");
        expect(f.db.prepare("SELECT * FROM tasks ORDER BY id").all()).toEqual(before);
        expectRows(f, []);
        f.db.exec("DROP TRIGGER test_abort");
      }
      f.store[writer](task.id, { status: "in_review" });
      expectRows(f, [[task.id, "todo", "in_review"]]);
    });
  }

  it("excludes default and explicit creation, creator metadata, ordinary edits and same-column renormalization", () => {
    const f = setup();
    const tasks = [
      f.task(),
      f.task("in_review"),
      f.task(undefined, "thr_creator"),
      f.task("done", "thr_creator"),
    ];
    expect(tasks.map((task) => [task.status, task.createdByThreadId])).toEqual([
      ["backlog", null],
      ["in_review", null],
      ["backlog", "thr_creator"],
      ["done", "thr_creator"],
    ]);
    const task = tasks[0]!;
    f.store.updateTask(task.id, { title: "Edited" });
    f.store.updateTask(task.id, { status: "backlog" });
    f.db.prepare("UPDATE tasks SET position = 0 WHERE id = ?").run(tasks[2]!.id);
    f.store.updatePosition(task.id, { status: "backlog", afterTaskId: tasks[2]!.id });
    expect(f.store.getTask(task.id)).toMatchObject({
      title: "Edited",
      status: "backlog",
      position: 512,
    });
    expect(f.store.getTask(tasks[2]!.id)?.position).toBe(1024);
    expectRows(f, []);
    f.store.updateTask(task.id, { status: "todo" });
    expectRows(f, [[task.id, "backlog", "todo"]]);
  });

  it("timestamps direct SQL writes with SQLite time, not old or future task timestamps", () => {
    const f = setup();
    const task = f.task("todo");
    const expected: Array<[string, TaskStatus, TaskStatus]> = [];
    for (const [status, timestamp] of [
      ["done", "1900-01-01T00:00:00.000Z"],
      ["todo", "2999-01-01T00:00:00.000Z"],
    ] as const) {
      const lower = f.now();
      f.db
        .prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?")
        .run(status, timestamp, task.id);
      const upper = f.now();
      const row = f.rows().at(-1)!;
      expect(row.changedAt >= lower && row.changedAt <= upper).toBe(true);
      expect(row.changedAt).not.toBe(timestamp);
      expect(f.store.getTask(task.id)?.updatedAt).toBe(timestamp);
      expected.push([task.id, status === "done" ? "todo" : "done", status]);
    }
    expectRows(f, expected);
  });

  it("orders equal-statement timestamps by stable ids and does not reuse deleted committed ids", () => {
    const f = setup();
    const a = f.task("todo");
    const b = f.task("todo");
    f.db.exec("UPDATE tasks SET status = 'in_progress' WHERE status = 'todo'");
    const initial = f.rows();
    expect(initial.map((row) => row.taskId).sort()).toEqual([a.id, b.id].sort());
    expect(initial.map((row) => row.id)).toEqual([1, 2]);
    expect(initial[0]!.changedAt).toBe(initial[1]!.changedAt);
    f.store.deleteTask(initial[1]!.taskId);
    const remaining = initial[0]!.taskId;
    f.store.updateTask(remaining, { status: "in_review" });
    expect(f.rows()).toEqual([
      initial[0],
      {
        id: 3,
        taskId: remaining,
        fromStatus: "in_progress",
        toStatus: "in_review",
        changedAt: f.rows()[1]!.changedAt,
      },
    ]);
  });

  it("keeps both committed A to B to A transitions inside one outer transaction", () => {
    const f = setup();
    const task = f.task("todo");
    f.db.transaction(() => {
      f.store.updateTask(task.id, { status: "in_progress" });
      f.store.updatePosition(task.id, { status: "todo" });
    })();
    expect(f.store.getTask(task.id)?.status).toBe("todo");
    expectRows(f, [
      [task.id, "todo", "in_progress"],
      [task.id, "in_progress", "todo"],
    ]);
  });

  it("enforces transition inequality and task ownership and cascades task/project deletion", () => {
    const f = setup();
    const a = f.task("todo");
    const b = f.task("todo");
    const insert = f.db.prepare(
      "INSERT INTO task_status_transitions (task_id, from_status, to_status, changed_at) VALUES (?, ?, ?, ?)",
    );
    expect(() => insert.run(a.id, "todo", "todo", f.now())).toThrow(/CHECK/);
    expect(() => insert.run("missing", "todo", "done", f.now())).toThrow(/FOREIGN KEY/);
    f.store.updateTask(a.id, { status: "done" });
    f.store.updateTask(b.id, { status: "in_review" });
    expectRows(f, [
      [a.id, "todo", "done"],
      [b.id, "todo", "in_review"],
    ]);
    f.store.deleteTask(a.id);
    expect(f.rows().map((row) => row.taskId)).toEqual([b.id]);
    f.store.deleteProject(f.project.id);
    expect(f.store.listTasks()).toEqual([]);
    expectRows(f, []);
    expect(f.db.pragma("foreign_key_check")).toEqual([]);
  });

  it("preserves exact committed rows across fake-host reload with a new database handle", async () => {
    const f = setup();
    const task = f.task("todo");
    f.store.updateTask(task.id, { status: "in_progress" });
    const before = f.rows();
    let replacementDb: typeof f.db | undefined;
    const replacement = await f.harness.lifecycle.reload((bb) => {
      replacementDb = bb.storage.database();
      createTasksStore(replacementDb);
    });
    disposers.push(() => replacement.harness.lifecycle.dispose());
    expect(replacementDb).not.toBe(f.db);
    const read = () =>
      replacementDb!
        .prepare(
          "SELECT id, task_id AS taskId, from_status AS fromStatus, to_status AS toStatus, changed_at AS changedAt FROM task_status_transitions ORDER BY id",
        )
        .all();
    expect(read()).toEqual(before);
    const store = createTasksStore(replacementDb!);
    expect(store.getTask(task.id)?.status).toBe("in_progress");
    store.updatePosition(task.id, { status: "done" });
    expect(read()).toEqual([
      ...before,
      {
        id: 2,
        taskId: task.id,
        fromStatus: "in_progress",
        toStatus: "done",
        changedAt: (read()[1] as TaskStatusTransition).changedAt,
      },
    ]);
  });
});

describe("status transition migration 14", () => {
  it("preserves all version 13 task rows, starts empty and initializes idempotently", () => {
    const f = setup();
    const task = f.task("in_review", "thr_creator");
    f.task("done");
    version13(f);
    const tasks = f.db.prepare("SELECT * FROM tasks ORDER BY id").all();
    const versions = f.db.prepare("SELECT * FROM schema_version ORDER BY version").all();
    expect(versions).toHaveLength(13);
    initializeTasksSchema(f.db);
    expect(f.db.prepare("SELECT * FROM tasks ORDER BY id").all()).toEqual(tasks);
    expect(
      f.db.prepare("SELECT * FROM schema_version WHERE version <= 13 ORDER BY version").all(),
    ).toEqual(versions);
    expectRows(f, []);
    const migrated = f.db.prepare("SELECT * FROM schema_version ORDER BY version").all();
    expect(migrated).toHaveLength(14);
    initializeTasksSchema(f.db);
    expect(f.db.prepare("SELECT * FROM schema_version ORDER BY version").all()).toEqual(migrated);
    expect(f.db.prepare("SELECT * FROM tasks ORDER BY id").all()).toEqual(tasks);
    f.store.updateTask(task.id, { status: "done" });
    expectRows(f, [[task.id, "in_review", "done"]]);
  });

  it("rolls migration SQL and task data back when recording version 14 fails", () => {
    const f = setup();
    const task = f.task("todo");
    version13(f);
    f.db.exec(`CREATE TRIGGER test_abort_version BEFORE INSERT ON schema_version
      WHEN NEW.version = 14 BEGIN SELECT RAISE(ABORT, 'forced version failure'); END;`);
    const snapshot = () => ({
      schema: f.db.prepare("SELECT * FROM sqlite_master ORDER BY name").all(),
      versions: f.db.prepare("SELECT * FROM schema_version ORDER BY version").all(),
      tasks: f.db.prepare("SELECT * FROM tasks ORDER BY id").all(),
    });
    const before = snapshot();
    expect(() => initializeTasksSchema(f.db)).toThrow("forced version failure");
    expect(snapshot()).toEqual(before);
    f.db.exec("DROP TRIGGER test_abort_version");
    initializeTasksSchema(f.db);
    expectRows(f, []);
    f.store.updateTask(task.id, { status: "done" });
    expectRows(f, [[task.id, "todo", "done"]]);
  });
});
