import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, execFile as execute } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execute);
const closed = child => new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });

test('standalone guard uses only owned public stop routes with a fake BB CLI', { timeout: 10000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'bbp77-guard-fake-'));
  const bin = join(root, 'bin');
  await mkdir(bin);
  const log = join(root, 'calls.jsonl');
  const started = Date.now();
  const thread = { id: 'thr_owned', providerId: 'pi-subagents', parentThreadId: 'thr_owner',
    environmentId: 'env_owned', createdAt: started, status: 'idle', archivedAt: null, deletedAt: null };
  const stub = `#!/usr/bin/env node
    const fs = require('node:fs'); const args = process.argv.slice(2);
    fs.appendFileSync(process.env.FAKE_BB_LOG, JSON.stringify(args)+'\\n');
    if (args[0] !== 'thread' || !args.includes('thr_owned')) process.exit(2);
    if (args[1] === 'show') console.log(JSON.stringify({thread:${JSON.stringify(thread)}}));
    else if (args[1] === 'queue' && args[2] === 'list') console.log('[]');
    else if (args[1] === 'stop') console.log('{}');
    else process.exit(2);`;
  await writeFile(join(bin, 'bb'), stub, { mode: 0o700 });
  const plan = { threadId: 'thr_owned', ownerThreadId: 'thr_owner', approvalReference: 'AAAAAAAAAAAAAAAAAAAAAAAAAA',
    caseKind: 'native', phaseStartedAtMs: started, startedAtMs: started, limitMs: 100000,
    stopReserveMs: 30000, phaseDeadlineMs: started + 200000 };
  const planFile = join(root, 'fake-plan.json');
  await writeFile(planFile, JSON.stringify(plan));
  // This is an owned Node fixture, not Pi or a native subagent.
  const dummy = spawn(process.execPath, ['-e', 'setTimeout(()=>{},300)'], { stdio: 'ignore' });
  const dummyClosed = closed(dummy);
  let guard;
  let guardClosed;
  t.after(async () => {
    if (dummy.exitCode === null && dummy.signalCode === null) dummy.kill('SIGTERM');
    await dummyClosed;
    if (guard && guard.exitCode === null && guard.signalCode === null) guard.kill('SIGTERM');
    if (guardClosed) await guardClosed;
    await rm(root, { recursive: true, force: true });
  });
  const start = (await execFile('ps', ['-p', String(dummy.pid), '-o', 'lstart='])).stdout.trim();
  await dummyClosed;
  guard = spawn(process.execPath, [fileURLToPath(new URL('./deadline-guard.mjs', import.meta.url)), '--run', planFile], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_BB_LOG: log }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  guardClosed = closed(guard);
  let output = '';
  let errors = '';
  let sent = false;
  guard.stderr.on('data', chunk => { errors += chunk; });
  guard.stdout.on('data', chunk => {
    output += chunk;
    if (!sent && output.includes('"type":"armed"')) {
      sent = true;
      const scope = { sessionId: 'fake-session', environmentId: 'env_owned', runId: 'fake-run', itemId: 'fake-item', generation: 1 };
      for (const packet of [
        { type: 'bind', threadId: 'thr_owned', scope },
        { type: 'pids', threadId: 'thr_owned', pids: [{ pid: dummy.pid, start }] },
        { type: 'complete', threadId: 'thr_owned', ...scope, nativeSettlement: 'completed', parentResponse: 'completed',
          completionNoticeObserved: true, parentResponseHasOwnedResult: true },
      ]) guard.stdin.write(`${JSON.stringify(packet)}\n`);
    }
  });
  assert.equal(await guardClosed, 0, errors);
  const result = JSON.parse(output.trim().split('\n').at(-1));
  assert.equal(result.passed, true);
  assert.equal(result.knownPidCount, 1);
  assert.ok(result.actionElapsedMs < plan.limitMs);
  const calls = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(calls.filter(args => args[1] === 'stop').length, 1);
  assert.ok(calls.every(args => args.includes('thr_owned')));
  assert.ok(calls.every(args => !args.includes('tell') && !args.includes('send') && !args.includes('spawn')));
});
