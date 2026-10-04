import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, test } from "vitest";
import { openHistoryDatabase, type HistoryDatabase } from "./history-storage.js";
import { createHostHistory } from "./history-host.js";
import { readCalendarTotals } from "./history-retention.js";
import { initializeIdentityStorage } from "./identity-storage.js";
import { initializeImport } from "./import-state.js";
import { initializeWriterObservation } from "./history-projection.js";
import { initializeHistory, projectCompactRecord, projectImportedUsage, confirmedReplay, historyObserved } from "./history-projection.js";
import { maintainHistory } from "./history-retention.js";
import { readCoverage } from "./history-coverage.js";
import { createRetentionSchema, insertCompact, retentionCutoffs } from "./history-retention.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const now = Date.parse("2026-10-01T12:00:00.000Z");
const record = (n = 1, provenance: "observed" | "imported" = "observed") => ({
  version: 1 as const, eventId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, provenance,
  occurredAt: "2026-09-30T00:00:00.000Z", sessionId: "original-session", providerSessionKey: null, claimedThreadId: null,
  workspace: "/original", provider: "openai-codex" as const, model: "gpt-5", inputTokens: 2, outputTokens: 3,
  cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 1, totalTokens: 5, capturedCost: 0.25,
});
function seedCollectorV1(db: HistoryDatabase) {
  db.exec(`CREATE TABLE collector_meta (id INTEGER PRIMARY KEY,first_observed TEXT NOT NULL);
    CREATE TABLE collector_pauses (id INTEGER PRIMARY KEY,started TEXT NOT NULL,ended TEXT);
    CREATE TABLE history_counters (id INTEGER PRIMARY KEY,observed_events INTEGER NOT NULL,unconfirmed_events INTEGER NOT NULL,invalid_records INTEGER NOT NULL,conflicting_entries INTEGER NOT NULL,pause_count INTEGER NOT NULL);
    CREATE TABLE usage_events (event_id TEXT PRIMARY KEY,session_id TEXT NOT NULL,workspace TEXT NOT NULL,total INTEGER NOT NULL,payload TEXT NOT NULL,accepted INTEGER NOT NULL,confirmed INTEGER NOT NULL);
    CREATE TABLE usage_confirmations (event_id TEXT PRIMARY KEY,session_id TEXT NOT NULL,entry_id TEXT NOT NULL);
    CREATE TABLE usage_conflicts (event_id TEXT PRIMARY KEY);
    CREATE TABLE usage_entry_owners (session_id TEXT NOT NULL,entry_id TEXT NOT NULL,event_id TEXT NOT NULL UNIQUE,evidence TEXT NOT NULL,conflicted INTEGER NOT NULL,PRIMARY KEY(session_id,entry_id));
    CREATE TABLE workspace_totals (workspace TEXT PRIMARY KEY,total_tokens INTEGER NOT NULL,events INTEGER NOT NULL);
    CREATE TABLE collector_sources (name TEXT PRIMARY KEY,identity TEXT NOT NULL,size INTEGER NOT NULL,stamp TEXT NOT NULL,offset INTEGER NOT NULL,dropping INTEGER NOT NULL,edge TEXT NOT NULL,invalid INTEGER NOT NULL,stalled INTEGER NOT NULL);
    PRAGMA user_version=1;`);
  db.prepare("INSERT INTO collector_meta VALUES (1,?)").run("2026-09-01T00:00:00.000Z");
  db.prepare("INSERT INTO history_counters VALUES (1,1,0,0,0,0)").run();
  const r = record();
  db.prepare("INSERT INTO usage_events VALUES (?,?,?,?,?,1,1)").run(r.eventId,r.sessionId,r.workspace,r.totalTokens,JSON.stringify(r));
  db.prepare("INSERT INTO usage_confirmations VALUES (?,?,?)").run(r.eventId,r.sessionId,"entry-one");
  const { eventId: _id, claimedThreadId: _claim, providerSessionKey: _key, provenance: _provenance, ...evidence } = r;
  db.prepare("INSERT INTO usage_entry_owners VALUES (?,?,?,?,0)").run(r.sessionId,"entry-one",r.eventId,JSON.stringify(evidence));
  db.prepare("INSERT INTO workspace_totals VALUES (?,5,1)").run(r.workspace);
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bbp16-storage-")); roots.push(root);
  const directory = join(root,"history"), path = join(directory,"usage-v1.sqlite"); await mkdir(directory);
  const db = (await openHistoryDatabase(path))!;
  await writeFile(join(directory,"collector-control-v1.json"),JSON.stringify({protocol:2,enabled:false,revision:"00000000-0000-4000-8000-000000000099"}));
  const context = { dataDir: root, signal: new AbortController().signal };
  let reads = 0;
  const make = () => createHostHistory({ now:()=>now, agentDir:()=>join(root,"agent"), collector:async()=>"compatible-v1", maintenanceRows:1, bodyRead:()=>{reads++;} });
  return { root,directory,path,db,context,make,reads:()=>reads };
}
it("upgrades collector-only version 1 to schema 4 and resumes bounded ownership backfill before collector replay", async () => {
  const f = await fixture(); seedCollectorV1(f.db); f.db.close();
  await writeFile(join(f.directory,"events-v1.jsonl"),JSON.stringify(record(2))+"\n");
  await writeFile(join(f.directory,"confirmations-v1.jsonl"),JSON.stringify({version:1,eventId:record(2).eventId,sessionId:record().sessionId,entryId:"entry-one"})+"\n");
  const first = await f.make().read(f.context);
  expect(first.storage).toBe("compatible"); expect(first.collection?.backlog).toBe(true); expect(f.reads()).toBe(0);
  const db = (await openHistoryDatabase(f.path))!;
  try { expect(db.prepare("PRAGMA user_version").get()).toEqual({user_version:4}); } finally { db.close(); }
  const reopened = f.make(); await reopened.read(f.context); await reopened.read(f.context);
  const stored = (await openHistoryDatabase(f.path))!;
  try {
    expect(readCalendarTotals(stored,{start:"2026-09-30T00:00:00Z",end:"2026-10-01T00:00:00Z",workspace:"/original",timezone:"UTC"}).days).toEqual([{date:"2026-09-30",totalTokens:5,capturedCost:0.25,pricedEvents:1,events:1}]);
    expect(stored.prepare("SELECT event_id FROM usage_entry_owners WHERE session_id=? AND entry_id=?").get(record().sessionId,"entry-one")).toEqual({event_id:record().eventId});
  } finally { stored.close(); }
});

