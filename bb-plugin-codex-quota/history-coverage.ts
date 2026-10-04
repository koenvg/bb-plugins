import { z } from "zod";
import type { HistoryDatabase } from "./history-storage.js";

const kinds = ["writer-active", "observed-inactivity", "imported", "omission", "uncertain", "backlog"] as const;
const negativeKinds = new Set<string>(["omission", "uncertain", "backlog"]);
const utcInstant = z.iso.datetime({ offset: true });
export function canonicalInterval(start: string, end: string, maximumDays?: number) {
  const first = Date.parse(utcInstant.parse(start)), last = Date.parse(utcInstant.parse(end));
  if (last <= first || maximumDays !== undefined && last - first > maximumDays * 86400000) {
    throw Error("History range unavailable");
  }
  return { start: new Date(first).toISOString(), end: new Date(last).toISOString() };
}
export const coverageEvidenceSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), workspace: z.string().min(1).max(16384).nullable(),
  threadId: z.string().regex(/^thr_[A-Za-z0-9_-]{1,124}$/).nullable(),
  start: utcInstant, end: utcInstant, kind: z.enum(kinds),
}).strict().refine(value => Date.parse(value.start) < Date.parse(value.end));
export type CoverageEvidence = z.infer<typeof coverageEvidenceSchema>;
/** Verified adapters and typed fixtures only. No discovery or transcript access. */
export function recordCoverage(db: HistoryDatabase, input: CoverageEvidence) {
  const value = coverageEvidenceSchema.parse(input), interval = canonicalInterval(value.start, value.end);
  db.prepare("INSERT OR IGNORE INTO history_coverage VALUES (?,?,?,?,?,?)")
    .run(value.id, value.workspace, value.threadId, interval.start, interval.end, value.kind);
}

export type HistoryScope = { kind: "host" } | { kind: "workspace"; workspace: string }
  | { kind: "thread"; verifiedThread: string; workspace?: string };
export type CoverageQuery = { start: string; end: string; workspace?: string; verifiedThread?: string };
export function historyScope(query: Pick<CoverageQuery, "workspace" | "verifiedThread">): HistoryScope {
  if (query.verifiedThread) return { kind: "thread", verifiedThread: query.verifiedThread, workspace: query.workspace };
  return query.workspace ? { kind: "workspace", workspace: query.workspace } : { kind: "host" };
}
type EvidenceRow = { workspace: string | null; thread_id: string | null; started: string; ended: string; kind: string };
/** Interrupted or budget-limited ingestion has unknown original scope and instants.
 * It affects every retained interval on this host until a full reconciliation clears it. */
export function recordReconciliation(db: HistoryDatabase, pending: boolean) {
  const retention = db.prepare("SELECT compact_cutoff FROM history_retention WHERE id=1").get() as { compact_cutoff: string };
  db.prepare("INSERT OR REPLACE INTO history_reconciliation VALUES (1,?,?,?)")
    .run(retention.compact_cutoff || "0000-01-01T00:00:00.000Z", "9999-12-31T23:59:59.999Z", pending ? 1 : 0);
}
/** Keep an invalid source's past uncertainty after its log/progress row is retired. */
export function recordSourceUncertainty(db: HistoryDatabase, id: string, observedAt: number) {
  const retention = db.prepare("SELECT compact_cutoff FROM history_retention WHERE id=1").get() as { compact_cutoff: string };
  const start = retention.compact_cutoff || "0000-01-01T00:00:00.000Z", end = new Date(observedAt).toISOString();
  if (start >= end) return;
  recordCoverage(db, { id, workspace: null, threadId: null, start, end, kind: "uncertain" });
}

