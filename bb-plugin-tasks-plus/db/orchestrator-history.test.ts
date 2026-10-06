import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createTasksStore } from "./index";
import { readHistory, seedHistory } from "../test-fixtures/orchestrator-history";

describe("retired Orchestrator storage compatibility", () => {
  it("preserves history across a database reopen and permits ordinary Tasks operations", () => {
    const directory = mkdtempSync(join(tmpdir(), "tasks-history-"));
    const path = join(directory, "tasks.db");
    let db = new Database(path);
    try {
      const fixture = seedHistory(db);
      const before = readHistory(db);
      db.close();
      db = new Database(path);
      const store = createTasksStore(db);
      createTasksStore(db);
      expect(readHistory(db)).toEqual(before);
      expect(store.getTask(fixture.task.id)).toEqual(fixture.task);
      expect(store.listComments(fixture.task.id)).toEqual([fixture.comment]);
      expect(store.listTaskThreads(fixture.task.id)).toEqual([fixture.association]);

      store.updateTask(fixture.task.id, { title: "Operator continues manually" });
      const comment = store.createComment({
        taskId: fixture.task.id,
        kind: "user",
        authorName: "Operator",
        body: "Manual update",
      });
      expect(store.listComments(fixture.task.id)).toContainEqual(comment);
      const updated = store.upsertTaskThread({
        ...fixture.association,
        title: "Manual worker link",
      });
      expect(updated.id).toBe(fixture.association.id);
      expect(
        db.prepare("SELECT role, primary_owner FROM task_threads WHERE id = ?").get(updated.id),
      ).toEqual({ role: "implementation", primary_owner: 1 });
      expect(store.deleteTaskThread(updated.id)).toBe(true);
      expect(store.listTaskThreads(fixture.task.id)).toEqual([]);
      expect(readHistory(db)).toEqual(before);
    } finally {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