test.each([1,2,3])("preserves imported ownership, partial identity delivery and frozen unfinished import across version %s migration and reopen", async version => {
  const f = await fixture(); seedCollectorV1(f.db); initializeWriterObservation(f.db); initializeIdentityStorage(f.db); initializeImport(f.db);
  const imported = record(1,"imported");
  f.db.prepare("UPDATE usage_events SET payload=?").run(JSON.stringify(imported));
  f.db.prepare("UPDATE history_writer_observation SET observed=0 WHERE id=1").run();
  f.db.prepare("UPDATE identity_receipt SET host_id='host-one',generation=7,received=1,complete=0,revision=4,expected_total=2 WHERE id=1").run();
  f.db.prepare("INSERT INTO identity_generations VALUES (7,0)").run();
  f.db.prepare("INSERT INTO identity_batches VALUES (7,0,'original-delivery-digest')").run();
  f.db.prepare("INSERT INTO identity_edges VALUES (7,'original-provider','thr_owned')").run();
  f.db.prepare("INSERT INTO identity_aliases VALUES ('/original','/verified')").run();
  const configuration = {bbRoot:join(f.root,"sources"),ordinaryRoots:[],workspaces:["/original"]};
  const frozen = JSON.stringify({roots:[],workspaces:[{recorded:"/original",resolved:"/original",identity:"original-proof"}],catalog:7});
  const id = "00000000-0000-4000-8000-000000000077";
  f.db.prepare("INSERT INTO import_host VALUES (1,'host-one')").run();
  f.db.prepare("INSERT INTO import_config VALUES (?,?)").run("host-one",JSON.stringify(configuration));
  f.db.prepare("INSERT INTO import_generations VALUES (?,?,'stopped',?,?,?,'read','original-cursor',0,128,1,0,1,?)").run(id,"host-one","2026-09-01T00:00:00.000Z","2026-10-01T00:00:00.000Z",frozen,JSON.stringify(["unresolved-overlap"]));
  if (version !== 1) {
    createRetentionSchema(f.db,false); insertCompact(f.db,JSON.stringify(imported),1,1);
    f.db.prepare("UPDATE usage_compact SET detail_available=0").run(); f.db.prepare("DELETE FROM usage_events").run();
    const cutoffs = retentionCutoffs(now);
    f.db.prepare("UPDATE history_retention SET detail_cutoff=?,compact_cutoff=?,backfill_cursor='completed-before-upgrade',backfill_done=1").run(cutoffs.detail,cutoffs.compact);
    if (version === 2) f.db.exec("DROP TABLE history_legacy_pending");
  }
  f.db.exec(`PRAGMA user_version=${version}`); f.db.close();
  const context = {...f.context,hostId:"host-one",knownWorkspaces:["/original"]};
  const status = await f.make().controlImport!({action:"status"},context);
  expect(status.reason).toBe("ok"); expect(status.configuration).toEqual(configuration);
  expect(status.generation).toMatchObject({id,state:"stopped",bytes:128,records:1,omissions:1,diagnostics:["unresolved-overlap"]});
  const reopened = f.make(); await reopened.read(f.context); const view = await reopened.read(f.context);
  expect(view.writer).toBe("unconfirmed"); expect(f.reads()).toBe(0);
  const db = (await openHistoryDatabase(f.path))!;
  try {
    expect(db.prepare("PRAGMA user_version").get()).toEqual({user_version:4});
    expect(db.prepare("SELECT frozen,provider_cursor,state FROM import_generations WHERE id=?").get(id)).toEqual({frozen,provider_cursor:"original-cursor",state:"stopped"});
    expect(db.prepare("SELECT generation,received,complete,revision FROM identity_receipt WHERE id=1").get()).toEqual({generation:7,received:1,complete:0,revision:4});
    expect(db.prepare("SELECT digest FROM identity_batches WHERE generation=7 AND offset=0").get()).toEqual({digest:"original-delivery-digest"});
    expect(db.prepare("SELECT verified FROM identity_aliases WHERE recorded='/original'").get()).toEqual({verified:"/verified"});
    expect(db.prepare("SELECT provenance FROM usage_compact WHERE event_id=?").get(imported.eventId)).toEqual({provenance:"imported"});
    if (version !== 1) {
      expect(db.prepare("SELECT backfill_cursor,backfill_done FROM history_retention WHERE id=1").get()).toEqual({backfill_cursor:"completed-before-upgrade",backfill_done:1});
      expect(db.prepare("SELECT count(*) AS n FROM usage_events").get()).toEqual({n:0});
    }
  } finally { db.close(); }
});

