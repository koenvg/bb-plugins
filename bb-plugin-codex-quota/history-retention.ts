import { createHash } from "node:crypto";
import type { HistoryDatabase } from "./history-storage.js";
import { usageRecordSchema } from "./usage-record.js";
import { randomUUID } from "node:crypto";
import { canonicalInterval, historyScope, readCoverage } from "./history-coverage.js";

export const HISTORY_VERSION = 2;
export type CompactRow = { event_id:string; session_id:string; workspace:string; total:number; accepted:number; confirmed:number; occurred_at:string; captured_cost:number|null; digest:string; evidence:string; provider_key:string|null; claimed_thread:string|null; verified_thread:string|null; recorded_host:string; detail_available:number };
export const digest = (value:string) => createHash("sha256").update(value).digest("hex");
export function usageEvidence(payload:string) {
  const {eventId:_id,claimedThreadId:_claim,providerSessionKey:_file,...values}=JSON.parse(payload);
  return digest(JSON.stringify(values));
}
export function createRetentionSchema(db:HistoryDatabase, backfill:boolean) {
  db.exec(`CREATE TABLE IF NOT EXISTS usage_compact (
    event_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, workspace TEXT NOT NULL, total INTEGER NOT NULL,
    accepted INTEGER NOT NULL, confirmed INTEGER NOT NULL, occurred_at TEXT NOT NULL, captured_cost REAL,
    digest TEXT NOT NULL, evidence TEXT NOT NULL, provider_key TEXT, claimed_thread TEXT, verified_thread TEXT, recorded_host TEXT NOT NULL, provenance TEXT NOT NULL,
    detail_available INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS compact_expiry ON usage_compact(occurred_at,event_id);
    CREATE INDEX IF NOT EXISTS compact_workspace_date ON usage_compact(workspace,occurred_at,event_id);
    CREATE INDEX IF NOT EXISTS compact_thread_date ON usage_compact(verified_thread,occurred_at,event_id);
    CREATE INDEX IF NOT EXISTS compact_accepted_date ON usage_compact(accepted,occurred_at,event_id);
    CREATE INDEX IF NOT EXISTS compact_workspace_accepted_date ON usage_compact(workspace,accepted,occurred_at,event_id);
    CREATE INDEX IF NOT EXISTS compact_thread_accepted_date ON usage_compact(verified_thread,accepted,occurred_at,event_id);
    CREATE INDEX IF NOT EXISTS compact_detail_expiry ON usage_compact(detail_available,occurred_at,event_id);
    CREATE TABLE IF NOT EXISTS history_retention (id INTEGER PRIMARY KEY CHECK(id=1), detail_cutoff TEXT NOT NULL, compact_cutoff TEXT NOT NULL, backfill_cursor TEXT NOT NULL, backfill_done INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS collector_log_retention (id INTEGER PRIMARY KEY CHECK(id=1), date TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS usage_expired (event_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS history_coverage (id TEXT PRIMARY KEY, workspace TEXT, thread_id TEXT, started TEXT NOT NULL, ended TEXT NOT NULL, kind TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS coverage_scope ON history_coverage(workspace,thread_id,started,ended);
    CREATE TABLE IF NOT EXISTS history_recovery (id INTEGER PRIMARY KEY CHECK(id=1), started TEXT NOT NULL, ended TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS history_reconciliation (id INTEGER PRIMARY KEY CHECK(id=1), started TEXT NOT NULL, ended TEXT NOT NULL, pending INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS pending_collector_sources ON collector_sources(name) WHERE offset<size OR dropping=1;
    CREATE INDEX IF NOT EXISTS uncertain_collector_sources ON collector_sources(name) WHERE invalid>0;
    CREATE INDEX IF NOT EXISTS coverage_interval ON history_coverage(started,id);
    CREATE INDEX IF NOT EXISTS coverage_thread_interval ON history_coverage(thread_id,started,id);
    CREATE TABLE IF NOT EXISTS history_owner (id INTEGER PRIMARY KEY CHECK(id=1), host_key TEXT NOT NULL);
    PRAGMA user_version = 2;`);
  db.prepare("INSERT OR IGNORE INTO history_retention VALUES (1,'','','',?)").run(backfill ? 0 : 1);
  db.prepare("INSERT OR IGNORE INTO history_owner VALUES (1,?)").run(randomUUID());
}
export function insertCompact(db:HistoryDatabase, payload:string, accepted:number, confirmed:number) {
  const value=usageRecordSchema.parse(JSON.parse(payload));
  value.occurredAt=new Date(value.occurredAt).toISOString(); payload=JSON.stringify(value);
  db.prepare("INSERT OR IGNORE INTO usage_compact VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,(SELECT host_key FROM history_owner WHERE id=1),'observed',1)").run(value.eventId,value.sessionId,value.workspace,value.totalTokens,accepted,confirmed,value.occurredAt,value.capturedCost,digest(payload),usageEvidence(payload),value.providerSessionKey,value.claimedThreadId);
  db.prepare("UPDATE usage_entry_owners SET evidence=? WHERE event_id=? AND substr(evidence,1,1)='{' ").run(usageEvidence(payload),value.eventId);
}
export function retentionCutoffs(now:number) {
  const today=new Date(now), day=today.getUTCDate();
  const month=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()-3,1));
  const last=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();
  month.setUTCDate(Math.min(day,last)-9);
  return {detail:new Date(now-45*86400000).toISOString(),compact:month.toISOString()};
}
type Retention = {detail_cutoff:string;compact_cutoff:string;backfill_cursor:string;backfill_done:number};
export function retentionState(db:HistoryDatabase) { return db.prepare("SELECT * FROM history_retention WHERE id=1").get() as Retention; }
export function maintainHistory(db:HistoryDatabase, now:number, budget=500) {
  const limit=Math.max(1,Math.min(500,Math.floor(budget))), cutoffs=retentionCutoffs(now);
  return db.transaction(()=>{
    let state=retentionState(db);
    db.prepare("UPDATE history_retention SET detail_cutoff=max(detail_cutoff,?),compact_cutoff=max(compact_cutoff,?) WHERE id=1").run(cutoffs.detail,cutoffs.compact);
    if (!state.backfill_done) {
      const rows=db.prepare("SELECT event_id,payload,accepted,confirmed FROM usage_events WHERE event_id>? ORDER BY event_id LIMIT ?").all(state.backfill_cursor,limit) as {event_id:string;payload:string;accepted:number;confirmed:number}[];
      for(const row of rows) insertCompact(db,row.payload,row.accepted,row.confirmed);
      db.prepare("UPDATE history_retention SET backfill_cursor=?,backfill_done=? WHERE id=1").run(rows.at(-1)?.event_id??state.backfill_cursor,rows.length<limit?1:0);
      return {pending:true,...cutoffs};
    }
    state=retentionState(db);
    const expired=db.prepare("SELECT * FROM usage_compact WHERE occurred_at<? ORDER BY occurred_at,event_id LIMIT ?").all(state.compact_cutoff,limit) as CompactRow[];
    for(const row of expired) {
      if(row.accepted) {
        db.prepare("UPDATE workspace_totals SET total_tokens=total_tokens-?,events=events-1 WHERE workspace=?").run(row.total,row.workspace);
        db.prepare("DELETE FROM workspace_totals WHERE workspace=? AND events=0").run(row.workspace);
      }
      if(!row.confirmed) db.prepare("UPDATE history_counters SET unconfirmed_events=unconfirmed_events-1 WHERE id=1").run();
      db.prepare("INSERT OR IGNORE INTO usage_expired VALUES (?)").run(row.event_id);
      db.prepare("DELETE FROM usage_events WHERE event_id=?").run(row.event_id);
      db.prepare("DELETE FROM usage_compact WHERE event_id=?").run(row.event_id);
    }
    const details=db.prepare("SELECT event_id FROM usage_compact WHERE detail_available=1 AND occurred_at<? ORDER BY occurred_at,event_id LIMIT ?").all(state.detail_cutoff,limit-expired.length) as {event_id:string}[];
    for(const row of details) {
      db.prepare("DELETE FROM usage_events WHERE event_id=?").run(row.event_id);
      db.prepare("UPDATE usage_compact SET detail_available=0 WHERE event_id=?").run(row.event_id);
    }
    const pending=!!db.prepare("SELECT event_id FROM usage_compact WHERE occurred_at<? LIMIT 1").get(state.compact_cutoff) || !!db.prepare("SELECT event_id FROM usage_compact WHERE detail_available=1 AND occurred_at<? LIMIT 1").get(state.detail_cutoff);
    return {pending,detail:state.detail_cutoff,compact:state.compact_cutoff};
  });
}
export type CalendarQuery = {start:string;end:string;workspace?:string;verifiedThread?:string;timezone:string};
/** Internal report integration seam. Bounded compact query, never a detailed-event scan. */
export function readCalendarTotals(db: HistoryDatabase, query: CalendarQuery) {
  const interval = canonicalInterval(query.start, query.end, 32), scope = historyScope(query);
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: query.timezone, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const state = retentionState(db);
  const filter = scope.kind === "host" ? { sql: "1=1", values: [] as string[] }
    : scope.kind === "workspace" ? { sql: "workspace=?", values: [scope.workspace] }
    : { sql: "verified_thread=?", values: [scope.verifiedThread] };
  const rows = db.prepare(`SELECT occurred_at,total,captured_cost,detail_available FROM usage_compact
    WHERE ${filter.sql} AND occurred_at>=? AND occurred_at<? AND accepted=1
    ORDER BY occurred_at,event_id LIMIT 10001`)
    .all(...filter.values, interval.start < state.compact_cutoff ? state.compact_cutoff : interval.start, interval.end) as
    Pick<CompactRow, "occurred_at" | "total" | "captured_cost" | "detail_available">[];
  const days = new Map<string, { date: string; totalTokens: number; capturedCost: number; pricedEvents: number; events: number }>();
  for (const row of rows.slice(0, 10000)) {
    const date = format.format(new Date(row.occurred_at));
    const day = days.get(date) ?? { date, totalTokens: 0, capturedCost: 0, pricedEvents: 0, events: 0 };
    day.totalTokens += row.total;
    day.events++;
    if (row.captured_cost !== null) {
      day.capturedCost += row.captured_cost;
      day.pricedEvents++;
    }
    if (!Number.isSafeInteger(day.totalTokens)) throw Error("History totals unavailable");
    days.set(date, day);
  }
  const coverage = readCoverage(db, { ...query, ...interval }), truncated = rows.length > 10000;
  return {
    coverage: truncated && coverage.state !== "unavailable"
      ? { ...coverage, state: "incomplete" as const, zero: false, truncated: true } : coverage,
    days: [...days.values()], truncated,
    detail: interval.start < state.detail_cutoff || rows.some(row => !row.detail_available)
      ? "unavailable" as const : "available" as const,
    expired: interval.start < state.compact_cutoff, pending: !state.backfill_done,
  };
}
