import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createSnoozeStore, SNOOZE_MIGRATIONS, type SnoozeStore } from "./snooze-store";

describe("snooze store", () => {
  let store: SnoozeStore;
  beforeEach(() => {
    const db = new Database(":memory:");
    for (const statement of SNOOZE_MIGRATIONS) db.exec(statement);
    store = createSnoozeStore(db);
  });

  it("lists snoozes by thread id", () => {
    store.upsert("thr_1", 2_000, 1_000);
    store.upsert("thr_2", 3_000, 1_000);

    expect(store.list()).toEqual({ thr_1: 2_000, thr_2: 3_000 });
  });

  it("replaces the wake time of a thread that is already snoozed", () => {
    store.upsert("thr_1", 2_000, 1_000);
    store.upsert("thr_1", 5_000, 1_500);

    expect(store.list()).toEqual({ thr_1: 5_000 });
  });

  it("deletes a snooze and tells whether one existed", () => {
    store.upsert("thr_1", 2_000, 1_000);

    expect(store.delete("thr_1")).toBe(true);
    expect(store.delete("thr_1")).toBe(false);
    expect(store.list()).toEqual({});
  });

  it("keeps a snooze on a due delete when it was moved to a later time", () => {
    store.upsert("thr_1", 2_000, 1_000);
    store.upsert("thr_1", 9_000, 1_500);

    store.deleteDue("thr_1", 2_000);

    expect(store.list()).toEqual({ thr_1: 9_000 });
  });

  it("selects only the threads whose wake time has come", () => {
    store.upsert("thr_past", 1_000, 500);
    store.upsert("thr_now", 2_000, 500);
    store.upsert("thr_later", 3_000, 500);

    expect(store.due(2_000).sort()).toEqual(["thr_now", "thr_past"]);
  });
});
