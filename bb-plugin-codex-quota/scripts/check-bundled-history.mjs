import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// BB's public guide specifies a Node 22 ESM host artifact. Copy it away from package dependencies.
assert.ok(Number(process.versions.node.split('.')[0]) >= 22, 'Node host runtime required');
const root = mkdtempSync(join(tmpdir(), 'bbp17-bundle-'));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const previousFetch = globalThis.fetch;
try {
  const agentDir = join(root, 'agent');
  const dataDir = join(root, 'host-data');
  const cwd = join(root, 'workspace');
  mkdirSync(cwd); mkdirSync(agentDir); mkdirSync(dataDir);
  process.env.PI_CODING_AGENT_DIR = agentDir;
  globalThis.fetch = async () => { throw Error('Network is forbidden in this proof'); };
  const artifact = join(root, 'host.mjs');
  copyFileSync(new URL('../dist/host.js', import.meta.url), artifact);
  const bundled = await import(pathToFileURL(artifact).href);
  const signal = new AbortController().signal;
  const context = { signal, lifecycle: { signal }, experimental_paths: { dataDir, tempDir: join(root, 'temp') } };
  const initial = await bundled.default.handlers.historyReadiness(null, context);
  assert.equal(initial.state, 'not-configured');
  assert.equal(initial.storage, 'unconfigured');
  assert.equal(initial.collector, 'missing');
  assert.deepEqual(readdirSync(dataDir), []);
  assert.deepEqual(readdirSync(agentDir), []);

  mkdirSync(join(dataDir, 'history'));
  const path = join(dataDir, 'history/usage-v1.sqlite');
  let db = await bundled.openHistoryDatabase(path);
  assert.ok(db, 'Real host SQLite adapter must be available');
  db.exec('PRAGMA user_version = 1; CREATE TABLE persistence_proof (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
  db.transaction(() => db.prepare('INSERT INTO persistence_proof VALUES (?, ?)').run(1, 'committed'));
  assert.throws(() => db.transaction(() => { db.prepare('INSERT INTO persistence_proof VALUES (?, ?)').run(2, 'rolled-back'); throw Error('rollback'); }));
  db.close();
  assert.ok(readFileSync(path).length > 0);
  db = await bundled.openHistoryDatabase(path, true);
  assert.deepEqual({ ...db.prepare('SELECT * FROM persistence_proof WHERE id = ?').get(1) }, { id: 1, value: 'committed' });
  assert.equal(db.prepare('SELECT count(*) AS count FROM persistence_proof').get().count, 1);
  db.close();
  assert.equal((await bundled.default.handlers.historyReadiness(null, context)).storage, 'compatible');
  console.log('Packaged Node host: create/commit/rollback/close/reopen/query passed with persistent temporary SQLite. Runtime:', process.versions.node);

  // Only this isolated fixture installs an asset. Production readiness has no install path.
  const extension = join(agentDir, 'extensions/bb-codex-usage');
  mkdirSync(extension, { recursive: true });
  const unrelated = join(agentDir, 'extensions/unrelated.js');
  const unrelatedSource = 'export default function other(pi) { pi.on("session_shutdown", () => {}); }\n';
  writeFileSync(unrelated, unrelatedSource);
  const settings = JSON.stringify({ extensions: ['./extensions/unrelated.js'], customSetting: 'preserved' });
  writeFileSync(join(agentDir, 'settings.json'), settings);
  writeFileSync(join(extension, 'index.js'), bundled.packagedCollectorAsset(dataDir));
  const loaderOutput = execFileSync(process.execPath, [fileURLToPath(new URL('./check-collector-loading.mjs', import.meta.url)), agentDir, cwd, dataDir], { stdio: 'pipe', env: { ...process.env, HOME: root, PI_CODING_AGENT_DIR: agentDir } });
  console.log(loaderOutput.toString('utf8').trim());
  assert.equal(readFileSync(unrelated, 'utf8'), unrelatedSource);
  assert.equal(readFileSync(join(agentDir, 'settings.json'), 'utf8'), settings);
  assert.deepEqual(readdirSync(dataDir), ['history']);
  assert.equal((await bundled.default.handlers.historyReadiness(null, context)).collector, 'compatible-v1');
  assert.equal((await bundled.default.handlers.historyReadiness(null, context)).writer, 'unconfirmed');
  console.log('Packaged Pi compatibility entry loaded in isolated temporary configuration; unrelated extension/settings preserved; no credentials/network. Live capture is not proved.');
} finally {
  globalThis.fetch = previousFetch;
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  rmSync(root, { recursive: true, force: true });
}