test.each(["newer", "wal"] as const)("rejects %s storage for readiness and import before any database open, without changing owned files", async kind => {
  const f = await fixture(); seedCollectorV1(f.db); f.db.exec(`PRAGMA user_version=${kind === "newer" ? 5 : 4}`); f.db.close();
  if (kind === "wal") await writeFile(f.path+"-wal","owned-unsettled-wal");
  const { readFile, readdir } = await import("node:fs/promises");
  const before = await readFile(f.path), control = await readFile(join(f.directory,"collector-control-v1.json"));
  const factory = (await import("./history-storage.js")).loadHistoryStorage;
  let opens = 0;
  const real = (await factory())!;
  const host = createHostHistory({ storage:async()=> (path,readonly)=> {opens++;return real(path,readonly);},now:()=>now,agentDir:()=>join(f.root,"agent") });
  const ready = await host.read(f.context);
  expect(ready.storage).toBe(kind === "newer" ? "incompatible" : "unavailable");
  const status = await host.controlImport!({action:"status"},{...f.context,hostId:"host-one",knownWorkspaces:["/original"]});
  expect(status.reason).toBe(kind === "newer" ? "storage-incompatible" : "storage-unavailable");
  expect(opens).toBe(0); expect(await readFile(f.path)).toEqual(before);
  expect(await readFile(join(f.directory,"collector-control-v1.json"))).toEqual(control);
  if (kind === "wal") expect(await readFile(f.path+"-wal","utf8")).toBe("owned-unsettled-wal");
  expect((await readdir(f.directory)).some(name=>name.includes("quarantine"))).toBe(false);
});

