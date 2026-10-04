// Actual packaged handlers. Owned persistent SQLite/source/agent fixtures only.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=mkdtempSync(join(tmpdir(),'bbp16-storage-proof-')),oldAgent=process.env.PI_CODING_AGENT_DIR,oldFetch=globalThis.fetch;
let leases=0;
try{
  mkdirSync(join(root,'agent'));process.env.PI_CODING_AGENT_DIR=join(root,'agent');globalThis.fetch=async()=>{throw Error('Network forbidden');};
  const artifact=join(root,'host.mjs');copyFileSync(process.argv[2]??new URL('../dist/host.js',import.meta.url),artifact);
  const bundle=await import(pathToFileURL(artifact).href);
  const context=name=>{
    const dataDir=join(root,name);mkdirSync(dataDir);
    const signal=new AbortController().signal;
    return {signal,lifecycle:{signal},experimental_paths:{dataDir,tempDir:join(root,'temp')},experimental_retainWorker(){leases++;let released=false;return {async dispose(){if(!released){released=true;leases--;}}};}};
  };
  const setup=async name=>{const ctx=context(name);assert.equal((await bundle.default.handlers.collectorControl({action:'install'},ctx)).state,'available');await bundle.default.handlers.collectorControl({action:'pause'},ctx);return ctx;};
  const pathFor=ctx=>join(ctx.experimental_paths.dataDir,'history/usage-v1.sqlite');
  if(!process.argv[3] || process.argv[3]==='partial') for(const version of [2,3,4])for(const damage of ['compact','owner','retention']){
    const ctx=await setup(`partial-${version}-${damage}`),path=pathFor(ctx),db=await bundle.openHistoryDatabase(path);
    if(damage==='compact')db.exec('DROP TABLE usage_compact');if(damage==='owner')db.exec('DELETE FROM history_owner');if(damage==='retention')db.exec('DELETE FROM history_retention');
    db.exec(`PRAGMA user_version=${version}`);db.close();
    const before=readFileSync(path),directory=join(ctx.experimental_paths.dataDir,'history'),files=readdirSync(directory),control=readFileSync(join(directory,'collector-control-v1.json'));
    assert.equal((await bundle.default.handlers.historyReadiness(null,ctx)).storage,'incompatible');
    assert.equal((await bundle.default.handlers.historicalImport({hostId:'host-proof',knownWorkspaces:[],command:{action:'status'}},ctx)).reason,'storage-incompatible');
    assert.deepEqual(readFileSync(path),before);assert.deepEqual(readdirSync(directory),files);assert.deepEqual(readFileSync(join(directory,'collector-control-v1.json')),control);
  }
  if(!process.argv[3] || process.argv[3]==='wal') for(const mode of ['absent','empty'])for(const layout of ['valid','foreign']){
    const ctx=await setup(`wal-${mode}-${layout}`),path=pathFor(ctx),db=await bundle.openHistoryDatabase(path);
    if(layout==='foreign'){const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();for(const {name} of tables)db.exec(`DROP TABLE ${name}`);db.exec('CREATE TABLE foreign_records(value TEXT); PRAGMA user_version=1');}
    db.exec('PRAGMA journal_mode=WAL');db.close();if(mode==='empty')writeFileSync(path+'-wal','');
    const before=readFileSync(path),directory=join(ctx.experimental_paths.dataDir,'history'),files=readdirSync(directory);
    assert.equal((await bundle.default.handlers.historyReadiness(null,ctx)).storage,'unavailable');
    assert.equal((await bundle.default.handlers.historicalImport({hostId:'host-proof',knownWorkspaces:[],command:{action:'status'}},ctx)).reason,'storage-unavailable');
    assert.deepEqual(readFileSync(path),before);assert.deepEqual(readdirSync(directory),files);
  }
  if(!process.argv[3] || process.argv[3]==='overlap'){
  const ctx=await setup('overlap'),directory=join(ctx.experimental_paths.dataDir,'history'),workspace=join(root,'workspace'),source=join(root,'sources');mkdirSync(workspace);mkdirSync(source);
  const time=new Date(Date.now()-60*86400000).toISOString(),eventId='00000000-0000-4000-8000-000000000001';
  const event={version:1,eventId,provenance:'observed',occurredAt:time,sessionId:'original-pi',workspace,providerSessionKey:'provider-owned.jsonl',claimedThreadId:null,provider:'openai-codex',model:'synthetic',inputTokens:2,outputTokens:3,cacheReadTokens:0,cacheWriteTokens:0,reasoningTokens:0,totalTokens:5,capturedCost:0.02};
  writeFileSync(join(directory,'events-v1.jsonl'),JSON.stringify(event)+'\n');
  const identities={hostId:'host-proof',generation:1,offset:0,total:1,rows:[{providerIdentity:'provider-owned',threadId:'thr_owned',title:'Owned',state:'available'}]};
  const ready=await bundle.default.handlers.historyReadiness({identities},ctx);assert.equal(ready.collection.workspaces[0].totalTokens,5);
  let db=await bundle.openHistoryDatabase(pathFor(ctx),true);assert.equal(db.prepare('SELECT count(*) AS n FROM usage_events').get().n,0);assert.equal(db.prepare('SELECT total,confirmed FROM usage_compact').get().confirmed,0);db.close();
  const header={type:'session',version:3,id:'original-pi',cwd:workspace,timestamp:time};
  const message={type:'message',id:'entry-one',parentId:null,timestamp:time,message:{role:'assistant',provider:'openai-codex',model:'synthetic',timestamp:Date.parse(time),content:'OWNED_SYNTHETIC_TEXT',usage:{input:2,output:3,cacheRead:0,cacheWrite:0,totalTokens:5,cost:{total:0.02}}}};
  writeFileSync(join(source,'provider-owned.jsonl'),[header,message].map(JSON.stringify).join('\n')+'\n');
  const call=command=>bundle.default.handlers.historicalImport({hostId:'host-proof',knownWorkspaces:[workspace],command},ctx);
  assert.equal((await call({action:'configure',configuration:{bbRoot:source,ordinaryRoots:[],workspaces:[workspace]}})).reason,'ok');
  let view=await call({action:'start'});for(let n=0;view.generation?.state==='stopped'&&n<12;n++)view=await call({action:'resume'});
  assert.equal(view.generation.state,'completed');assert.equal(view.generation.records,0);assert.equal(view.generation.omissions,1);assert.deepEqual(view.generation.diagnostics,['unresolved-overlap']);
  db=await bundle.openHistoryDatabase(pathFor(ctx),true);assert.deepEqual({...db.prepare('SELECT total_tokens,events FROM workspace_totals').get()},{total_tokens:5,events:1});assert.equal(db.prepare('SELECT count(*) AS n FROM usage_compact').get().n,1);db.close();assert.equal(leases,0);
  }
  console.log('Packaged storage integration passed:',process.argv[3]??'partial schemas/singletons, WAL sidecar protection, compact-only unconfirmed overlap/import/reopen','Node',process.versions.node);
}finally{if(oldAgent===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=oldAgent;globalThis.fetch=oldFetch;rmSync(root,{recursive:true,force:true});}
