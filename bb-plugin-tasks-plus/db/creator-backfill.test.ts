import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import { parseCreatorSource } from "./schema";
import { initializeTasksSchema } from "./schema";
import { createTasksStore } from "./store";

describe("creator source parsing", () => {
  it.each([
    ["Source bbthread://thr_one", { threadId: "thr_one" }],
    ["Text\r\nSource discussion: bbthread://thr_one.\r\n", { threadId: "thr_one" }],
    ["Source bbthread://thr_one\nSource bbthread://thr_one", { threadId: "thr_one" }],
    ["Source bbthread://thr_one bbthread://thr_two", { reason: "ambiguous" }],
    ["Source bbthread://thr_one\nSource discussion: bbthread://thr_two", { reason: "ambiguous" }],
    ["Source bbthread://thr_one\nSource BBTHREAD://thr_two", { reason: "ambiguous" }],
    ["Source bbthread://thr_one\nSource bbthread:/thr_two", { reason: "malformed" }],
    ["Source bbthread://thr_one bbthread:/thr_two", { reason: "malformed" }],
    ["Other bbthread://thr_one", { reason: "missing" }],
    ["", { reason: "missing" }],
    ["Source bbthread://thr_", { reason: "malformed" }],
    ["Source bbthread://wrong", { reason: "malformed" }],
    ["Source bbthread://thr_one/path", { reason: "malformed" }],
  ])("parses %j conservatively", (description, expected) => {
    expect(parseCreatorSource(description)).toEqual(expected);
  });

  it("backfills once, reports skipped tasks and leaves description bytes unchanged", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "creator-migration" });
    try {
      const db = bb.storage.database();
      const store = createTasksStore(db);
      const project = store.createProject({ name: "Legacy", prefix: "LEG", color: "blue" });
      const descriptions = [
        "Body\r\nSource bbthread://thr_one\r\n",
        "No source",
        "Source bbthread://thr_one bbthread://thr_two",
        "Source bbthread://thr_",
      ];
      const tasks = descriptions.map((description) =>
        store.createTask({ projectId: project.id, title: "Legacy", description }),
      );
      db.exec(`DROP TRIGGER task_list_revision_creator_insert;
        DROP TRIGGER task_list_revision_creator_update;
        DROP TABLE task_creator_threads;
        DROP INDEX idx_tasks_creator_thread;
        ALTER TABLE tasks DROP COLUMN created_by_thread_id;
        DELETE FROM schema_version WHERE version = 13;`);
      const report = initializeTasksSchema(db);
      expect(report).toEqual({
        backfilled: 1,
        skipped: expect.arrayContaining([
          { taskId: tasks[1]!.id, reason: "missing" },
          { taskId: tasks[2]!.id, reason: "ambiguous" },
          { taskId: tasks[3]!.id, reason: "malformed" },
        ]),
      });
      expect(report!.skipped).toHaveLength(3);
      const migrated = createTasksStore(db);
      expect(tasks.map((task) => migrated.getTask(task.id)?.createdByThreadId)).toEqual([
        "thr_one",
        null,
        null,
        null,
      ]);
      expect(tasks.map((task) => Buffer.from(migrated.getTask(task.id)!.description))).toEqual(
        descriptions.map((text) => Buffer.from(text)),
      );
      migrated.updateTask(tasks[1]!.id, { description: "Source bbthread://thr_later" });
      expect(initializeTasksSchema(db)).toBeUndefined();
      expect(migrated.getTask(tasks[1]!.id)?.createdByThreadId).toBeNull();
    } finally {
      await harness.dispose();
    }
  });
});
