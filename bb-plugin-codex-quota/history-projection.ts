import type { HistoryDatabase } from "./history-storage.js";
import type { HistoryReadiness } from "./history-contract.js";
import type { parseCompact } from "./usage-record.js";
import { createRetentionSchema, insertCompact, digest, retentionState, type CompactRow } from "./history-retention.js";

type CompactRecord = NonNullable<ReturnType<typeof parseCompact>>;
type EventRow = CompactRow;
type Binding = { session_id: string; entry_id: string };
type Owner = { event_id: string; evidence: string; conflicted: number };

export function initializeHistory(db: HistoryDatabase, firstObservedAt: string) {
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
    db.prepare("INSERT OR IGNORE INTO collector_meta VALUES (1, ?)").run(firstObservedAt);
    db.prepare("INSERT OR IGNORE INTO history_counters VALUES (1,0,0,0,0,0)").run();
    createRetentionSchema(db, false);
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
function conflictOwner(db: HistoryDatabase, binding: Binding, owner: Owner) {
  if (!owner.conflicted) {
    db.prepare("UPDATE usage_entry_owners SET conflicted=1 WHERE session_id=? AND entry_id=?").run(binding.session_id,binding.entry_id);
    db.prepare("UPDATE history_counters SET conflicting_entries=conflicting_entries+1 WHERE id=1").run();
  }
  quarantine(db,owner.event_id);
}
// Claims and optional file-key availability do not establish usage ownership or values.
function ownerEvidence(value: string) { return value.startsWith("{") ? digest(value) : value; }
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
  if (ownerEvidence(owner.evidence) !== row.evidence) conflictOwner(db,binding,owner);
}
/** Called only inside the source/progress transaction. No report-time replay decisions. */
export function projectCompactRecord(db: HistoryDatabase, record: CompactRecord) {
  if ("workspace" in record) {
    const prior = eventRow(db,record.eventId), payload = JSON.stringify(record), retention = retentionState(db);
    if (!prior && (record.occurredAt < retention.compact_cutoff || db.prepare("SELECT event_id FROM usage_expired WHERE event_id=?").get(record.eventId))) return;
    if (prior) {
      if (prior.digest !== digest(payload)) {
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
export function historyObserved(db: HistoryDatabase) {
  return (db.prepare("SELECT observed_events FROM history_counters WHERE id=1").get() as {observed_events:number}).observed_events > 0;
}
export function collectionView(db: HistoryDatabase, enabled: boolean, backlog: boolean): NonNullable<HistoryReadiness["collection"]> {
  const meta = db.prepare("SELECT first_observed FROM collector_meta WHERE id=1").get() as {first_observed:string};
  const counts = db.prepare("SELECT * FROM history_counters WHERE id=1").get() as {pause_count:number; unconfirmed_events:number; invalid_records:number; conflicting_entries:number};
  const invalid = (db.prepare("SELECT coalesce(sum(invalid),0) AS n FROM collector_sources").get() as {n:number}).n;
  const rows = db.prepare("SELECT workspace,total_tokens AS totalTokens,events FROM workspace_totals ORDER BY total_tokens DESC,workspace LIMIT 51").all() as {workspace:string; totalTokens:number; events:number}[];
  return { enabled, firstObservedAt:meta.first_observed, pauseCount:counts.pause_count, invalidRecords:invalid+counts.invalid_records,
    unconfirmedEvents:counts.unconfirmed_events, conflictingEntries:counts.conflicting_entries, backlog, workspaces:rows.slice(0,50).map(row=>({...row})),truncated:rows.length>50 };
}
