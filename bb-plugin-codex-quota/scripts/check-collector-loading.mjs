import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

// This process receives only the isolated fixture. Pi extensions run in Pi's Node runtime.
const [agentDir, cwd, dataDir] = process.argv.slice(2);
assert.ok(agentDir && cwd);
process.env.PI_CODING_AGENT_DIR = agentDir;
globalThis.fetch = async () => { throw Error('Network is forbidden in collector loading'); };
const { discoverAndLoadExtensions } = await import('@earendil-works/pi-coding-agent');
const loaded = await discoverAndLoadExtensions([], cwd, agentDir);
assert.deepEqual(loaded.errors, []);
assert.ok(loaded.extensions.some((item) => item.path === join(agentDir, 'extensions/bb-codex-usage/index.js')), 'Pi must load the packaged asset');
assert.ok(loaded.extensions.some((item) => item.path === join(agentDir, 'extensions/unrelated.js')), 'Pi must load the unrelated extension');
const collector = loaded.extensions.find((item) => item.path === join(agentDir, 'extensions/bb-codex-usage/index.js'));
assert.ok(collector.handlers.get('message_end')?.length, 'Must load the real capture handler, not a placeholder');
const context = { cwd, sessionManager: { getSessionId: () => 'synthetic-session', getSessionFile: () => join(cwd, 'synthetic-provider.jsonl') } };
const event = { message: { role: 'assistant', provider: 'openai-codex', model: 'synthetic', timestamp: Date.now(), usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { total: 0 } }, content: 'private-content-sentinel', toolArgs: 'private-credentials-sentinel' } };
for (const handler of collector.handlers.get('message_end')) await handler(event, context);
assert.equal(existsSync(join(dataDir, 'history/events-v1.jsonl')), false, 'Missing control must not start a writer');
writeFileSync(join(dataDir, 'history/collector-control-v1.json'), JSON.stringify({ protocol: 1, enabled: true }));
for (const handler of collector.handlers.get('message_end')) await handler(event, context);
for (const handler of collector.handlers.get('session_shutdown')) await handler({}, context);
const text = readFileSync(join(dataDir, 'history/events-v1.jsonl'), 'utf8');
assert.equal(JSON.parse(text.trim()).totalTokens, 3);
assert.equal(text.includes('sentinel'), false, 'No message/tool/credential content may be stored');
console.log('Isolated Pi public extension loader: packaged asset and unrelated extension loaded. Runtime:', process.versions.node);
