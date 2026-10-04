import type {HistoryDatabase} from "./history-storage.js";

type Layout = Record<string,readonly string[]>;
const base:Layout={
  collector_meta:["id","first_observed"],collector_pauses:["id","started","ended"],
  history_counters:["id","observed_events","unconfirmed_events","invalid_records","conflicting_entries","pause_count"],
  usage_events:["event_id","session_id","workspace","total","payload","accepted","confirmed"],usage_confirmations:["event_id","session_id","entry_id"],usage_conflicts:["event_id"],
  usage_entry_owners:["session_id","entry_id","event_id","evidence","conflicted"],workspace_totals:["workspace","total_tokens","events"],
  collector_sources:["name","identity","size","stamp","offset","dropping","edge","invalid","stalled"],
};
const retention:Layout={
  usage_compact:["event_id","session_id","workspace","total","accepted","confirmed","occurred_at","captured_cost","digest","evidence","provider_key","claimed_thread","verified_thread","recorded_host","provenance","detail_available"],
  history_retention:["id","detail_cutoff","compact_cutoff","backfill_cursor","backfill_done"],history_owner:["id","host_key"],
  collector_log_retention:["id","date"],usage_expired:["event_id"],history_coverage:["id","workspace","thread_id","started","ended","kind"],history_recovery:["id","started","ended"],history_reconciliation:["id","started","ended","pending"],
};
const legacy:Layout={history_legacy_pending:["id","pending"]};
const writer:Layout={history_writer_observation:["id","observed"]};
const identity:Layout={
  identity_receipt:["id","host_id","generation","received","complete","revision","backfill","backfilled","expected_total","evidence_changed"],
  identity_generations:["generation","complete"],identity_batches:["generation","offset","digest"],identity_edges:["generation","provider_identity","thread_id"],identity_metadata:["generation","thread_id","title","state"],identity_imports:["session_id","provider_identity","workspace"],identity_aliases:["recorded","verified"],
  identity_usage:["event_id","session_id","workspace","provider_key","claim","occurred_at","total","accepted","grade","thread_id","revision","projected"],identity_grade_totals:["grade","total_tokens","events"],identity_totals:["grade","thread_id","total_tokens","events"],
};
const imports:Layout={
  import_config:["host","configuration"],import_host:["id","host"],import_generations:["id","host","state","start_at","end_at","frozen","phase","provider_cursor","root_cursor","bytes","records","replayed","omissions","diagnostics"],import_candidates:["generation","path","root","name","provider","state","offset","dropping","stamp","session","workspace","parent"],import_entries:["generation","path","entry","parent_entry","event_id"],
};
function matches(db:HistoryDatabase,layout:Layout){
  return Object.entries(layout).every(([table,columns])=>{
    const actual=db.prepare(`PRAGMA table_info(${table})`).all() as {name:string}[];
    return actual.length===columns.length && columns.every(column=>actual.some(row=>row.name===column));
  });
}
function present(db:HistoryDatabase,layout:Layout){return Object.keys(layout).some(table=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));}
function singleton(db:HistoryDatabase,table:string){return !!db.prepare(`SELECT id FROM ${table} WHERE id=1`).get() && !db.prepare(`SELECT id FROM ${table} WHERE id<>1 LIMIT 1`).get();}
/** Complete version-specific ownership layouts. Optional additive groups must be complete too. */
export function supportedHistoryLayout(db:HistoryDatabase,version:number){
  if(!matches(db,base)||!singleton(db,"history_counters"))return false;
  if(version===1 && present(db,retention))return false;
  if(version>=2){
    if(!matches(db,retention)||!singleton(db,"history_retention")||!singleton(db,"history_owner"))return false;
    const state=db.prepare("SELECT backfill_done,detail_cutoff,compact_cutoff,backfill_cursor FROM history_retention WHERE id=1").get() as Record<string,unknown>;
    const owner=db.prepare("SELECT host_key FROM history_owner WHERE id=1").get() as {host_key:unknown};
    if(![0,1].includes(state.backfill_done as number)||![state.detail_cutoff,state.compact_cutoff,state.backfill_cursor].every(value=>typeof value==="string")||typeof owner.host_key!=="string"||!owner.host_key.length)return false;
  }
  if((version>=3 || present(db,legacy)) && !matches(db,legacy))return false;
  for(const group of [writer,identity,imports])if((version>=4 || present(db,group))&&!matches(db,group))return false;
  if((version>=4||present(db,writer))&&!singleton(db,"history_writer_observation"))return false;
  if((version>=4||present(db,identity))&&!singleton(db,"identity_receipt"))return false;
  return true;
}
