import { mkdtemp, mkdir, rm, readFile, writeFile, symlink, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import { createQuotaHostEntry } from "./host.js";
import { createHostHistory } from "./history-host.js";
import { openHistoryDatabase } from "./history-storage.js";
import { initializeHistory, projectCompactRecord } from "./history-projection.js";
import { maintainHistory } from "./history-retention.js";
import { usageRecordSchema } from "./usage-record.js";
import { recordCoverage } from "./history-coverage.js";
import { acceptIdentityBatch, reconcileIdentity } from "./identity-storage.js";

const roots: string[] = [];
const now = Date.parse("2026-10-01T12:00:00Z");
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function calendarFixture(clock = now) {
  const root = await mkdtemp(join(tmpdir(), "bbp20-calendar-")); roots.push(root);
  const dataDir = join(root, "data"); await mkdir(join(dataDir, "history"), {recursive:true});
  const path = join(dataDir, "history/usage-v1.sqlite");
  const db = (await openHistoryDatabase(path))!;
  initializeHistory(db, new Date(clock).toISOString(), false); maintainHistory(db,clock);
  const history = createHostHistory({now:()=>clock,agentDir:()=>join(root,"agent")});
  const harness = experimental_createHostEntryHarness(createQuotaHostEntry({history,auth:async()=>{throw Error("no account");},read:async()=>{throw Error("no account");}}),{experimental_paths:{dataDir,tempDir:join(root,"temp")}});
  return {db,path,root,dataDir,history,harness,read: async (query: import("./calendar-contract.js").CalendarQuery = {startDate:"2026-09-01",timezone:"UTC",group:"workspace" as const,scope:{kind:"host" as const}}) => {
    const value = await harness.experimental_call("calendarReport",query);
    if(value.state==="unavailable") throw Error(value.reason);
    return value;
  }};
}
function put(db: import("./history-storage.js").HistoryDatabase, n:number, at="2026-09-15T12:00:00.000Z", workspace="/original", total=10, providerSessionKey:string|null=null) {
 const value=usageRecordSchema.parse({version:1,eventId:`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`,provenance:"observed",occurredAt:at,sessionId:"synthetic",workspace,providerSessionKey,claimedThreadId:null,provider:"openai-codex",model:"synthetic",inputTokens:4,outputTokens:6,reasoningTokens:3,cacheReadTokens:2,cacheWriteTokens:0,totalTokens:total,capturedCost:null});
 projectCompactRecord(db,value);
}
it("aggregates every accepted record beyond the old event cap and fifty visible entities",async()=>{
 const f=await calendarFixture();f.db.transaction(()=>{for(let n=1;n<=12060;n++)put(f.db,n,undefined,`/workspace-${n%60}`);});f.db.close();
 const view=await f.read();expect(view.summary).toMatchObject({totalTokens:120600,activeEntities:60,excludedTokens:0});
 expect(view.days.find(day=>day.date==="2026-09-15")).toMatchObject({totalTokens:120600,activeEntities:60});
 expect(view.ranking).toHaveLength(50);expect(view.ranking.every(row=>row.totalTokens===2010)).toBe(true);expect(view.truncated).toBe(true);
 await f.harness.experimental_dispose();
},30000);
it.each([
 ["2026-04-01T12:00:00Z","2026-03-02","America/New_York",["2026-03-08T04:59:59.000Z","2026-03-08T05:00:00.000Z","2026-03-09T03:59:59.000Z","2026-03-09T04:00:00.000Z"],["2026-03-07","2026-03-08","2026-03-08","2026-03-09"]],
 ["2026-11-30T12:00:00Z","2026-10-31","America/New_York",["2026-11-01T03:59:59.000Z","2026-11-01T04:00:00.000Z","2026-11-02T04:59:59.000Z","2026-11-02T05:00:00.000Z"],["2026-10-31","2026-11-01","2026-11-01","2026-11-02"]],
 ["2024-03-02T12:00:00Z","2024-02-01","Asia/Tokyo",["2024-02-28T14:59:59.000Z","2024-02-28T15:00:00.000Z","2024-02-29T14:59:59.000Z","2024-02-29T15:00:00.000Z"],["2024-02-28","2024-02-29","2024-02-29","2024-03-01"]],
 ["2027-01-15T12:00:00Z","2026-12-16","Europe/Brussels",["2026-12-31T22:59:59.000Z","2026-12-31T23:00:00.000Z"],["2026-12-31","2027-01-01"]],
] as const)("assigns original instants to real local dates at %s",async(clock,startDate,timezone,instants,dates)=>{
 const f=await calendarFixture(Date.parse(clock));f.db.transaction(()=>instants.forEach((at,n)=>put(f.db,n+1,at,`/workspace-${n}`,n+1)));f.db.close();
 const view=await f.read({startDate,timezone,group:"workspace",scope:{kind:"host"}});
 const expected=dates.map((date,n)=>({date,tokens:n+1}));
 for(const date of new Set(dates))expect(view.days.find(day=>day.date===date)?.totalTokens).toBe(expected.filter(row=>row.date===date).reduce((n,row)=>n+row.tokens,0));
 expect(view.days).toHaveLength(30);expect(view.summary.totalTokens).toBe(instants.length===4?10:3);
 await f.harness.experimental_dispose();
});
it("keeps whole-range navigation within retained bounds and excludes today",async()=>{
 const f=await calendarFixture();put(f.db,1,"2026-10-01T00:00:00.000Z");f.db.close();
 const latest=await f.read();expect(latest.next).toBe(false);expect(latest.previous).toBe(true);expect(latest.days[0].date).toBe("2026-09-01");expect(latest.days.at(-1)?.date).toBe("2026-09-30");expect(latest.summary.totalTokens).toBe(0);
 const previous=await f.read({startDate:"2026-08-02",timezone:"UTC",group:"workspace",scope:{kind:"host"}});expect(previous.next).toBe(true);expect(previous.previous).toBe(true);expect(previous.days.at(-1)?.date).toBe("2026-08-31");
 const oldest=await f.read({startDate:"2026-07-03",timezone:"UTC",group:"workspace",scope:{kind:"host"}});expect(oldest.previous).toBe(false);
 for(const startDate of ["2026-06-03","2026-09-02"])expect(await f.harness.experimental_call("calendarReport",{startDate,timezone:"UTC",group:"workspace",scope:{kind:"host"}})).toEqual({state:"unavailable",reason:"range-unavailable"});
 await f.harness.experimental_dispose();
});
it("uses scoped evidence for reliable zero and keeps paused, recovery and uncovered days as gaps",async()=>{
 const f=await calendarFixture();
 recordCoverage(f.db,{id:"inactive-original",workspace:"/original",threadId:null,start:"2026-09-01T00:00:00Z",end:"2026-10-01T00:00:00Z",kind:"observed-inactivity"});
 f.db.prepare("INSERT INTO collector_pauses(started,ended) VALUES (?,?)").run("2026-09-10T12:00:00.000Z","2026-09-10T13:00:00.000Z");
 f.db.prepare("INSERT INTO history_recovery VALUES (1,?,?)").run("2026-09-11T00:00:00.000Z","2026-09-12T00:00:00.000Z");f.db.close();
 const scoped=await f.read({startDate:"2026-09-01",timezone:"UTC",group:"workspace",scope:{kind:"workspace",workspace:"/original"}});
 expect(scoped.days[0].coverage).toMatchObject({state:"observed-inactivity",zero:true});
 expect(scoped.days[9].coverage).toMatchObject({state:"incomplete",zero:false,pauses:1});expect(scoped.days[10].coverage).toMatchObject({state:"incomplete",zero:false,recoveryGap:true});
 expect((await f.read()).days[0].coverage).toMatchObject({state:"uncovered",zero:false});
 expect((await f.read({startDate:"2026-09-01",timezone:"UTC",group:"workspace",scope:{kind:"workspace",workspace:"/other"}})).days[0].coverage.zero).toBe(false);
 await f.harness.experimental_dispose();
});
it("keeps expired classes unavailable and recorded tokens intact after reopen",async()=>{
 const f=await calendarFixture();put(f.db,1,"2026-08-05T12:00:00.000Z");maintainHistory(f.db,now);f.db.close();
 const view=await f.read({startDate:"2026-08-02",timezone:"UTC",group:"workspace",scope:{kind:"host"}});
 expect(view.days.find(day=>day.date==="2026-08-05")).toMatchObject({totalTokens:10,classes:{state:"unavailable"}});expect(view.summary.totalTokens).toBe(10);
 await f.harness.experimental_dispose();
});
it("preserves deleted verified history and never allocates unknown workspace shares to threads",async()=>{
 const f=await calendarFixture();f.db.transaction(()=>{put(f.db,1,undefined,"/shared",10,"provider-a.jsonl");put(f.db,2,undefined,"/shared",20,null);put(f.db,3,undefined,"/shared",30,"provider-b.jsonl");});
 acceptIdentityBatch(f.db,{hostId:"host_a",generation:1,offset:0,total:3,rows:[{threadId:"thr_deleted",providerIdentity:"provider-a",title:null,state:"deleted"},{threadId:"thr_ambiguous_a",providerIdentity:"provider-b",title:"A",state:"available"},{threadId:"thr_ambiguous_b",providerIdentity:"provider-b",title:"B",state:"available"}]});reconcileIdentity(f.db,new AbortController().signal);reconcileIdentity(f.db,new AbortController().signal);f.db.close();
 const workspaces=await f.read();expect(workspaces.summary).toMatchObject({totalTokens:60,activeEntities:1});expect(workspaces.ranking[0]).toMatchObject({key:"/shared",attribution:"ambiguous"});
 const threads=await f.read({startDate:"2026-09-01",timezone:"UTC",group:"thread",scope:{kind:"host"}});expect(threads.summary).toMatchObject({totalTokens:10,activeEntities:1,excludedTokens:50});expect(threads.ranking).toMatchObject([{key:"thr_deleted",label:"Deleted thread thr_deleted",metadata:"deleted",totalTokens:10}]);
 expect((await f.read({startDate:"2026-09-01",timezone:"UTC",group:"thread",scope:{kind:"thread",threadId:"thr_deleted"}})).summary.totalTokens).toBe(10);
 await f.harness.experimental_dispose();
});
it("returns exact safe totals but refuses unsafe aggregate overflow",async()=>{
 const f=await calendarFixture();put(f.db,1,undefined,"/huge",Number.MAX_SAFE_INTEGER);f.db.close();expect((await f.read()).summary.totalTokens).toBe(Number.MAX_SAFE_INTEGER);
 const db=(await openHistoryDatabase(f.path))!;put(db,2,undefined,"/another",1);db.close();expect(await f.harness.experimental_call("calendarReport",{startDate:"2026-09-01",timezone:"UTC",group:"workspace",scope:{kind:"host"}})).toEqual({state:"unavailable",reason:"storage-unavailable"});
 await f.harness.experimental_dispose();
});
it("uses durable unfinished and canceled import evidence to prevent a false scoped zero",async()=>{
 const f=await calendarFixture(),source=join(f.root,"source"),workspace=join(f.root,"workspace");await mkdir(source);await mkdir(workspace);
 recordCoverage(f.db,{id:"host-inactive",workspace:null,threadId:null,start:"2026-09-01T00:00:00Z",end:"2026-10-01T00:00:00Z",kind:"observed-inactivity"});
 acceptIdentityBatch(f.db,{hostId:"host_a",generation:1,offset:0,total:50,rows:Array.from({length:50},(_,n)=>({threadId:`thr_missing_${n}`,providerIdentity:`missing-${n}`,title:null,state:"available" as const}))});reconcileIdentity(f.db,new AbortController().signal);f.db.close();
 const input=(command:import("./import-contract.js").ImportCommand)=>({hostId:"host_a",knownWorkspaces:[workspace],command});
 expect(await f.harness.experimental_call("historicalImport",input({action:"configure",configuration:{bbRoot:source,ordinaryRoots:[],workspaces:[workspace]}}))).toMatchObject({reason:"ok"});
 const job=await f.harness.experimental_call("historicalImport",input({action:"start"}));expect(job.generation?.state).toBe("stopped");
 const pending=await f.read();expect(pending.days[0].coverage).toMatchObject({state:"incomplete",zero:false,backlog:true});
 await f.harness.experimental_call("historicalImport",input({action:"resume"}));
 await f.harness.experimental_call("historicalImport",input({action:"cancel"}));
 const canceled=await f.read();expect(canceled.days[0].coverage).toMatchObject({state:"incomplete",zero:false,uncertain:true});expect(canceled.days[0].coverage.omissions).toBeGreaterThan(0);
 await f.harness.experimental_dispose();
 const reopened=createHostHistory({now:()=>now});const snapshot=await reopened.read({dataDir:f.dataDir,signal:new AbortController().signal,calendar:{startDate:"2026-09-01",timezone:"UTC",group:"workspace",scope:{kind:"host"}}});expect(snapshot.calendar).toMatchObject({days:expect.arrayContaining([expect.objectContaining({coverage:expect.objectContaining({zero:false,uncertain:true})})])});
});
it("keeps unsupported headers and WAL databases untouched and no-query readiness separate",async()=>{
 const f=await calendarFixture();f.db.close();
 const {readFile}=await import("node:fs/promises");
 const db=(await openHistoryDatabase(f.path))!;db.exec("PRAGMA user_version=99");db.close();const before=await readFile(f.path);
 expect(await f.harness.experimental_call("calendarReport",{startDate:"2026-09-01",timezone:"UTC",group:"workspace",scope:{kind:"host"}})).toEqual({state:"unavailable",reason:"storage-incompatible"});expect(await readFile(f.path)).toEqual(before);
 const repaired=(await openHistoryDatabase(f.path))!;repaired.exec("PRAGMA user_version=4; PRAGMA journal_mode=WAL");repaired.close();const walBefore=await readFile(f.path);
 expect(await f.harness.experimental_call("calendarReport",{startDate:"2026-09-01",timezone:"UTC",group:"workspace",scope:{kind:"host"}})).toEqual({state:"unavailable",reason:"storage-unavailable"});expect(await readFile(f.path)).toEqual(walBefore);
 await f.harness.experimental_dispose();
});
it("does not aggregate calendar data on a no-query readiness read",async()=>{
 const f=await calendarFixture();put(f.db,1,undefined,"/huge",Number.MAX_SAFE_INTEGER);put(f.db,2,undefined,"/other",1);f.db.close();
 expect(await f.harness.experimental_call("historyReadiness",null)).toMatchObject({state:"not-configured"});
 expect((await f.history.read({dataDir:f.dataDir,signal:new AbortController().signal})).calendar).toBeUndefined();
 expect(await f.harness.experimental_call("calendarReport",{startDate:"2026-09-01",timezone:"UTC",group:"workspace",scope:{kind:"host"}})).toEqual({state:"unavailable",reason:"storage-unavailable"});await f.harness.experimental_dispose();
});
it("refuses incomplete canonical ownership backfill without exposing partial totals",async()=>{
  const f=await calendarFixture();f.db.prepare("UPDATE history_retention SET backfill_done=0 WHERE id=1").run();f.db.close();
  expect(await f.harness.experimental_call("calendarReport",{startDate:"2026-09-01",timezone:"UTC",group:"workspace",scope:{kind:"host"}})).toEqual({state:"unavailable",reason:"storage-unavailable"});
  await f.harness.experimental_dispose();
});
it("reports retained import-only usage independently of collector assets without account or import work", async () => {
  const root = await mkdtemp(join(tmpdir(), "bbp20-calendar-")); roots.push(root);
  const dataDir = join(root, "data"); await mkdir(join(dataDir, "history"), { recursive: true });
  const db = (await openHistoryDatabase(join(dataDir, "history/usage-v1.sqlite")))!;
  initializeHistory(db, new Date(now).toISOString(), false);
  maintainHistory(db, now);
  db.transaction(() => projectCompactRecord(db, usageRecordSchema.parse({
    version: 1, eventId: "00000000-0000-4000-8000-000000000001", provenance: "imported", occurredAt: "2026-09-15T12:00:00.000Z",
    sessionId: "synthetic", workspace: "/original", providerSessionKey: null, claimedThreadId: null, provider: "openai-codex", model: "synthetic",
    inputTokens: 4, outputTokens: 6, reasoningTokens: 3, cacheReadTokens: 2, cacheWriteTokens: 0, totalTokens: 10, capturedCost: null,
  })));
  db.close();
  const history = createHostHistory({ now: () => now, agentDir: () => join(root, "agent") });
  const entry = createQuotaHostEntry({ history, auth: async () => { throw Error("no auth"); }, read: async () => { throw Error("no account"); } });
  const harness = experimental_createHostEntryHarness(entry, { experimental_paths: { dataDir, tempDir: join(root, "temp") } });
  const result = await harness.experimental_call("calendarReport", { startDate: "2026-09-01", timezone: "UTC", group: "workspace", scope: { kind: "host" } });
  expect(result).toMatchObject({ state: "partial", capture: "unconfirmed", summary: { totalTokens: 10, activeEntities: 1 }, days: expect.arrayContaining([{ date: "2026-09-15", totalTokens: 10, activeEntities: 1, coverage: expect.objectContaining({ state: "imported" }), money: expect.objectContaining({capturedCost:null}), classes: { state: "available", input: 4, output: 6, reasoning: 3, cacheRead: 2, cacheWrite: 0 }, excludedTokens: 0 }]) });
  if(result.state==="unavailable") throw Error(result.reason);
  expect(result.days).toHaveLength(30);
  expect(result.ranking).toMatchObject([{ key: "/original", totalTokens: 10 }]);
  await harness.experimental_dispose();
});
it.each(["missing","malformed","symlink","oversized"] as const)("refuses %s established control without changing owned files",async(mode)=>{
 const f=await calendarFixture();put(f.db,1);f.db.close();expect(await f.harness.experimental_call("collectorControl",{action:"install"})).toMatchObject({state:"available"});expect((await f.read()).summary.totalTokens).toBe(10);
 const controlPath=join(f.dataDir,"history/collector-control-v1.json"),control=await readFile(controlPath),database=await readFile(f.path),target=join(f.root,"owned-control-target");
 if(mode==="missing")await rm(controlPath);else if(mode==="malformed")await writeFile(controlPath,"{");else if(mode==="oversized")await writeFile(controlPath," ".repeat(1025));else {await writeFile(target,control);await rm(controlPath);await symlink(target,controlPath);}
 const before=mode==="missing"?null:await readFile(controlPath);
 expect(await f.harness.experimental_call("calendarReport",{startDate:"2026-09-01",timezone:"UTC",group:"workspace",scope:{kind:"host"}})).toEqual({state:"unavailable",reason:"storage-unavailable"});expect(await readFile(f.path)).toEqual(database);
 if(mode==="missing")await expect(lstat(controlPath)).rejects.toMatchObject({code:"ENOENT"});else expect(await readFile(controlPath)).toEqual(before);
 if(mode==="symlink"){expect((await lstat(controlPath)).isSymbolicLink()).toBe(true);expect(await readFile(target)).toEqual(control);}
 await f.harness.experimental_dispose();
});
it("refuses malformed present control even with no established collector",async()=>{
 const f=await calendarFixture();put(f.db,1);f.db.close();expect((await f.read()).summary.totalTokens).toBe(10);const path=join(f.dataDir,"history/collector-control-v1.json");await writeFile(path,"{");
 expect(await f.harness.experimental_call("calendarReport",{startDate:"2026-09-01",timezone:"UTC",group:"workspace",scope:{kind:"host"}})).toEqual({state:"unavailable",reason:"storage-unavailable"});expect(await readFile(path,"utf8")).toBe("{");await f.harness.experimental_dispose();
});
it("expires dormant detail and ranges by the read clock after persistent reopen, without maintenance",async()=>{
 const f=await calendarFixture();put(f.db,1);f.db.close();expect((await f.read()).days[14].classes.state).toBe("available");const before=await readFile(f.path);await f.harness.experimental_dispose();
 let clock=Date.parse("2026-11-15T12:00:00Z");const history=createHostHistory({now:()=>clock});const query={startDate:"2026-09-01",timezone:"UTC",group:"workspace" as const,scope:{kind:"host" as const}};
 const context={dataDir:f.dataDir,signal:new AbortController().signal,calendar:query};const detail=(await history.read(context)).calendar!;
 expect(detail).toMatchObject({state:"partial",summary:{totalTokens:10},compactFrom:"2026-08-06T00:00:00.000Z",previous:false,days:expect.arrayContaining([expect.objectContaining({date:"2026-09-15",totalTokens:10,classes:{state:"unavailable"}})])});
 clock=Date.parse("2027-02-01T12:00:00Z");expect((await history.read(context)).calendar).toEqual({state:"unavailable",reason:"range-unavailable"});
 expect((await history.read({...context,calendar:{...query,startDate:"2026-11-01"}})).calendar).toMatchObject({compactFrom:"2026-10-23T00:00:00.000Z",previous:false});expect(await readFile(f.path)).toEqual(before);
 const db=(await openHistoryDatabase(f.path,true))!;expect(db.prepare("SELECT count(*) AS n FROM usage_events").get()).toEqual({n:1});db.close();
});
it("does not restore logically expired detail after the clock rolls behind a saved cutoff",async()=>{
 const f=await calendarFixture();put(f.db,1,"2026-09-14T12:00:00.000Z");put(f.db,2,undefined,undefined,20);maintainHistory(f.db,Date.parse("2026-11-15T12:00:00Z"),1);expect(f.db.prepare("SELECT count(*) AS n FROM usage_events").get()).toEqual({n:1});f.db.close();
 const view=await f.read();expect(view.summary.totalTokens).toBe(30);expect(view.days[14]).toMatchObject({totalTokens:20,classes:{state:"unavailable"}});expect(view.compactFrom).toBe("2026-08-06T00:00:00.000Z");expect(view.previous).toBe(false);await f.harness.experimental_dispose();
});

it("keeps comparison on the optional HostHistory.read calendar path without readiness maintenance",async()=>{
 const f=await calendarFixture();put(f.db,1);f.db.close();const before=await readFile(f.path);
 const query={startDate:"2026-09-01",timezone:"UTC",group:"workspace" as const,scope:{kind:"host" as const},comparison:true};
 const snapshot=await f.history.read({dataDir:f.dataDir,signal:new AbortController().signal,calendar:query});
 expect(snapshot.calendar).toMatchObject({query,summary:{totalTokens:10,money:{capturedCost:null}},comparison:{query:{...query,startDate:"2026-08-02"},prior:{state:"unknown",summary:{money:{capturedCost:null}}},percentage:null,reasons:{tokens:"collection-unproved"}}});
 expect(await readFile(f.path)).toEqual(before);expect((await f.history.read({dataDir:f.dataDir,signal:AbortSignal.abort(),calendar:query})).calendar).toEqual({state:"unavailable",reason:"selection-changed"});await f.harness.experimental_dispose();
});
