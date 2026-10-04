import { supportedHistoryVersion, supportedHistoryLayout, type HistoryDatabase } from "./history-storage.js";
import type { HistoryReadiness } from "./history-contract.js";
import { usageRecordSchema, type parseCompact } from "./usage-record.js";
import { sameCompactUsage, sameUsageEvidence } from "./usage-evidence.js";
import { HISTORY_VERSION, createRetentionSchema, insertCompact, retentionState, type CompactRow } from "./history-retention.js";
import { initializeIdentityStorage } from "./identity-storage.js";
import { initializeImport } from "./import-state.js";

type CompactRecord = NonNullable<ReturnType<typeof parseCompact>>;
type EventRow = CompactRow;
type UsageRecord = Extract<CompactRecord, {workspace: string}>;
type ConfirmedUsage = {eventId: string; record: UsageRecord; accepted: boolean};
export function initializeWriterObservation(db: HistoryDatabase) {
  db.exec(`CREATE TABLE IF NOT EXISTS history_writer_observation (id INTEGER PRIMARY KEY CHECK(id=1), observed INTEGER NOT NULL);
    CREATE TRIGGER IF NOT EXISTS history_live_writer AFTER INSERT ON usage_events WHEN json_extract(new.payload,'$.provenance')='observed' BEGIN UPDATE history_writer_observation SET observed=1 WHERE id=1; END;`);
  db.prepare("INSERT OR IGNORE INTO history_writer_observation SELECT 1,CASE WHEN observed_events>0 THEN 1 ELSE 0 END FROM history_counters WHERE id=1").run();
}
type Binding = { session_id: string; entry_id: string };
type Owner = { event_id: string; evidence: string; conflicted: number };

