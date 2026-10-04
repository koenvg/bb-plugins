import type { HistoryDatabase } from "./history-storage.js";
import type { HistoryReadiness } from "./history-contract.js";
import type { parseCompact } from "./usage-record.js";

type CompactRecord = NonNullable<ReturnType<typeof parseCompact>>;
type UsageRecord = Extract<CompactRecord, {workspace: string}>;
type ConfirmedUsage = {eventId: string; record: UsageRecord; accepted: boolean};
type EventRow = { event_id: string; session_id: string; workspace: string; total: number; payload: string; accepted: number; confirmed: number };
export function initializeWriterObservation(db: HistoryDatabase) {
  db.exec(`CREATE TABLE IF NOT EXISTS history_writer_observation (id INTEGER PRIMARY KEY CHECK(id=1), observed INTEGER NOT NULL);
    CREATE TRIGGER IF NOT EXISTS history_live_writer AFTER INSERT ON usage_events WHEN json_extract(new.payload,'$.provenance')='observed' BEGIN UPDATE history_writer_observation SET observed=1 WHERE id=1; END;`);
  // Before this additive schema, every stored event was observed. Seed once, then imports cannot change the flag.
  db.prepare("INSERT OR IGNORE INTO history_writer_observation SELECT 1,CASE WHEN observed_events>0 THEN 1 ELSE 0 END FROM history_counters WHERE id=1").run();
}
type Binding = { session_id: string; entry_id: string };
type Owner = { event_id: string; evidence: string; conflicted: number };

export function initializeHistory(db: HistoryDatabase, firstObservedAt: string, collector = true) {
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
      CREATE TABLE IF NOT EXISTS collector_sources (name TEXT PRIMARY KEY, identity TEXT NOT NULL, size INTEGER NOT NULL, stamp TEXT NOT NULL, offset INTEGER NOT NULL, dropping INTEGER NOT NULL, edge TEXT NOT NULL, invalid INTEGER NOT NULL, stalled INTEGER NOT NULL);
      PRAGMA user_version = 1;`);
    if (collector) db.prepare("INSERT OR IGNORE INTO collector_meta VALUES (1, ?)").run(firstObservedAt);
    db.prepare("INSERT OR IGNORE INTO history_counters VALUES (1,0,0,0,0,0)").run();
    initializeWriterObservation(db);
  });
}
export function recordPause(db: HistoryDatabase, now: string) {
  db.transaction(() => {
    db.prepare("INSERT INTO collector_pauses(started) VALUES (?)").run(now);
    db.prepare("UPDATE history_counters SET pause_count=pause_count+1 WHERE id=1").run();
  });
}
function eventRow(db: HistoryDatabase, id: string): EventRow | undefined {
  return db.prepare("SELECT * FROM usage_events WHERE event_id=?").get(id) as EventRow | undefined;
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
function evidence(payload: string) {
  const { eventId: _id, claimedThreadId: _claim, providerSessionKey: _file, provenance: _provenance, ...values } = JSON.parse(payload);
  return JSON.stringify(values);
}
function invalid(db: HistoryDatabase) { db.prepare("UPDATE history_counters SET invalid_records=invalid_records+1 WHERE id=1").run(); }
function resolveBinding(db: HistoryDatabase, row: EventRow, binding: Binding) {
  if (binding.session_id !== row.session_id) { invalid(db); quarantine(db,row.event_id); return; }
  if (!row.confirmed) {
    db.prepare("UPDATE usage_events SET confirmed=1 WHERE event_id=?").run(row.event_id);
    db.prepare("UPDATE history_counters SET unconfirmed_events=unconfirmed_events-1 WHERE id=1").run();
  }
  const owner = db.prepare("SELECT event_id,evidence,conflicted FROM usage_entry_owners WHERE session_id=? AND entry_id=?").get(binding.session_id,binding.entry_id) as Owner | undefined;
  if (!owner) {
    // The first ingested confirmed capture owns this entry permanently, regardless of UUID order.
    db.prepare("INSERT INTO usage_entry_owners VALUES (?,?,?,?,?)").run(binding.session_id,binding.entry_id,row.event_id,evidence(row.payload),row.accepted ? 0 : 1);
    if (!row.accepted) db.prepare("UPDATE history_counters SET conflicting_entries=conflicting_entries+1 WHERE id=1").run();
    return;
  }
  if (owner.event_id === row.event_id) return;
  exclude(db,row.event_id);
  if (evidence(owner.evidence) !== evidence(row.payload)) conflictOwner(db,binding,owner);
}
/** Called only inside the source/progress transaction. No report-time replay decisions. */
export function projectCompactRecord(db: HistoryDatabase, record: CompactRecord) {
  if ("workspace" in record) {
    const prior = eventRow(db,record.eventId), payload = JSON.stringify(record);
    if (prior) {
      if (prior.payload !== payload) {
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
    db.prepare("INSERT INTO usage_events VALUES (?,?,?,?,?,?,0)").run(record.eventId,record.sessionId,record.workspace,record.totalTokens,payload,accepted);
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
function confirmedUsage(db: HistoryDatabase, eventId: string): ConfirmedUsage | null {
  const row = db.prepare(`SELECT e.event_id,e.payload,e.accepted,e.confirmed,o.conflicted
    FROM usage_confirmations c JOIN usage_events attempted ON attempted.event_id=c.event_id AND attempted.session_id=c.session_id
    JOIN usage_entry_owners o ON o.session_id=c.session_id AND o.entry_id=c.entry_id
    JOIN usage_events e ON e.event_id=o.event_id WHERE c.event_id=?`).get(eventId) as
    {event_id: string; payload: string; accepted: number; confirmed: number; conflicted: number} | undefined;
  return row ? {eventId:row.event_id,record:JSON.parse(row.payload) as UsageRecord,accepted:!!row.accepted && !!row.confirmed && !row.conflicted} : null;
}
/** Caller must first verify the confined parent and shared entry chain. Claims do not prove ancestry. */
export function confirmedReplay(db: HistoryDatabase, eventId: string, record: UsageRecord): ConfirmedUsage | null {
  const owner = confirmedUsage(db,eventId);
  const values = (r: UsageRecord) => {
    const {eventId:_, sessionId:__, providerSessionKey:___, claimedThreadId:____, provenance:_____, ...scalars}=r;
    return JSON.stringify(scalars);
  };
  return owner?.accepted && values(owner.record) === values(record) ? owner : null;
}
/** Import may add confirmation evidence, but never replaces an equal first payload from another source path. */
export function projectImportedUsage(db: HistoryDatabase, record: UsageRecord, entryId: string): ConfirmedUsage | null {
  const prior = eventRow(db,record.eventId);
  const stored = prior && evidence(prior.payload) === evidence(JSON.stringify(record)) ? JSON.parse(prior.payload) as UsageRecord : record;
  projectCompactRecord(db,stored);
  projectCompactRecord(db,{version:1,eventId:record.eventId,sessionId:record.sessionId,entryId});
  return confirmedUsage(db,record.eventId);
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