it("keeps first imported ownership through observed overlap and detailed expiry, then verifies fork replay from compact evidence", async () => {
  const f = await fixture(); initializeHistory(f.db,"2026-08-01T00:00:00.000Z",false);
  const imported = {...record(1,"imported"),occurredAt:"2026-08-01T00:00:00.000Z"};
  expect(projectImportedUsage(f.db,imported,"entry-one")?.accepted).toBe(true);
  expect(historyObserved(f.db)).toBe(false);
  projectCompactRecord(f.db,{...imported,provenance:"observed",providerSessionKey:"later-key.jsonl",claimedThreadId:"thr_claim"});
  expect(historyObserved(f.db)).toBe(true);
  maintainHistory(f.db,now);
  const fork = {...imported,eventId:record(2).eventId,sessionId:"verified-fork-session",provenance:"imported" as const};
  expect(confirmedReplay(f.db,imported.eventId,fork)).toMatchObject({eventId:imported.eventId,accepted:true,record:{sessionId:imported.sessionId,workspace:"/original",provenance:"imported"}});
  expect(projectImportedUsage(f.db,imported,"entry-one")).toMatchObject({eventId:imported.eventId,accepted:true});
  const calendar = readCalendarTotals(f.db,{start:"2026-08-01T00:00:00Z",end:"2026-08-02T00:00:00Z",workspace:"/original",timezone:"UTC"});
  expect(calendar.days).toEqual([{date:"2026-08-01",totalTokens:5,capturedCost:0.25,pricedEvents:1,events:1}]); expect(calendar.detail).toBe("unavailable");
  expect(f.db.prepare("SELECT count(*) AS n FROM usage_events").get()).toEqual({n:0});
  expect(f.db.prepare("SELECT session_id,workspace,total,provenance,provider_key,claimed_thread FROM usage_compact").get()).toEqual({session_id:imported.sessionId,workspace:"/original",total:5,provenance:"imported",provider_key:null,claimed_thread:null});
  f.db.close();
});

it("resolves late verified attribution for compact-only rows and removes numeric thread totals when compact history expires", async () => {
  const f = await fixture(); initializeHistory(f.db,"2026-08-01T00:00:00.000Z");
  const captured = {...record(),occurredAt:"2026-08-01T00:00:00.000Z",providerSessionKey:"provider-owned.jsonl"};
  projectCompactRecord(f.db,captured); projectCompactRecord(f.db,{version:1,eventId:captured.eventId,sessionId:captured.sessionId,entryId:"entry-one"});
  maintainHistory(f.db,now); f.db.close();
  const identities = {hostId:"host-one",generation:1,offset:0,total:1,rows:[{threadId:"thr_owned",providerIdentity:"provider-owned",title:"Owned",state:"available" as const}]};
  const view = await f.make().read({...f.context,identities});
  expect(view.collection?.attribution?.threads).toMatchObject([{threadId:"thr_owned",totalTokens:5,events:1}]);
  const db = (await openHistoryDatabase(f.path))!;
  try {
    const report = readCalendarTotals(db,{start:"2026-08-01T00:00:00Z",end:"2026-08-02T00:00:00Z",verifiedThread:"thr_owned",timezone:"UTC"});
    expect(report.days).toMatchObject([{totalTokens:5,capturedCost:0.25,events:1}]); expect(report.detail).toBe("unavailable");
    expect(db.prepare("SELECT workspace,verified_thread,detail_available FROM usage_compact").get()).toEqual({workspace:"/original",verified_thread:"thr_owned",detail_available:0});
    maintainHistory(db,Date.parse("2027-01-01T00:00:00Z"));
  } finally {db.close();}
  const expired = await f.make().read({...f.context,identities});
  expect(expired.collection?.attribution?.threads).toEqual([]); expect(expired.writer).toBe("observed");
  const stored = (await openHistoryDatabase(f.path))!;
  try {expect(stored.prepare("SELECT count(*) AS n FROM identity_usage").get()).toEqual({n:0});expect(stored.prepare("SELECT count(*) AS n FROM usage_expired").get()).toEqual({n:1});}finally{stored.close();}
});

