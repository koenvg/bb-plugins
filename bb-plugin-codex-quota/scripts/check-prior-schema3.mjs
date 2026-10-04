// Actual pre-integration artifact against actual combined schema. Owned fixture only.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire,syncBuiltinESMExports} from 'node:module';
const source=process.argv[2];
assert.ok(source,'Pass the preserved schema-3 host artifact path');
assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'),'f595a52ca254eb1c4aee626e258d132c0ea3799239e83d113d28cc9d04120af4','Use the exact pre-integration schema-3 artifact');
const root=mkdtempSync(join(tmpdir(),'bbp16-prior-'));
const previousAgent=process.env.PI_CODING_AGENT_DIR,previousFetch=globalThis.fetch;
const sqlite=createRequire(import.meta.url)('node:sqlite'),Original=sqlite.DatabaseSync;
const load=path=>import(pathToFileURL(path).href);
function snapshot(path) {
  return readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?snapshot(join(path,entry.name)): [[join(path,entry.name),readFileSync(join(path,entry.name))]]);
}
try {
  const dataDir=join(root,'data'),agent=join(root,'agent'),directory=join(dataDir,'history'),path=join(directory,'usage-v1.sqlite');
  mkdirSync(dataDir);mkdirSync(agent);process.env.PI_CODING_AGENT_DIR=agent;
  globalThis.fetch=async()=>{throw Error('Network forbidden');};
  const currentPath=join(root,'current-host.mjs');copyFileSync(new URL('../dist/host.js',import.meta.url),currentPath);
  const current=await load(currentPath),prior=await load(source);
  const signal=new AbortController().signal,context={signal,lifecycle:{signal},experimental_paths:{dataDir,tempDir:join(root,'temp')}};
  // Public handler installs and pauses only this isolated fixture. No Pi session runs.
  assert.equal((await current.default.handlers.collectorControl({action:'install'},context)).state,'available');
  assert.equal((await current.default.handlers.collectorControl({action:'pause'},context)).collection.enabled,false);
  const db=await current.openHistoryDatabase(path);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,4);
  for(const table of ['usage_compact','usage_expired','history_legacy_pending','history_writer_observation','identity_receipt','import_generations'])assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
  db.exec("CREATE TABLE owned_proof(id INTEGER PRIMARY KEY,value TEXT NOT NULL); INSERT INTO owned_proof VALUES(1,'preserved')");db.close();
  const database=readFileSync(path),control=readFileSync(join(directory,'collector-control-v1.json')),agentFiles=snapshot(agent);
  const opens=[];
  sqlite.DatabaseSync=new Proxy(Original,{construct(target,args,newTarget){if(args[0]!==':memory:')opens.push(args[0]);return Reflect.construct(target,args,newTarget);}});syncBuiltinESMExports();
  for(const wal of [false,true]) {
    if(wal){writeFileSync(path+'-wal','owned-unsettled-wal');writeFileSync(path+'-shm','owned-unsettled-shm');}
    const ready=await prior.default.handlers.historyReadiness(null,context);
    assert.equal(ready.storage,'incompatible');assert.equal(ready.reason,'storage-incompatible');
    const repair=await prior.default.handlers.collectorControl({action:'repair'},context);assert.equal(repair.storage,'incompatible');
    assert.deepEqual(opens,[],'Prior artifact must reject combined schema 4 before database open');
    assert.deepEqual(readFileSync(path),database);assert.deepEqual(readFileSync(join(directory,'collector-control-v1.json')),control);
    if(wal){assert.equal(readFileSync(path+'-wal','utf8'),'owned-unsettled-wal');assert.equal(readFileSync(path+'-shm','utf8'),'owned-unsettled-shm');}
    assert.deepEqual(snapshot(agent),agentFiles);assert.ok(!readdirSync(directory).some(name=>name.includes('quarantine')));
  }
  console.log('Actual schema-3 artifact rejected actual combined schema 4 before database open; database/control/WAL/SHM/agent preserved. Node',process.versions.node);
} finally {
  sqlite.DatabaseSync=Original;syncBuiltinESMExports();globalThis.fetch=previousFetch;
  if(previousAgent===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=previousAgent;
  rmSync(root,{recursive:true,force:true});
}
