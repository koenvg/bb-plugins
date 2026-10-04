import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { openHistoryDatabase, type HistoryDatabase } from "./history-storage.js";
import { initializeHistory, recordPause } from "./history-projection.js";
import { recordCoverage, readCoverage } from "./history-coverage.js";
const fixtures:{root:string;db:HistoryDatabase}[]=[];
afterEach(async()=>{for(const f of fixtures.splice(0)){f.db.close();await rm(f.root,{recursive:true,force:true});}});
async function fixture(){const root=await mkdtemp(join(tmpdir(),"bbp23-coverage-")),db=(await openHistoryDatabase(join(root,"usage.sqlite")))!;fixtures.push({root,db});initializeHistory(db,"2026-09-01T00:00:00.000Z");return db;}
const start="2026-09-01T00:00:00.000Z",mid="2026-09-01T12:00:00.000Z",end="2026-09-02T00:00:00.000Z";
const query={workspace:"/original",start,end};
it("installation, writer activation and no events are not observed inactivity",async()=>{
 const db=await fixture();expect(readCoverage(db,query)).toMatchObject({state:"uncovered",zero:false,writerActive:false});
 recordCoverage(db,{id:"activation",workspace:"/original",threadId:null,start,end,kind:"writer-active"});
 expect(readCoverage(db,query)).toMatchObject({state:"uncovered",zero:false,writerActive:true});
});
it("requires reliable full interval evidence for zero, with exact host/workspace/thread scope",async()=>{
 const db=await fixture();recordCoverage(db,{id:"half",workspace:"/original",threadId:null,start,end:mid,kind:"observed-inactivity"});
 expect(readCoverage(db,query).zero).toBe(false);
 recordCoverage(db,{id:"other-half",workspace:"/original",threadId:null,start:mid,end,kind:"observed-inactivity"});
 expect(readCoverage(db,query)).toMatchObject({state:"observed-inactivity",zero:true});
 expect(readCoverage(db,{...query,workspace:"/other"}).zero).toBe(false);expect(readCoverage(db,{...query,verifiedThread:"thr_missing"}).zero).toBe(false);
 expect(readCoverage(await fixture(),query).zero).toBe(false);
});
it("keeps pause, omission, backlog and uncertainty separate and rejects private fixture fields",async()=>{
 const db=await fixture();recordCoverage(db,{id:"imported-coverage",workspace:"/original",threadId:null,start,end,kind:"imported"});
 expect(readCoverage(db,query)).toMatchObject({state:"imported",zero:false});
 recordCoverage(db,{id:"omitted",workspace:"/original",threadId:null,start:mid,end,kind:"omission"});recordCoverage(db,{id:"uncertain",workspace:"/original",threadId:null,start:mid,end,kind:"uncertain"});
 recordPause(db,mid);
 recordCoverage(db,{id:"backlog",workspace:"/original",threadId:null,start,end,kind:"backlog"});
 expect(readCoverage(db,query)).toMatchObject({state:"incomplete",zero:false,pauses:1,omissions:1,uncertain:true,backlog:true});
 expect(()=>recordCoverage(db,{id:"private",workspace:"/original",threadId:null,start,end,kind:"imported",content:"secret"} as never)).toThrow();
});