test.each([2,3])("matches original version-%s opaque entry and UUID proofs after detail expiry without changing the first owner", async version => {
  const f = await fixture(); seedCollectorV1(f.db); initializeHistory(f.db,"2026-08-01T00:00:00.000Z",false);
  const original = {...record(),occurredAt:"2026-08-01T00:00:00.000Z",providerSessionKey:"original-provider.jsonl"};
  insertCompact(f.db,JSON.stringify(original),1,1);
  const {createHash} = await import("node:crypto");
  const hash = (s:string)=>createHash("sha256").update(s).digest("hex");
  const normalized=(await import("./usage-record.js")).usageRecordSchema.parse(original);
  const {eventId:_id,providerSessionKey:_key,claimedThreadId:_claim,...values}=normalized;
  const evidence=hash(JSON.stringify(values)), uuidProof=hash(JSON.stringify(normalized));
  f.db.prepare("UPDATE usage_compact SET digest=?,evidence=?,detail_available=0").run(uuidProof,evidence);
  f.db.prepare("UPDATE usage_entry_owners SET evidence=?").run(evidence); f.db.prepare("DELETE FROM usage_events").run();
  f.db.prepare("UPDATE history_retention SET backfill_done=1").run(); f.db.exec(`PRAGMA user_version=${version}`); f.db.close();
  await f.make().read(f.context);
  const db=(await openHistoryDatabase(f.path))!;
  try {
    const imported={...original,provenance:"imported" as const,providerSessionKey:"another-provider.jsonl",claimedThreadId:"thr_claim"};
    expect(projectImportedUsage(db,imported,"entry-one")?.accepted).toBe(true);
    const alias={...imported,eventId:record(2).eventId}; projectImportedUsage(db,alias,"entry-one");
    expect(db.prepare("SELECT event_id,evidence,conflicted FROM usage_entry_owners").get()).toEqual({event_id:original.eventId,evidence,conflicted:0});
    expect(db.prepare("SELECT digest,provenance,provider_key,detail_available FROM usage_compact WHERE event_id=?").get(original.eventId)).toEqual({digest:uuidProof,provenance:"observed",provider_key:"original-provider.jsonl",detail_available:0});
    expect(confirmedReplay(db,original.eventId,{...imported,sessionId:"verified-fork"})?.accepted).toBe(true);
    expect(readCalendarTotals(db,{start:"2026-08-01T00:00:00Z",end:"2026-08-02T00:00:00Z",workspace:"/original",timezone:"UTC"}).days).toMatchObject([{totalTokens:5,events:1}]);
    expect(db.prepare("SELECT count(*) AS n FROM usage_events").get()).toEqual({n:0});
  }finally{db.close();}
});

it("does not start transcript work while a version-1 ownership backfill is incomplete", async () => {
  const f=await fixture(); seedCollectorV1(f.db);
  for(let n=2;n<=502;n++) {const r=record(n);f.db.prepare("INSERT INTO usage_events VALUES (?,?,?,?,?,1,0)").run(r.eventId,r.sessionId,r.workspace,r.totalTokens,JSON.stringify(r));}
  f.db.prepare("UPDATE history_counters SET observed_events=502,unconfirmed_events=501").run(); f.db.prepare("UPDATE workspace_totals SET total_tokens=2510,events=502").run(); f.db.close();
  const source=join(f.root,"source"),workspace=join(f.root,"workspace");await mkdir(source);await mkdir(workspace);
  await writeFile(join(source,"provider-one.jsonl"),JSON.stringify({type:"session",version:3,id:"import-session",cwd:workspace})+"\n");
  const host=f.make(),context={...f.context,hostId:"host-one",knownWorkspaces:[workspace]};
  await host.read({...f.context,identities:{hostId:"host-one",generation:1,offset:0,total:1,rows:[{threadId:"thr_owned",providerIdentity:"provider-one",title:null,state:"available"}]}});
  expect((await host.controlImport!({action:"configure",configuration:{bbRoot:source,ordinaryRoots:[],workspaces:[workspace]}},context)).reason).toBe("ok");
  const start=await host.controlImport!({action:"start"},context);
  expect(start.reason).toBe("metadata-incomplete");expect(f.reads()).toBe(0);
  const db=(await openHistoryDatabase(f.path))!;
  try {expect(db.prepare("SELECT backfill_done FROM history_retention WHERE id=1").get()).toEqual({backfill_done:0});}finally{db.close();}
});

