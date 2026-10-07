import { createHash } from "node:crypto";
import type { HistoryDatabase } from "../storage/history-storage.js";
import type { importedUsage } from "./import-parser.js";
import type { Generation } from "./import-state.js";

type Usage = Extract<ReturnType<typeof importedUsage>, { kind: "usage" }>["record"];
export type UncertainReason = "workspace-unverified" | "unresolved-overlap" | "unresolved-ancestry";

export function initializeUncertainHistory(db: HistoryDatabase) {
  db.exec(`CREATE TABLE IF NOT EXISTS import_uncertain_candidates (
    generation TEXT NOT NULL, path TEXT NOT NULL, reason TEXT NOT NULL, PRIMARY KEY(generation,path));
    CREATE TABLE IF NOT EXISTS usage_uncertain (
    event_id TEXT PRIMARY KEY, generation TEXT NOT NULL, session_id TEXT NOT NULL,
    entry_id TEXT NOT NULL, workspace TEXT NOT NULL, occurred_at TEXT NOT NULL,
    total INTEGER NOT NULL, evidence TEXT NOT NULL, reason TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS uncertain_date ON usage_uncertain(occurred_at,event_id);
    CREATE INDEX IF NOT EXISTS uncertain_entry ON usage_uncertain(entry_id,evidence,event_id);
    CREATE INDEX IF NOT EXISTS uncertain_generation ON usage_uncertain(generation);`);
  // Historical import tables also exist in pre-compact migration fixtures.
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE name='usage_compact'").get())
    db.exec(
      "CREATE INDEX IF NOT EXISTS compact_uncertain_overlap ON usage_compact(session_id,occurred_at,total) WHERE accepted=1",
    );
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE name='usage_entry_owners'").get())
    db.exec(
      "CREATE INDEX IF NOT EXISTS owners_uncertain_entry ON usage_entry_owners(entry_id,event_id)",
    );
}

export function uncertainCandidate(db: HistoryDatabase, generation: string, path: string) {
  return (
    db
      .prepare("SELECT reason FROM import_uncertain_candidates WHERE generation=? AND path=?")
      .get(generation, path) as { reason: UncertainReason } | undefined
  )?.reason;
}

export function keepUncertainUsage(
  db: HistoryDatabase,
  g: Generation,
  entry: string,
  record: Usage,
  reason: UncertainReason,
) {
  if (record.occurredAt < g.start_at || record.occurredAt > g.end_at) return;
  // A shared entry plus scalar usage is a best-effort fork match, never verified ownership.
  const evidence = createHash("sha256")
    .update(
      JSON.stringify([
        record.occurredAt,
        record.model,
        record.inputTokens,
        record.outputTokens,
        record.cacheReadTokens,
        record.cacheWriteTokens,
        record.reasoningTokens,
        record.totalTokens,
      ]),
    )
    .digest("hex");
  db.prepare("INSERT OR IGNORE INTO usage_uncertain VALUES (?,?,?,?,?,?,?,?,?)").run(
    record.eventId,
    g.id,
    record.sessionId,
    entry,
    record.workspace,
    record.occurredAt,
    record.totalTokens,
    evidence,
    reason,
  );
}

function hasUncertainHistory(db: HistoryDatabase) {
  return !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='usage_uncertain'")
    .get();
}

export function uncertainTotals(
  db: HistoryDatabase,
  start: string,
  end: string,
  workspace?: string,
) {
  if (!hasUncertainHistory(db)) return { totalTokens: 0, records: 0 };
  // Do not double count accepted records, shared fork entries, or plausible live overlap.
  // These comparisons do not promote uncertain records into the canonical index.
  const row = db
    .prepare(`SELECT coalesce(sum(u.total),0) AS totalTokens,count(*) AS records
    FROM usage_uncertain u WHERE u.occurred_at>=? AND u.occurred_at<?
    ${workspace ? "AND u.workspace=?" : ""}
    AND NOT EXISTS(SELECT 1 FROM usage_compact c WHERE c.accepted=1 AND c.event_id=u.event_id)
    AND NOT EXISTS(SELECT 1 FROM usage_compact c WHERE c.accepted=1
      AND c.session_id=u.session_id AND c.occurred_at=u.occurred_at AND c.total=u.total)
    AND NOT EXISTS(SELECT 1 FROM usage_entry_owners o JOIN usage_compact c ON c.event_id=o.event_id
      WHERE c.accepted=1 AND o.entry_id=u.entry_id)
    AND NOT EXISTS(SELECT 1 FROM usage_uncertain earlier WHERE earlier.entry_id=u.entry_id
      AND earlier.evidence=u.evidence AND earlier.event_id<u.event_id)
  `)
    .get(start, end, ...(workspace ? [workspace] : [])) as { totalTokens: number; records: number };
  if (![row.totalTokens, row.records].every((n) => Number.isSafeInteger(n) && n >= 0))
    throw Error("Uncertain history total unavailable");
  return row;
}

export function pruneUncertainHistory(db: HistoryDatabase, cutoff: string, budget: number) {
  if (!hasUncertainHistory(db)) return false;
  db.prepare(`DELETE FROM usage_uncertain WHERE event_id IN
    (SELECT event_id FROM usage_uncertain WHERE occurred_at<? ORDER BY occurred_at,event_id LIMIT ?)`).run(
    cutoff,
    Math.max(0, budget),
  );
  return !!db.prepare("SELECT 1 FROM usage_uncertain WHERE occurred_at<? LIMIT 1").get(cutoff);
}
