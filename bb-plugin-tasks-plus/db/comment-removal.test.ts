import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { initializeTasksSchema } from "./schema";
import { createTasksStore } from "./store";

const legacySchema = readFileSync(
  new URL("../test-fixtures/pre-comment-removal.sql", import.meta.url),
  "utf8",
);

function legacyDatabase() {
  const db = new Database(":memory:");
  db.exec(legacySchema);
  db.exec(`
    INSERT INTO projects (id, name, prefix, color, created_at)
      VALUES ('project', 'Legacy', 'LEG', 'blue', 'created');
    INSERT INTO tasks (id, project_id, number, title, description, status, priority,
      position, created_at, updated_at)
      VALUES ('task', 'project', 1, 'Keep requirements', 'Description', 'todo', 'high',
        0, 'created', 'updated'),
        ('other', 'project', 2, 'Other task', '', 'todo', 'none', 1, 'created', 'updated');
    INSERT INTO labels VALUES ('label', 'project', 'Safety', 'red');
    INSERT INTO task_labels VALUES ('task', 'label');
    INSERT INTO task_dependencies VALUES ('other', 'task', 'created');
    INSERT INTO presets (id, name, provider_id, model_id, reasoning_level,
      permission_mode, instructions, builtin, created_at)
      VALUES ('preset', 'Custom', 'codex', 'model', 'high', 'full',
        'Stored comment instructions stay unchanged', 0, 'created');
    INSERT INTO task_threads (id, task_id, thread_id, preset_name, title, live_status,
      attached_at, updated_at, role, primary_owner)
      VALUES ('link', 'task', 'thr_worker', 'Custom', 'Worker', 'working',
        'created', 'updated', 'implementation', 1);
    INSERT INTO comments (id, task_id, kind, author_name, thread_id, body, created_at)
      VALUES ('user-comment', 'task', 'user', 'Operator', NULL, 'Delete text', 'created'),
        ('agent-comment', 'task', 'agent', 'Worker', 'thr_worker', 'Delete report', 'created'),
        ('system-comment', 'task', 'system', 'System', NULL, 'Delete event', 'created');
    INSERT INTO attachments VALUES
      ('direct-file', 'task', NULL, 'direct.txt', 'text/plain', 5, 'attachments/direct.txt', 0, 'created'),
      ('user-file', NULL, 'user-comment', 'user.txt', 'text/plain', 7, 'attachments/user.txt', 0, 'created'),
      ('agent-file', NULL, 'agent-comment', 'agent.png', 'image/png', 9, 'attachments/agent.png', 1, 'created');
    INSERT INTO orchestration_reports VALUES
      ('report', 'task', 'thr_worker', 'retry', 'completed', 'created',
        '{"commentId":"agent-comment","evidence":"retain"}', '{}', NULL);
    INSERT INTO orchestration_runs VALUES
      ('run', 'task', 'thr_worker', 'invocation', '{"phase":"active"}');
    INSERT INTO orchestration_run_requests VALUES ('invocation', '{"pending":true}');
    INSERT INTO orchestration_owners VALUES
      ('task', 'implementation', 'link', 'thr_worker', 'run');
    INSERT INTO orchestration_dispatch_claims
      (id, task_id, role, run_id, coordinator_thread_id, phase, thread_id,
       association_id, created_at, updated_at)
      VALUES ('claim', 'task', 'implementation', 'run', 'thr_coordinator',
        'active', 'thr_worker', 'link', 'created', 'updated');
    INSERT INTO orchestration_report_intents VALUES ('report', 'generation', 'hash', 'receipt', 'queued');
    INSERT INTO orchestration_report_contexts VALUES
      ('token-hash', 'task', 'thr_worker', 9999999999999, '{"commentId":"agent-comment"}');
  `);
  return db;
}

const retainedTables = [
  "projects",
  "tasks",
  "labels",
  "task_labels",
  "task_dependencies",
  "presets",
  "task_threads",
  "task_list_revision",
  "orchestration_reports",
  "orchestration_runs",
  "orchestration_run_requests",
  "orchestration_owners",
  "orchestration_dispatch_claims",
  "orchestration_report_intents",
  "orchestration_report_contexts",
];