test.each(["foreign-table", "partial-history"] as const)("protects unknown version-1 table layout %s without writable access or mutation", async variant => {
  const f=await fixture();
  f.db.exec(variant === "foreign-table" ? "CREATE TABLE foreign_records(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO foreign_records VALUES (1,'owned-sentinel')" : "CREATE TABLE collector_meta(id INTEGER PRIMARY KEY,first_observed TEXT); INSERT INTO collector_meta VALUES (1,'2026-09-01T00:00:00.000Z')");
  f.db.exec("PRAGMA user_version=1");f.db.close();
  const {readFile}=await import("node:fs/promises"),before=await readFile(f.path);
  const real=(await (await import("./history-storage.js")).loadHistoryStorage())!; const opens:boolean[]=[];
  const host=createHostHistory({storage:async()=> (path,readonly)=>{opens.push(!!readonly);return real(path,readonly);},now:()=>now,agentDir:()=>join(f.root,"agent")});
  expect(await host.read(f.context)).toMatchObject({storage:"incompatible",reason:"storage-incompatible"});
  expect(await host.controlImport!({action:"status"},{...f.context,hostId:"host-one",knownWorkspaces:[]})).toMatchObject({reason:"storage-incompatible"});
  expect(opens.every(readonly=>readonly)).toBe(true);expect(await readFile(f.path)).toEqual(before);
});

it("treats import admission as imported evidence, even when a source claims observed provenance", async () => {
  const f=await fixture();initializeHistory(f.db,"2026-09-01T00:00:00.000Z",false);
  expect(projectImportedUsage(f.db,record(),"entry-one")?.accepted).toBe(true);
  expect(historyObserved(f.db)).toBe(false);
  expect(readCoverage(f.db,{start:"2026-09-30T00:00:00Z",end:"2026-10-01T00:00:00Z",workspace:"/original"})).toMatchObject({state:"imported",writerActive:false,zero:false});
  expect(f.db.prepare("SELECT provenance FROM usage_compact").get()).toEqual({provenance:"imported"});f.db.close();
});

it("rebuilds only retained observed collector records, not imported records or unfinished transcript work", async () => {
  const f=await fixture();initializeHistory(f.db,"2026-09-01T00:00:00.000Z");projectImportedUsage(f.db,record(1,"imported"),"import-entry");f.db.close();
  const observed=record(2),imported=record(3,"imported");
  await writeFile(join(f.directory,"events-v1-2026-09-30.jsonl"),JSON.stringify(observed)+"\n"+JSON.stringify(imported)+"\n");
  await f.make().read(f.context);await writeFile(f.path,"owned-confirmed-corruption");
  const recovered=await f.make().read(f.context);
  expect(recovered.health?.state).toBe("recovered");expect(recovered.collection?.enabled).toBe(false);
  expect(recovered.collection?.workspaces).toEqual([{workspace:"/original",totalTokens:5,events:1}]);
  const status=await f.make().controlImport!({action:"status"},{...f.context,hostId:"host-one",knownWorkspaces:["/original"]});expect(status.reason).toBe("not-configured");
  const db=(await openHistoryDatabase(f.path))!;
  try {expect(db.prepare("SELECT event_id,provenance FROM usage_compact").all()).toEqual([{event_id:observed.eventId,provenance:"observed"}]);expect(readCoverage(db,{start:"2026-09-30T00:00:00Z",end:"2026-10-01T00:00:00Z",workspace:"/original"})).toMatchObject({zero:false,recoveryGap:true});}finally{db.close();}
});