function evidenceScope(scope: HistoryScope) {
  if (scope.kind === "host") return { sql: "1=1", values: [] as string[] };
  if (scope.kind === "workspace") return {
    sql: "thread_id IS NULL AND (workspace IS NULL OR workspace=?)", values: [scope.workspace],
  };
  // If original workspace is not established, broader negative evidence remains uncertain.
  // It must not certify zero by guessing that this thread belongs to a different workspace.
  return scope.workspace ? {
    sql: "thread_id=? OR (thread_id IS NULL AND (workspace IS NULL OR workspace=?))",
    values: [scope.verifiedThread, scope.workspace],
  } : { sql: "thread_id=? OR thread_id IS NULL", values: [scope.verifiedThread] };
}
function positiveApplies(row: EvidenceRow, scope: HistoryScope) {
  if (scope.kind === "host") return row.workspace === null && row.thread_id === null;
  if (scope.kind === "workspace") return row.workspace === scope.workspace && row.thread_id === null;
  return row.thread_id === scope.verifiedThread;
}
/** Single coverage authority: evidence, source progress, pauses and recovery are read together. */
export function readCoverage(db: HistoryDatabase, query: CoverageQuery) {
  const { start, end } = canonicalInterval(query.start, query.end, 32), scope = historyScope(query);
  const filter = evidenceScope(scope);
  const rows = db.prepare(`SELECT workspace,thread_id,started,ended,kind FROM history_coverage
    WHERE (${filter.sql}) AND started<? AND ended>? ORDER BY started,id LIMIT 1001`)
    .all(...filter.values, end, start) as EvidenceRow[];
  const pauses = db.prepare("SELECT id FROM collector_pauses WHERE started<? AND (ended IS NULL OR ended>?) LIMIT 1001")
    .all(end, start);
  const recovery = !!db.prepare("SELECT id FROM history_recovery WHERE started<? AND ended>? LIMIT 1").get(end, start);
  const retention = db.prepare("SELECT backfill_done,compact_cutoff FROM history_retention WHERE id=1").get() as { backfill_done: number; compact_cutoff: string };
  const reconciliation = !!db.prepare("SELECT id FROM history_reconciliation WHERE pending=1 AND started<? AND ended>? LIMIT 1")
    .get(end, start);
  const sourcePending = !!db.prepare("SELECT name FROM collector_sources WHERE offset<size OR dropping=1 LIMIT 1").get();
  const sourceUncertain = !!db.prepare("SELECT name FROM collector_sources WHERE invalid>0 LIMIT 1").get();
  const expired = start < retention.compact_cutoff;
  const legacyPending = !!db.prepare("SELECT id FROM history_legacy_pending WHERE pending=1 LIMIT 1").get();
  const backlog = legacyPending || !retention.backfill_done || reconciliation || sourcePending || rows.some(row => row.kind === "backlog");
  const truncated = rows.length > 1000 || pauses.length > 1000;
  const incomplete = recovery || pauses.length > 0 || rows.some(row => negativeKinds.has(row.kind)) || backlog || sourceUncertain || truncated;
  const eventFilter = scope.kind === "host" ? { sql: "1=1", values: [] as string[] }
    : scope.kind === "workspace" ? { sql: "workspace=?", values: [scope.workspace] }
    : { sql: "verified_thread=?", values: [scope.verifiedThread] };
  const hasEvents = !!db.prepare(`SELECT event_id FROM usage_compact WHERE ${eventFilter.sql}
    AND occurred_at>=? AND occurred_at<? LIMIT 1`).get(...eventFilter.values, start, end);
  const covers = (kind: string) => {
    let cursor = start;
    for (const row of rows) {
      if (row.kind !== kind || !positiveApplies(row, scope)) continue;
      if (row.started > cursor) return false;
      if (row.ended > cursor) cursor = row.ended;
      if (cursor >= end) return true;
    }
    return false;
  };
  const inactivity = !hasEvents && !incomplete && covers("observed-inactivity");
  return {
    state: expired ? "unavailable" as const : incomplete ? "incomplete" as const : inactivity ? "observed-inactivity" as const
      : covers("imported") ? "imported" as const : hasEvents ? "observed" as const : "uncovered" as const,
    zero: inactivity && !expired, writerActive: covers("writer-active"), pauses: Math.min(pauses.length, 1000),
    omissions: rows.filter(row => row.kind === "omission").length,
    uncertain: sourceUncertain || rows.some(row => row.kind === "uncertain") || scope.kind === "thread" && !scope.workspace
      && rows.some(row => row.workspace !== null && row.thread_id === null && negativeKinds.has(row.kind)),
    backlog, recoveryGap: recovery, truncated,
  };
}
