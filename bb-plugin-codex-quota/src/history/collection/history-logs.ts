import { lstat, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { HistoryDatabase } from "../storage/history-storage.js";
const DAY = 86400000;
const day = (at: number) => new Date(at).toISOString().slice(0, 10);
const names = (date: string) => [`events-v1-${date}.jsonl`, `confirmations-v1-${date}.jsonl`];
const absent = (e: unknown) => !!e && typeof e === "object" && "code" in e && e.code === "ENOENT";
// This reserved metadata key is not a filename. Neutral numeric fields keep it out of
// source backlog and invalid-record queries. Its stamp stores the next unchecked date.
const DISCOVERY = "@collector-discovery-v1";
export function collectorDiscoveryProgress(db: HistoryDatabase) {
  const saved = db.prepare("SELECT stamp FROM collector_sources WHERE name=?").get(DISCOVERY) as
    | { stamp: string }
    | undefined;
  if (saved) return saved.stamp;
  return (
    db.prepare("SELECT first_observed FROM collector_meta WHERE id=1").get() as {
      first_observed: string;
    }
  ).first_observed.slice(0, 10);
}
function olderDates(db: HistoryDatabase, now: number) {
  const start = Date.parse(collectorDiscoveryProgress(db) + "T00:00:00Z");
  const cutoff = day(now - 45 * DAY);
  return Array.from({ length: 14 }, (_, n) => day(start + n * DAY)).filter((date) => date < cutoff);
}
/** Advance only after both owned sources on every date in this slice are drained or absent.
 * An interrupted request can replay the slice from its committed per-source offsets. */
export function completeCollectorDiscovery(db: HistoryDatabase, now: number, pending: Set<string>) {
  const dates = olderDates(db, now);
  if (dates.length && !dates.flatMap(names).some((name) => pending.has(name))) {
    const next = day(Date.parse(dates.at(-1)! + "T00:00:00Z") + DAY);
    db.prepare("INSERT OR REPLACE INTO collector_sources VALUES (?, '', 0, ?, 0, 0, '', 0, 0)").run(
      DISCOVERY,
      next,
    );
  }
  return collectorDiscoveryProgress(db) < day(now - 45 * DAY);
}
function retentionCursor(db: HistoryDatabase) {
  const meta = db.prepare("SELECT first_observed FROM collector_meta WHERE id=1").get() as {
    first_observed: string;
  };
  db.prepare("INSERT OR IGNORE INTO collector_log_retention VALUES (1,?)").run(
    meta.first_observed.slice(0, 10),
  );
  return (
    db.prepare("SELECT date FROM collector_log_retention WHERE id=1").get() as { date: string }
  ).date;
}
/** Deterministic daily names bound discovery without a directory or transcript scan. */
export function collectorLogNames(db: HistoryDatabase, now: number) {
  const recent = Array.from({ length: 47 }, (_, n) => names(day(now - n * DAY))).flat();
  const aging = olderDates(db, now).flatMap(names);
  const events = [
    "events-v1.jsonl",
    ...new Set([...aging, ...recent].filter((n) => n.startsWith("events"))),
  ];
  const confirmations = [
    "confirmations-v1.jsonl",
    ...new Set([...aging, ...recent].filter((n) => n.startsWith("confirmations"))),
  ];
  events.unshift("events-legacy-retained-v1.jsonl");
  confirmations.unshift("confirmations-legacy-retained-v1.jsonl");
  return [...events, ...confirmations];
}
export async function pruneCollectorLogs(
  db: HistoryDatabase,
  directory: string,
  now: number,
  signal: AbortSignal,
) {
  let date = retentionCursor(db),
    pending = false;
  const cutoff = day(now - 45 * DAY);
  for (let dates = 0; date < cutoff && dates < 14; dates++) {
    let ready = true;
    for (const name of names(date)) {
      signal.throwIfAborted();
      const path = join(directory, name);
      let stat;
      try {
        stat = await lstat(path);
      } catch (e) {
        if (absent(e)) continue;
        throw e;
      }
      if (!stat.isFile() || stat.isSymbolicLink()) throw Error("Collector source unavailable");
      const source = db.prepare("SELECT * FROM collector_sources WHERE name=?").get(name) as
        | { identity: string; stamp: string; offset: number; dropping: number; invalid: number }
        | undefined;
      if (
        !source ||
        source.identity !== `${stat.dev}:${stat.ino}` ||
        source.stamp !== `${stat.mtimeMs}:${stat.ctimeMs}` ||
        source.offset !== stat.size ||
        source.dropping
      ) {
        ready = false;
        continue;
      }
      // Current writers only append to today's partition. Old partitions have been indexed fully.
      await unlink(path);
      db.transaction(() => {
        db.prepare("UPDATE history_counters SET invalid_records=invalid_records+? WHERE id=1").run(
          source.invalid,
        );
        db.prepare("DELETE FROM collector_sources WHERE name=?").run(name);
      });
    }
    if (!ready) {
      pending = true;
      break;
    }
    date = day(Date.parse(date + "T00:00:00Z") + DAY);
    db.prepare("UPDATE collector_log_retention SET date=? WHERE id=1").run(date);
  }
  pending ||= date < cutoff;
  // Legacy writers do not obey partition ownership. Never rewrite or delete their shared files.
  let legacyLogsPending = false;
  for (const name of ["events-v1.jsonl", "confirmations-v1.jsonl"]) {
    try {
      const stat = await lstat(join(directory, name));
      if (!stat.isFile() || stat.isSymbolicLink()) throw Error("Collector source unavailable");
      legacyLogsPending = true;
    } catch (e) {
      if (!absent(e)) throw e;
    }
  }
  return { pending, legacyLogsPending };
}