export function initializeHistory(db: HistoryDatabase, firstObservedAt: string, collector = true) {
  const version = (db.prepare("PRAGMA user_version").get() as {user_version:number}).user_version;
  if (version !== 0 && (!supportedHistoryVersion(version) || !supportedHistoryLayout(db,version))) throw Error("History schema unsupported");
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS collector_meta (id INTEGER PRIMARY KEY CHECK(id=1), first_observed TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS collector_pauses (id INTEGER PRIMARY KEY, started TEXT NOT NULL, ended TEXT);
      CREATE INDEX IF NOT EXISTS open_pauses ON collector_pauses(ended) WHERE ended IS NULL;
      CREATE TABLE IF NOT EXISTS history_counters (id INTEGER PRIMARY KEY CHECK(id=1), observed_events INTEGER NOT NULL, unconfirmed_events INTEGER NOT NULL, invalid_records INTEGER NOT NULL, conflicting_entries INTEGER NOT NULL, pause_count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS usage_events (event_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, workspace TEXT NOT NULL, total INTEGER NOT NULL, payload TEXT NOT NULL, accepted INTEGER NOT NULL, confirmed INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS usage_confirmations (event_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, entry_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS usage_conflicts (event_id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS usage_entry_owners (session_id TEXT NOT NULL, entry_id TEXT NOT NULL, event_id TEXT NOT NULL UNIQUE, evidence TEXT NOT NULL, conflicted INTEGER NOT NULL, PRIMARY KEY(session_id,entry_id));
      CREATE TABLE IF NOT EXISTS workspace_totals (workspace TEXT PRIMARY KEY, total_tokens INTEGER NOT NULL, events INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS workspace_ranking ON workspace_totals(total_tokens DESC,workspace);
      CREATE TABLE IF NOT EXISTS collector_sources (name TEXT PRIMARY KEY, identity TEXT NOT NULL, size INTEGER NOT NULL, stamp TEXT NOT NULL, offset INTEGER NOT NULL, dropping INTEGER NOT NULL, edge TEXT NOT NULL, invalid INTEGER NOT NULL, stalled INTEGER NOT NULL);`);
    if (collector) db.prepare("INSERT OR IGNORE INTO collector_meta VALUES (1, ?)").run(firstObservedAt);
    db.prepare("INSERT OR IGNORE INTO history_counters VALUES (1,0,0,0,0,0)").run();
    createRetentionSchema(db, version === 1);
    initializeWriterObservation(db);
    initializeIdentityStorage(db);
    if (version !== HISTORY_VERSION) db.prepare("UPDATE identity_receipt SET backfill=0,backfilled=0 WHERE id=1").run();
    initializeImport(db);
    db.exec(`PRAGMA user_version = ${HISTORY_VERSION}`);
  });
}
export function recordPause(db: HistoryDatabase, now: string) {
  db.transaction(() => {
    db.prepare("INSERT INTO collector_pauses(started) VALUES (?)").run(now);
    db.prepare("UPDATE history_counters SET pause_count=pause_count+1 WHERE id=1").run();
  });
}
function eventRow(db: HistoryDatabase, id: string): EventRow | undefined {
  return db.prepare("SELECT * FROM usage_compact WHERE event_id=?").get(id) as EventRow | undefined;
}
function adjustWorkspace(db: HistoryDatabase, row: EventRow, direction: number) {
  db.prepare(`INSERT INTO workspace_totals VALUES (?,?,?) ON CONFLICT(workspace) DO UPDATE SET
    total_tokens=total_tokens+excluded.total_tokens, events=events+excluded.events`).run(row.workspace, row.total * direction, direction);
  const total = db.prepare("SELECT total_tokens,events FROM workspace_totals WHERE workspace=?").get(row.workspace) as {total_tokens:number; events:number};
  if (![total.total_tokens,total.events].every(n => Number.isSafeInteger(n) && n >= 0)) throw Error("History totals unavailable");
  if (total.events === 0) db.prepare("DELETE FROM workspace_totals WHERE workspace=?").run(row.workspace);
}
function exclude(db: HistoryDatabase, id: string) {
  const row = eventRow(db,id);
  if (!row?.accepted) return;
  adjustWorkspace(db,row,-1);
  db.prepare("UPDATE usage_events SET accepted=0 WHERE event_id=?").run(id);
  db.prepare("UPDATE usage_compact SET accepted=0 WHERE event_id=?").run(id);
}
function quarantine(db: HistoryDatabase, id: string) {
  db.prepare("INSERT OR IGNORE INTO usage_conflicts VALUES (?)").run(id);
  exclude(db,id);
}
// Import omissions can reserve a stable excluded identity without storing any source payload.
export function excludeCompactIdentity(db: HistoryDatabase, eventId: string) { quarantine(db, eventId); }
function conflictOwner(db: HistoryDatabase, binding: Binding, owner: Owner) {
  if (!owner.conflicted) {
    db.prepare("UPDATE usage_entry_owners SET conflicted=1 WHERE session_id=? AND entry_id=?").run(binding.session_id,binding.entry_id);
    db.prepare("UPDATE history_counters SET conflicting_entries=conflicting_entries+1 WHERE id=1").run();
  }
  quarantine(db,owner.event_id);
}
// Claims and optional file-key availability do not establish usage ownership or values.
function invalid(db: HistoryDatabase) { db.prepare("UPDATE history_counters SET invalid_records=invalid_records+1 WHERE id=1").run(); }
function resolveBinding(db: HistoryDatabase, row: EventRow, binding: Binding) {
  if (binding.session_id !== row.session_id) { invalid(db); quarantine(db,row.event_id); return; }
  if (!row.confirmed) {
    db.prepare("UPDATE usage_events SET confirmed=1 WHERE event_id=?").run(row.event_id);
    db.prepare("UPDATE usage_compact SET confirmed=1 WHERE event_id=?").run(row.event_id);
    db.prepare("UPDATE history_counters SET unconfirmed_events=unconfirmed_events-1 WHERE id=1").run();
  }
  const owner = db.prepare("SELECT event_id,evidence,conflicted FROM usage_entry_owners WHERE session_id=? AND entry_id=?").get(binding.session_id,binding.entry_id) as Owner | undefined;
  if (!owner) {
    // The first ingested confirmed capture owns this entry permanently, regardless of UUID order.
    db.prepare("INSERT INTO usage_entry_owners VALUES (?,?,?,?,?)").run(binding.session_id,binding.entry_id,row.event_id,row.evidence,row.accepted ? 0 : 1);
    if (!row.accepted) db.prepare("UPDATE history_counters SET conflicting_entries=conflicting_entries+1 WHERE id=1").run();
    return;
  }
  if (owner.event_id === row.event_id) return;
  exclude(db,row.event_id);
  if (!sameUsageEvidence(owner.evidence,row.evidence)) conflictOwner(db,binding,owner);
}
/** Called only inside the source/progress transaction. No report-time replay decisions. */
export function projectCompactRecord(db: HistoryDatabase, record: CompactRecord) {
  if ("workspace" in record) {
    if (record.provenance === "observed") db.prepare("UPDATE history_writer_observation SET observed=1 WHERE id=1").run();
    const prior = eventRow(db,record.eventId), payload = JSON.stringify(record), retention = retentionState(db);
    if (!prior && (record.occurredAt < retention.compact_cutoff || db.prepare("SELECT event_id FROM usage_expired WHERE event_id=?").get(record.eventId))) return;
    if (prior) {
      if (!sameCompactUsage(prior,payload)) {
        invalid(db); quarantine(db,prior.event_id);
        const binding = db.prepare("SELECT session_id,entry_id FROM usage_confirmations WHERE event_id=?").get(prior.event_id) as Binding | undefined;
        if (binding) {
          const owner = db.prepare("SELECT event_id,evidence,conflicted FROM usage_entry_owners WHERE session_id=? AND entry_id=?").get(binding.session_id,binding.entry_id) as Owner | undefined;
          if (owner) conflictOwner(db,binding,owner);
        }
      }
      return;
    }
    const accepted = db.prepare("SELECT event_id FROM usage_conflicts WHERE event_id=?").get(record.eventId) ? 0 : 1;
    insertCompact(db,payload,accepted,0);
    if (record.occurredAt >= retention.detail_cutoff) db.prepare("INSERT INTO usage_events VALUES (?,?,?,?,?,?,0)").run(record.eventId,record.sessionId,record.workspace,record.totalTokens,payload,accepted);
    else db.prepare("UPDATE usage_compact SET detail_available=0 WHERE event_id=?").run(record.eventId);
    db.prepare("UPDATE history_counters SET observed_events=observed_events+1,unconfirmed_events=unconfirmed_events+1 WHERE id=1").run();
    const row = eventRow(db,record.eventId)!;
    if (accepted) adjustWorkspace(db,row,1);
    const binding = db.prepare("SELECT session_id,entry_id FROM usage_confirmations WHERE event_id=?").get(record.eventId) as Binding | undefined;
    if (binding) resolveBinding(db,row,binding);
  } else {
    const binding: Binding = {session_id:record.sessionId,entry_id:record.entryId};
    const prior = db.prepare("SELECT session_id,entry_id FROM usage_confirmations WHERE event_id=?").get(record.eventId) as Binding | undefined;
    if (prior && (prior.session_id !== binding.session_id || prior.entry_id !== binding.entry_id)) {
      invalid(db); quarantine(db,record.eventId);
      const owner = db.prepare("SELECT event_id,evidence,conflicted FROM usage_entry_owners WHERE session_id=? AND entry_id=?").get(prior.session_id,prior.entry_id) as Owner | undefined;
      if (owner) conflictOwner(db,prior,owner);
      return;
    }
    if (!prior) db.prepare("INSERT INTO usage_confirmations VALUES (?,?,?)").run(record.eventId,record.sessionId,record.entryId);
    const row = eventRow(db,record.eventId);
    if (row && !prior) resolveBinding(db,row,binding);
  }
}
/** Resolve an attempted confirmed event to its immutable first owner, including exclusion state. */
function confirmedUsage(db: HistoryDatabase, eventId: string, record: UsageRecord): ConfirmedUsage | null {
  const row = db.prepare(`SELECT e.*,o.conflicted
    FROM usage_confirmations c JOIN usage_compact attempted ON attempted.event_id=c.event_id AND attempted.session_id=c.session_id
    JOIN usage_entry_owners o ON o.session_id=c.session_id AND o.entry_id=c.entry_id
    JOIN usage_compact e ON e.event_id=o.event_id WHERE c.event_id=?`).get(eventId) as (CompactRow & {conflicted:number}) | undefined;
  if (!row) return null;
  const candidate = {...record,eventId:row.event_id,sessionId:row.session_id};
  if (!sameCompactUsage(row,JSON.stringify(candidate))) return null;
  const original = usageRecordSchema.parse({...candidate,workspace:row.workspace,occurredAt:row.occurred_at,totalTokens:row.total,capturedCost:row.captured_cost,provenance:row.provenance,providerSessionKey:row.provider_key,claimedThreadId:row.claimed_thread});
  return {eventId:row.event_id,record:original,accepted:!!row.accepted && !!row.confirmed && !row.conflicted};
}
/** Caller must first verify the confined parent and shared entry chain. Claims do not prove ancestry. */
export function confirmedReplay(db: HistoryDatabase, eventId: string, record: UsageRecord): ConfirmedUsage | null {
  const owner = confirmedUsage(db,eventId,record);
  return owner?.accepted ? owner : null;
}
type ImportAdmission = {kind:"unresolved-overlap"} | {kind:"usage";owner:ConfirmedUsage|null};
/** Retained unconfirmed captures cannot be matched by scalar equality or file identity. */
export function admitImportedUsage(db:HistoryDatabase,record:UsageRecord,entryId:string):ImportAdmission {
  if(db.prepare("SELECT event_id FROM usage_compact WHERE session_id=? AND confirmed=0 AND provenance='observed' LIMIT 1").get(record.sessionId))return {kind:"unresolved-overlap"};
  projectCompactRecord(db,{...record,provenance:"imported"});
  projectCompactRecord(db,{version:1,eventId:record.eventId,sessionId:record.sessionId,entryId});
  return {kind:"usage",owner:confirmedUsage(db,record.eventId,record)};
}
/** Import may add confirmation evidence, but never replaces immutable first ownership. */
export function projectImportedUsage(db: HistoryDatabase, record: UsageRecord, entryId: string): ConfirmedUsage | null {
  const result=admitImportedUsage(db,record,entryId);return result.kind==="usage" ? result.owner : null;
}
export function historyObserved(db: HistoryDatabase) {
  return (db.prepare("SELECT observed FROM history_writer_observation WHERE id=1").get() as {observed:number}).observed === 1;
}
export function collectionView(db: HistoryDatabase, enabled: boolean, backlog: boolean): NonNullable<HistoryReadiness["collection"]> {
  const meta = db.prepare("SELECT first_observed FROM collector_meta WHERE id=1").get() as {first_observed:string};
  const counts = db.prepare("SELECT * FROM history_counters WHERE id=1").get() as {pause_count:number; unconfirmed_events:number; invalid_records:number; conflicting_entries:number};
  const invalid = (db.prepare("SELECT coalesce(sum(invalid),0) AS n FROM collector_sources").get() as {n:number}).n;
  const rows = db.prepare("SELECT workspace,total_tokens AS totalTokens,events FROM workspace_totals ORDER BY total_tokens DESC,workspace LIMIT 51").all() as {workspace:string; totalTokens:number; events:number}[];
  return { enabled, firstObservedAt:meta.first_observed, pauseCount:counts.pause_count, invalidRecords:invalid+counts.invalid_records,
    unconfirmedEvents:counts.unconfirmed_events, conflictingEntries:counts.conflicting_entries, backlog, workspaces:rows.slice(0,50).map(row=>({...row})),truncated:rows.length>50 };
}
