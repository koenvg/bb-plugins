import { describe, expect, it } from "vitest";
import { fixture } from "./dispatch-test-fixture";
import { createDispatchStore } from "./dispatch-store";
import { createRunStore } from "./run-store";
import { initializeTasksSchema } from "../db/schema";

describe("migration 9 and durable task/role claims", () => {
  it("preserves migration 8 runs, presets and legacy rows without assigning an owner", async () => {
    const f = await fixture();
    const db = f.bb.storage.database();
    const association = f.store.tasks.upsertTaskThread({
      taskId: f.task.id,
      threadId: "thr_legacy",
      presetName: "Attached",
      title: "Legacy",
      liveStatus: "idle",
    });
    const run = createRunStore(db).getRun(f.input.runId);
    db.exec(
      "DROP TABLE orchestration_dispatch_claims; DROP TABLE orchestration_owners; DROP INDEX idx_task_threads_primary_role; ALTER TABLE task_threads DROP COLUMN primary_owner; ALTER TABLE task_threads DROP COLUMN role; DELETE FROM schema_version WHERE version=9",
    );
    initializeTasksSchema(db);
    initializeTasksSchema(db);
    expect(createRunStore(db).getRun(f.input.runId)).toEqual(run);
    expect(f.store.tasks.getPreset(f.preset.id)).toEqual(f.preset);
    expect(
      db
        .prepare("SELECT role,primary_owner FROM task_threads WHERE id=?")
        .get(association.id),
    ).toEqual({ role: null, primary_owner: 0 });
    expect(createDispatchStore(db).owners(f.task.id)).toEqual([]);
  });
  it("rejects a duplicate live claim across separate stores and runs", async () => {
    const f = await fixture();
    const a = createDispatchStore(f.bb.storage.database());
    const b = createDispatchStore(f.bb.storage.database());
    const first = a.reserve(f.input);
    expect(() => b.reserve({ ...f.input, runId: "different-run" })).toThrow(
      "UNIQUE",
    );
    expect(b.live(f.task.id, "implementation")?.id).toBe(first.id);
  });
  it("rolls back a reserved claim when its transaction fails", async () => {
    const f = await fixture();
    const claims = createDispatchStore(f.bb.storage.database());
    expect(() =>
      f.store.transaction(() => {
        claims.reserve(f.input);
        throw new Error("rollback");
      }),
    ).toThrow("rollback");
    expect(claims.live(f.task.id, "implementation")).toBeNull();
  });
  it("preserves ownership after manual detach and rejects duplicate role designation", async () => {
    const f = await fixture();
    await f.dispatch();
    const claims = createDispatchStore(f.bb.storage.database());
    const owner = claims.owners(f.task.id)[0]!;
    expect(() => f.store.transaction(() => claims.designate(owner))).toThrow(
      "UNIQUE",
    );
    f.store.tasks.deleteTaskThread(owner.associationId);
    expect(claims.owners(f.task.id)).toEqual([owner]);
    expect(claims.live(f.task.id, "implementation")?.threadId).toBe(
      owner.threadId,
    );
  });
});
