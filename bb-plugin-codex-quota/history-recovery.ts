import { constants } from "node:fs";
import { lstat, open, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { HistoryDatabaseFactory, HistoryDatabase } from "./history-storage.js";
import { safeDirectory, atomicWrite, readControl } from "./collector-control.js";
import { initializeHistory, recordPause } from "./history-projection.js";
import { retentionCutoffs } from "./history-retention.js";
const boundarySchema=z.object({firstObservedAt:z.iso.datetime(),detail:z.iso.datetime(),compact:z.iso.datetime(),hostKey:z.uuid()}).strict();
const receiptSchema=z.object({phase:z.enum(["quarantine","rebuild","complete"]),directory:z.string().regex(/^quarantine-[a-f0-9-]{36}$/),boundary:boundarySchema,start:z.iso.datetime(),end:z.iso.datetime()}).strict();
const absent=(e:unknown)=>!!e&&typeof e==="object"&&"code" in e&&e.code==="ENOENT";
async function readJson(path:string) {
 let file;try{file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);}catch(e){if(absent(e))return null;throw e;}
 try{const stat=await file.stat();if(!stat.isFile()||stat.size>4096)throw Error("History recovery unavailable");const bytes=Buffer.alloc(4097),{bytesRead}=await file.read(bytes,0,bytes.length,0);if(bytesRead>4096)throw Error("History recovery unavailable");return JSON.parse(bytes.subarray(0,bytesRead).toString("utf8"));}finally{await file.close();}
}
export function confirmedCorruption(error:unknown) {
 if(!error||typeof error!=="object")return false;
 const e=error as {code?:unknown;errcode?:unknown;errCode?:unknown};
 return [11,26].includes(Number(e.errcode??e.errCode))||["SQLITE_CORRUPT","SQLITE_NOTADB"].includes(String(e.code));
}
export async function saveBoundary(db:HistoryDatabase,directory:string,now:number,signal:AbortSignal) {
 const meta=db.prepare("SELECT first_observed FROM collector_meta WHERE id=1").get() as {first_observed:string};
 const state=db.prepare("SELECT detail_cutoff,compact_cutoff FROM history_retention WHERE id=1").get() as {detail_cutoff:string;compact_cutoff:string};
 const cutoff=retentionCutoffs(now);
 await atomicWrite(join(directory,"retention-boundary-v2.json"),JSON.stringify(boundarySchema.parse({firstObservedAt:meta.first_observed,hostKey:(db.prepare("SELECT host_key FROM history_owner WHERE id=1").get() as {host_key:string}).host_key,detail:state.detail_cutoff||cutoff.detail,compact:state.compact_cutoff||cutoff.compact})),signal);
}
const names=["usage-v1.sqlite","usage-v1.sqlite-wal","usage-v1.sqlite-shm","usage-v1.sqlite-journal"];
/** Closed database only. A receipt makes interrupted fixed-name moves resumable. */
export async function recoverHistory(factory:HistoryDatabaseFactory,directory:string,now:number,signal:AbortSignal,corrupt=false) {
 const path=join(directory,"recovery-v2.json");
 let receipt=receiptSchema.nullable().parse(await readJson(path));
 if(receipt?.phase==="complete"&&!corrupt)return false;
 if(!receipt||receipt.phase==="complete") {
  if(!corrupt)return false;
  // Missing established control is not permission to rebuild or resume a collector.
  if(await readControl(directory)===null)throw Error("History recovery unavailable");
  const boundary=boundarySchema.parse(await readJson(join(directory,"retention-boundary-v2.json")));
  const cutoff=retentionCutoffs(now);
  receipt={phase:"quarantine",directory:`quarantine-${randomUUID()}`,boundary,start:boundary.compact>cutoff.compact?boundary.compact:cutoff.compact,end:new Date(now).toISOString()};
  for(const name of names){try{const stat=await lstat(join(directory,name));if(!stat.isFile()||stat.isSymbolicLink())throw Error("History recovery unavailable");}catch(e){if(!absent(e))throw e;}}
  await atomicWrite(path,JSON.stringify(receipt),signal);
 }
 const enabled = await readControl(directory);
 if(enabled===null)throw Error("History recovery unavailable");
 if(receipt.phase==="quarantine") {
  await safeDirectory(join(directory,receipt.directory));
  for(const name of names) {
   signal.throwIfAborted();
   const source=join(directory,name),target=join(directory,receipt.directory,name);
   try{const stat=await lstat(source);if(!stat.isFile()||stat.isSymbolicLink())throw Error("History recovery unavailable");
    try{await lstat(target);throw Error("History recovery unavailable");}catch(e){if(!absent(e))throw e;}
    await rename(source,target);
   }catch(e){if(!absent(e))throw e;}
  }
  receipt.phase="rebuild";await atomicWrite(path,JSON.stringify(receipt),signal);
 }
 const db=factory(join(directory,names[0]));
 try {
  initializeHistory(db,receipt.boundary.firstObservedAt);
  db.transaction(()=>{
   db.prepare("UPDATE history_owner SET host_key=? WHERE id=1").run(receipt!.boundary.hostKey);
   db.prepare("UPDATE history_retention SET detail_cutoff=max(detail_cutoff,?),compact_cutoff=max(compact_cutoff,?) WHERE id=1").run(receipt!.boundary.detail,receipt!.start);
   db.prepare("INSERT OR REPLACE INTO history_recovery VALUES (1,?,?)").run(receipt!.start,receipt!.end);
  });
  // The earlier pause start is lost. The recovery gap covers the past; this known
  // boundary covers the ongoing disabled state without inventing earlier observations.
  if (!enabled && !db.prepare("SELECT id FROM collector_pauses WHERE ended IS NULL LIMIT 1").get()) {
    recordPause(db, receipt.end);
  }
 }finally{db.close();}
 receipt.phase="complete";await atomicWrite(path,JSON.stringify(receipt),signal);
 return true;
}
