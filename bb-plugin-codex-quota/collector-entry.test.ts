import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { COLLECTOR_ENTRY } from "./collector-entry.js";
import { usageRecordSchema, confirmationSchema } from "./usage-record.js";
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root,{recursive:true,force:true}))); });
async function fixture() {
  vi.spyOn(Date,"now").mockReturnValue(1234567890000);
  const root = await realpath(await mkdtemp(join(tmpdir(), "bbp18-writer-"))); roots.push(root);
  await mkdir(join(root,"history")); await mkdir(join(root,"workspace"));
  await writeFile(join(root,"history/collector-control-v1.json"), '{"protocol":2,"revision":"00000000-0000-4000-8000-000000000001","enabled":true}');
  const handlers = new Map<string, Function>();
  const module = await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(`export default ${COLLECTOR_ENTRY}`)}`);
  module.default({ on: (name: string, handler: Function) => handlers.set(name,handler) }, {dataDir:root,protocol:2});
  let leaf: string|null = null, entryReads = 0;
  const entries = new Map<string, unknown>();
  const ctx = { cwd:join(root,"workspace"), sessionManager: { getSessionId:()=>"synthetic-session", getSessionFile:()=>"/bounded/provider.jsonl", getLeafId:()=>leaf, getEntry:(id:string)=>{entryReads++; return entries.get(id);} } };
  const persist = (message: unknown, id: string) => { entries.set(id,{type:"message",id,parentId:leaf,message}); leaf=id; };
  const message = (cost?: number) => ({ role:"assistant", provider:"openai-codex",model:"gpt-5",timestamp:1234567890000,usage:{input:3,output:4,cacheRead:2,cacheWrite:1,reasoning:2,totalTokens:10,...(cost===undefined ? {} : {cost:{total:cost}})},content:"conversation-secret",toolArgs:"tool-credential-secret" });
  return {root,ctx,persist,message,handlers,reads:()=>entryReads, log:join(root,"history/events-v1-2009-02-13.jsonl")};
}
it("serializes actual compact writes, validates metadata, preserves original price/time, confirms only object identity and drains on shutdown", async () => {
  const f = await fixture(), messages=[f.message(0.125),f.message(0),f.message()];
  const prior=process.env.BB_THREAD_ID;process.env.BB_THREAD_ID="thr_claim";
  try {
    for(const [i,message] of messages.entries()) { f.handlers.get("message_end")!({message},f.ctx); f.persist(message,`entry-${i}`); }
    await f.handlers.get("session_shutdown")!({},f.ctx);
  } finally { if(prior===undefined) delete process.env.BB_THREAD_ID;else process.env.BB_THREAD_ID=prior; }
  const text=await readFile(f.log,"utf8"), records=text.trim().split("\n").map(line=>usageRecordSchema.parse(JSON.parse(line)));
  expect(records).toHaveLength(3); expect(new Set(records.map(r=>r.eventId)).size).toBe(3);
  expect(records.map(r=>r.capturedCost)).toEqual([0.125,null,null]);
  expect(records[0]).toMatchObject({occurredAt:"2009-02-13T23:31:30.000Z",workspace:f.ctx.cwd,providerSessionKey:"provider.jsonl",claimedThreadId:"thr_claim",reasoningTokens:2,totalTokens:10});
  const confirmations=(await readFile(join(f.root,"history/confirmations-v1-2009-02-13.jsonl"),"utf8")).trim().split("\n").map(line=>confirmationSchema.parse(JSON.parse(line)));
  expect(confirmations).toHaveLength(3);expect(f.reads()).toBeLessThanOrEqual(128);
  expect(text+JSON.stringify(confirmations)).not.toContain("secret");
});
it("ignores non-Codex and invalid fields, paused or incompatible controls; no raw exception reaches diagnostics", async () => {
  const f=await fixture();const diagnostic=vi.spyOn(console,"error").mockImplementation(()=>{});
  for(const message of [{...f.message(),provider:"anthropic"},{...f.message(),model:""},{...f.message(),timestamp:NaN},{...f.message(),usage:{...f.message().usage,input:-1}}]) await f.handlers.get("message_end")!({message},f.ctx);
  await expect(readFile(f.log)).rejects.toThrow();
  await writeFile(join(f.root,"history/collector-control-v1.json"), '{"protocol":2,"revision":"00000000-0000-4000-8000-000000000001","enabled":false}');
  await f.handlers.get("message_end")!({message:f.message()},f.ctx);await expect(readFile(f.log)).rejects.toThrow();
  await writeFile(join(f.root,"history/collector-control-v1.json"), 'private-error-secret');
  await f.handlers.get("message_end")!({message:f.message()},f.ctx);
  expect(diagnostic.mock.calls.flat()).toEqual(["[bb-codex-usage] Collector work incomplete"]);
});
it("bounds confirmation traversal, does not match equal message values, and resolves workspace aliases",async()=>{
  const f=await fixture();await symlink(f.ctx.cwd,join(f.root,"alias"));f.ctx.cwd=join(f.root,"alias");
  const message=f.message();await f.handlers.get("message_end")!({message},f.ctx);f.persist({...message},"not-same-object");
  for(let i=0;i<200;i++)f.persist({},`ancestor-${i}`);
  await f.handlers.get("agent_end")!({},f.ctx);expect(f.reads()).toBe(128);
  await expect(readFile(join(f.root,"history/confirmations-v1-2009-02-13.jsonl"))).rejects.toThrow();
  expect(JSON.parse((await readFile(f.log,"utf8")).trim()).workspace).toBe(join(f.root,"workspace"));
});