it("expires import-only storage on status and readiness checks without capture control or transcript reads",async()=>{
  const f=await fixture();initializeHistory(f.db,"2026-09-01T00:00:00.000Z",false);
  projectImportedUsage(f.db,{...record(1,"imported"),occurredAt:"2026-08-01T00:00:00.000Z"},"entry-one");f.db.close();
  const {unlink}=await import("node:fs/promises");await unlink(join(f.directory,"collector-control-v1.json"));
  let reads=0;const history=createHostHistory({now:()=>Date.parse("2027-01-01T00:00:00Z"),agentDir:()=>join(f.root,"agent"),bodyRead:()=>reads++});
  const view=await history.read(f.context);expect(view.writer).toBe("unconfirmed");expect(view.health?.compactFrom).toBe("2026-09-22T00:00:00.000Z");
  expect((await history.controlImport!({action:"status"},{...f.context,hostId:"host-one",knownWorkspaces:[]})).reason).toBe("not-configured");expect(reads).toBe(0);
  const db=(await openHistoryDatabase(f.path))!;
  try {expect(db.prepare("SELECT count(*) AS n FROM usage_compact").get()).toEqual({n:0});expect(db.prepare("SELECT count(*) AS n FROM identity_usage").get()).toEqual({n:0});expect(db.prepare("SELECT count(*) AS n FROM collector_meta").get()).toEqual({n:0});}finally{db.close();}
});


test.each([2,3,4])("protects required compact tables and singleton state for version %s",async version=>{
  for(const damage of ["compact","owner-table","owner-row","retention-row","counter-row","identity-table","import-table"]){
    if(version<4 && ["identity-table","import-table"].includes(damage))continue;
    const f=await fixture();initializeHistory(f.db,"2026-09-01T00:00:00.000Z");projectImportedUsage(f.db,record(1,"imported"),"entry-one");
    if(damage==="compact")f.db.exec("DROP TABLE usage_compact");
    if(damage==="owner-table")f.db.exec("DROP TABLE history_owner");
    if(damage==="owner-row")f.db.exec("DELETE FROM history_owner");
    if(damage==="retention-row")f.db.exec("DELETE FROM history_retention");
    if(damage==="counter-row")f.db.exec("DELETE FROM history_counters");
    if(damage==="identity-table")f.db.exec("DROP TABLE identity_edges");
    if(damage==="import-table")f.db.exec("DROP TABLE import_generations");
    f.db.exec(`PRAGMA user_version=${version}`);f.db.close();
    const {readFile,readdir}=await import("node:fs/promises"),before=await readFile(f.path),files=await readdir(f.directory),control=await readFile(join(f.directory,"collector-control-v1.json"));
    expect((await f.make().read(f.context)).storage,damage).toBe("incompatible");
    expect((await f.make().controlImport!({action:"status"},{...f.context,hostId:"host-one",knownWorkspaces:["/original"]})).reason,damage).toBe("storage-incompatible");
    expect(await readFile(f.path),damage).toEqual(before);expect(await readdir(f.directory),damage).toEqual(files);expect(await readFile(join(f.directory,"collector-control-v1.json")),damage).toEqual(control);
  }
});

test.each(["absent","empty"])("does not open or create sidecars for WAL-mode storage with %s WAL",async wal=>{
  for(const layout of ["foreign","valid","partial"]){
    const f=await fixture();if(layout==="foreign")f.db.exec("CREATE TABLE foreign_records(value TEXT); PRAGMA user_version=1");else seedCollectorV1(f.db);
    if(layout==="partial")f.db.exec("DROP TABLE usage_confirmations");f.db.exec("PRAGMA journal_mode=WAL");f.db.close();
    if(wal==="empty")await writeFile(f.path+"-wal","");
    const {readFile,readdir}=await import("node:fs/promises"),before=await readFile(f.path),files=await readdir(f.directory);
    const real=(await (await import("./history-storage.js")).loadHistoryStorage())!;let opens=0;
    const history=createHostHistory({storage:async()=> (path,readonly)=>{opens++;return real(path,readonly);},agentDir:()=>join(f.root,"agent")});
    expect((await history.read(f.context)).storage,layout).toBe("unavailable");expect((await history.controlImport!({action:"status"},{...f.context,hostId:"host-one",knownWorkspaces:[]})).reason,layout).toBe("storage-unavailable");
    expect(opens,layout).toBe(0);expect(await readFile(f.path),layout).toEqual(before);expect(await readdir(f.directory),layout).toEqual(files);
  }
});
