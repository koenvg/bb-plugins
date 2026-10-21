import { createHash } from "node:crypto";
import type { HistoryDatabase } from "./history-storage.js";

export const responseId = (raw: unknown): string | null =>
  typeof raw === "string" && /^resp_[A-Za-z0-9_-]{1,250}$/.test(raw) ? raw : null;
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function responseKey(db: HistoryDatabase, id: string) {
  const owner = db.prepare("SELECT host_key FROM history_owner WHERE id=1").get() as {
    host_key: string;
  };
  return hash(`${owner.host_key}:openai-codex:${id}`);
}
export function initializeUsageMetadata(db: HistoryDatabase) {
  db.exec(`CREATE TABLE IF NOT EXISTS usage_metadata (
    event_id TEXT PRIMARY KEY, source TEXT NOT NULL, speed TEXT NOT NULL, origin TEXT NOT NULL,
    speed_conflict INTEGER NOT NULL, provider_thread TEXT, classes_available INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS usage_response_owners (
    response_key TEXT PRIMARY KEY, pi_event TEXT, native_event TEXT, native_evidence TEXT, native_conflicted INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS native_sources (name TEXT PRIMARY KEY, identity TEXT NOT NULL,
    size INTEGER NOT NULL, stamp TEXT NOT NULL, offset INTEGER NOT NULL, edge TEXT NOT NULL,
    context TEXT NOT NULL, incomplete INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS native_discovery (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL, pending INTEGER NOT NULL, incomplete INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS metadata_source ON usage_metadata(source,event_id);`);
}
export function recordSourceMetadata(
  db: HistoryDatabase,
  eventId: string,
  source: "pi" | "codex-native",
  providerThread: string | null = null,
  classesAvailable = true,
) {
  if (!db.prepare("SELECT event_id FROM usage_compact WHERE event_id=?").get(eventId)) return;
  // Schema 5 retains historical columns. New rows use inert values without rewriting old evidence.
  db.prepare("INSERT OR IGNORE INTO usage_metadata VALUES (?,?, '','',0,?,?)").run(
    eventId,
    source,
    providerThread,
    classesAvailable ? 1 : 0,
  );
}
/** Pi owns exact cross-source aliases, including its captured price. Native disagreement cannot exclude Pi. */
export function recordPiMetadata(
  db: HistoryDatabase,
  eventId: string,
  metadata?: { responseId: string | null },
) {
  const row = db.prepare("SELECT accepted FROM usage_compact WHERE event_id=?").get(eventId) as
    | { accepted: number }
    | undefined;
  if (!row) return;
  recordSourceMetadata(db, eventId, "pi");
  const id = responseId(metadata?.responseId);
  if (!id || !row.accepted) return;
  const key = responseKey(db, id);
  const prior = db
    .prepare("SELECT native_event FROM usage_response_owners WHERE response_key=?")
    .get(key) as { native_event: string | null } | undefined;
  if (prior?.native_event) excludeNative(db, prior.native_event);
  db.prepare(`INSERT INTO usage_response_owners VALUES (?,?,NULL,NULL,0)
    ON CONFLICT(response_key) DO UPDATE SET pi_event=coalesce(pi_event,excluded.pi_event)`).run(
    key,
    eventId,
  );
}
export function excludeNative(db: HistoryDatabase, eventId: string) {
  const row = db
    .prepare("SELECT workspace,total,accepted FROM usage_compact WHERE event_id=?")
    .get(eventId) as { workspace: string; total: number; accepted: number } | undefined;
  if (!row?.accepted) return;
  db.prepare(
    "UPDATE workspace_totals SET total_tokens=total_tokens-?,events=events-1 WHERE workspace=?",
  ).run(row.total, row.workspace);
  db.prepare("DELETE FROM workspace_totals WHERE workspace=? AND events=0").run(row.workspace);
  db.prepare("UPDATE usage_events SET accepted=0 WHERE event_id=?").run(eventId);
  db.prepare("UPDATE usage_compact SET accepted=0 WHERE event_id=?").run(eventId);
}
export function metadataColumns(db: HistoryDatabase) {
  const version = (db.prepare("PRAGMA user_version").get() as { user_version: number })
    .user_version;
  return version >= 5
    ? {
        join: "LEFT JOIN usage_metadata m ON m.event_id=c.event_id",
        native: "coalesce(m.source,'pi')='codex-native'",
        missing: "e.event_id IS NULL OR m.classes_available=0",
      }
    : {
        join: "",
        native: "0",
        missing: "e.event_id IS NULL",
      };
}