function snapshot(db: Database.Database) {
  return Object.fromEntries(
    retainedTables.map((table) => [
      table,
      db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    ]),
  );
}

function expectCommentFree(db: Database.Database) {
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%comment%'").all()).toEqual(
    [],
  );
  expect(
    db
      .prepare<[], { name: string }>("PRAGMA table_info(attachments)")
      .all()
      .map((column) => column.name),
  ).not.toContain("comment_id");
  expect(db.pragma("foreign_key_check")).toEqual([]);
  expect(db.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
}

describe("comment-removal forward migration", () => {
  it("converts legacy files without changing retained data or previous versions", () => {
    const db = legacyDatabase();
    try {
      const before = snapshot(db);
      before.tasks = before.tasks!.map((row) => ({
        ...(row as Record<string, unknown>),
        created_by_thread_id: null,
      }));
      const versions = db.prepare("SELECT * FROM schema_version ORDER BY version").all();
      const files = db.prepare("SELECT * FROM attachments ORDER BY id").all() as Array<
        Record<string, unknown>
      >;
      initializeTasksSchema(db);
      const store = createTasksStore(db);
      createTasksStore(db);
      expect(store.listAttachmentsForTask("task")).toHaveLength(3);
      expect(store.getTask("task")?.title).toBe("Keep requirements");
      expectCommentFree(db);
      expect(snapshot(db)).toEqual(before);
      expect(
        db.prepare("SELECT * FROM schema_version WHERE version <= 11 ORDER BY version").all(),
      ).toEqual(versions);
      expect(db.prepare("SELECT * FROM attachments ORDER BY id").all()).toEqual(
        files.map(({ comment_id: _commentId, ...file }) => ({ ...file, task_id: "task" })),
      );
      expect(db.prepare("SELECT id FROM attachments WHERE task_id = 'other'").all()).toEqual([]);
      const migrated = db.prepare("SELECT * FROM schema_version ORDER BY version").all();
      initializeTasksSchema(db);
      expect(db.prepare("SELECT * FROM schema_version ORDER BY version").all()).toEqual(migrated);
      expect(snapshot(db)).toEqual(before);
      expectCommentFree(db);
    } finally {
      db.close();
    }
  });

  it("initializes a fresh task-only schema and enforces ownership", () => {
    const db = new Database(":memory:");
    try {
      initializeTasksSchema(db);
      initializeTasksSchema(db);
      expectCommentFree(db);
      expect(db.prepare("SELECT COUNT(*) AS count FROM schema_version").get()).toEqual({
        count: 14,
      });
      expect(() =>
        db.exec(`INSERT INTO attachments VALUES
        ('file', NULL, 'file.txt', 'text/plain', 1, 'file.txt', 0, 'created')`),
      ).toThrow();
      expect(() =>
        db.exec(`INSERT INTO attachments VALUES
        ('file', 'missing', 'file.txt', 'text/plain', 1, 'file.txt', 0, 'created')`),
      ).toThrow();
    } finally {
      db.close();
    }
  });

  it("rolls back all changes if recording the final version fails", () => {
    const db = legacyDatabase();
    try {
      db.exec(`CREATE TRIGGER fail_removal BEFORE INSERT ON schema_version
        WHEN NEW.version = 12 BEGIN SELECT RAISE(ABORT, 'forced migration failure'); END;`);
      const read = () => ({
        retained: snapshot(db),
        comments: db.prepare("SELECT * FROM comments ORDER BY id").all(),
        attachments: db.prepare("SELECT * FROM attachments ORDER BY id").all(),
        versions: db.prepare("SELECT * FROM schema_version ORDER BY version").all(),
        schema: db.prepare("SELECT * FROM sqlite_master ORDER BY name").all(),
      });
      const before = read();
      expect(() => initializeTasksSchema(db)).toThrow("forced migration failure");
      expect(read()).toEqual(before);
      expect(db.prepare("SELECT COUNT(*) AS count FROM comments").get()).toEqual({ count: 3 });
      expect(db.pragma("foreign_key_check")).toEqual([]);
    } finally {
      db.close();
    }
  });
});
