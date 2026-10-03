import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { createStore } from "../api";
import { initializeTasksSchema } from "../db/schema";

describe("migration 8 compatibility", () => {
  it("preserves a version-7 Tasks database and all existing record kinds", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks-plus" });
    try {
      const db = bb.storage.database();
      const tasks = createStore(bb).tasks;
      const project = tasks.createProject({
        name: "Legacy",
        prefix: "OLD",
        color: "blue",
      });
      const epic = tasks.createTask({
        projectId: project.id,
        title: "Legacy epic",
      });
      const task = tasks.createTask({
        projectId: project.id,
        parentTaskId: epic.id,
        title: "Legacy child",
      });
      const comment = tasks.createComment({
        taskId: task.id,
        kind: "agent",
        authorName: "Legacy",
        threadId: "thr_legacy",
        presetName: null,
        body: "Prior work",
        notifiedCount: 0,
      });
      tasks.upsertTaskThread({
        taskId: task.id,
        threadId: "thr_legacy",
        presetName: "Attached",
        title: "Worker",
        liveStatus: "idle",
      });
      // Migration 8 adds tables only. Remove them to reconstruct the exact v7 table layout.
      db.exec(
        "DROP TABLE orchestration_run_requests; DROP TABLE orchestration_runs; DELETE FROM schema_version WHERE version = 8;",
      );
      const tables = [
        "projects",
        "tasks",
        "comments",
        "attachments",
        "presets",
        "task_threads",
        "task_dependencies",
        "task_list_revision",
      ];
      const before = tables.map((name) =>
        db.prepare(`SELECT * FROM ${name}`).all(),
      );
      initializeTasksSchema(db);
      expect(
        tables.map((name) => db.prepare(`SELECT * FROM ${name}`).all()),
      ).toEqual(before);
      expect(tasks.getTask(task.id)?.parentTaskId).toBe(epic.id);
      expect(
        tasks.listComments(task.id).some((row) => row.id === comment.id),
      ).toBe(true);
      expect(
        db.prepare("SELECT version FROM schema_version ORDER BY version").all(),
      ).toHaveLength(8);
      initializeTasksSchema(db);
      expect(
        db.prepare("SELECT version FROM schema_version ORDER BY version").all(),
      ).toHaveLength(8);
      expect(db.prepare("SELECT * FROM orchestration_runs").all()).toEqual([]);
      expect(
        db.prepare("SELECT * FROM orchestration_run_requests").all(),
      ).toEqual([]);
    } finally {
      await harness.lifecycle.dispose();
    }
  });
});
