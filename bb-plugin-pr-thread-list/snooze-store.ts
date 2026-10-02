import type Database from "better-sqlite3";

export const SNOOZE_MIGRATIONS = [
  `CREATE TABLE snoozes (thread_id TEXT PRIMARY KEY, wake_at INTEGER NOT NULL, snoozed_at INTEGER NOT NULL);
   CREATE INDEX snoozes_wake_at ON snoozes (wake_at);`,
];

export interface SnoozeStore {
  list(): Record<string, number>;
  upsert(threadId: string, wakeAt: number, snoozedAt: number): void;
  delete(threadId: string): boolean;
  due(now: number): string[];
  deleteDue(threadId: string, now: number): void;
}

export function createSnoozeStore(db: Database.Database): SnoozeStore {
  const all = db.prepare<[], { thread_id: string; wake_at: number }>("SELECT thread_id, wake_at FROM snoozes");
  const upsert = db.prepare<[string, number, number]>(
    `INSERT INTO snoozes (thread_id, wake_at, snoozed_at) VALUES (?, ?, ?)
     ON CONFLICT (thread_id) DO UPDATE SET wake_at = excluded.wake_at, snoozed_at = excluded.snoozed_at`);
  const remove = db.prepare<[string]>("DELETE FROM snoozes WHERE thread_id = ?");
  const due = db.prepare<[number], { thread_id: string }>("SELECT thread_id FROM snoozes WHERE wake_at <= ?");
  const removeDue = db.prepare<[string, number]>("DELETE FROM snoozes WHERE thread_id = ? AND wake_at <= ?");
  return {
    list: () => Object.fromEntries(all.all().map((row) => [row.thread_id, row.wake_at])),
    upsert: (threadId, wakeAt, snoozedAt) => { upsert.run(threadId, wakeAt, snoozedAt); },
    delete: (threadId) => remove.run(threadId).changes > 0,
    due: (now) => due.all(now).map((row) => row.thread_id),
    deleteDue: (threadId, now) => { removeDue.run(threadId, now); },
  };
}
