import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptsReceipt, validatePlan, stopOwnedThread, processesAbsent } from './deadline-guard.mjs';

const plan = () => ({ threadId: 'thr_owned', ownerThreadId: 'thr_owner',
  approvalReference: 'AAAAAAAAAAAAAAAAAAAAAAAAAA', caseKind: 'native',
  phaseStartedAtMs: 500, startedAtMs: 1000, limitMs: 100000, stopReserveMs: 30000, phaseDeadlineMs: 200000 });
const scope = { sessionId: 'native-session', environmentId: 'env_owned', runId: 'native-run', itemId: 'native-item', generation: 1 };
const receipt = () => ({ threadId: 'thr_owned', ...scope, nativeSettlement: 'completed', parentResponse: 'completed',
  completionNoticeObserved: true, parentResponseHasOwnedResult: true });

test('normal completion needs a complete canonical binding, not matching undefined IDs', () => {
  const r = receipt();
  delete r.runId; delete r.itemId; delete r.generation;
  assert.equal(acceptsReceipt(plan(), { sessionId: scope.sessionId }, r), false);
});


test('queue inspection failure must not prevent the owned stop attempt', async () => {
  const calls = [];
  await assert.rejects(stopOwnedThread(plan(), async args => {
    calls.push(args);
    if (args.includes('queue')) throw new Error('queue unavailable');
    return {};
  }));
  assert.equal(calls.some(args => args[1] === 'stop' && args[2] === 'thr_owned'), true);
});


test('binding rejects wrong thread, session, run, item and generation', () => {
  assert.equal(acceptsReceipt(plan(), scope, receipt()), true);
  for (const key of ['threadId', 'sessionId', 'runId', 'itemId', 'generation']) {
    const r = receipt(); r[key] = 'foreign';
    assert.equal(acceptsReceipt(plan(), scope, r), false);
  }
  for (const key of ['nativeSettlement', 'parentResponse', 'completionNoticeObserved', 'parentResponseHasOwnedResult']) {
    const r = receipt(); delete r[key];
    assert.equal(acceptsReceipt(plan(), scope, r), false);
  }
});

test('time spent before arming remains part of the action window', () => {
  assert.equal(validatePlan(plan(), 2000), 99000);
  for (const overrides of [{ approvalReference: '' }, { phaseDeadlineMs: 99999 }, { startedAtMs: 3000 },
    { phaseStartedAtMs: 1001 }, { stopReserveMs: 0 }, { threadId: 'thr_owner' }]) {
    assert.throws(() => validatePlan({ ...plan(), ...overrides }, 2000));
  }
  assert.throws(() => validatePlan(plan(), 101000));
});

test('only the named queued message can be deleted before owned stopping', async () => {
  const calls = [];
  await stopOwnedThread({ ...plan(), queuedMessageId: 'msg_owned' }, async args => {
    calls.push(args);
    return args[2] === 'list' ? [{ id: 'msg_owned' }, { id: 'msg_other' }] : {};
  });
  assert.deepEqual(calls.map(args => args.slice(1, 5)), [
    ['queue', 'list', 'thr_owned', '--json'], ['queue', 'delete', 'thr_owned', 'msg_owned'], ['stop', 'thr_owned', '--json']]);
});

test('idle control completion requires its own eligible release receipt', () => {
  const p = { ...plan(), caseKind: 'idle-control' };
  const r = { threadId: p.threadId, sessionId: scope.sessionId,
    log: { msg: 'Reaped idle provider sessions', sessions: [{ threadId: p.threadId,
      environmentId: scope.environmentId, providerId: 'pi-subagents', idleForMs: 1800000 }] } };
  assert.equal(acceptsReceipt(p, scope, r), true);
  r.log.sessions[0].threadId = 'thr_other';
  assert.equal(acceptsReceipt(p, scope, r), false);
});


test('PID absence requires valid output and never treats unknown rows as absence', () => {
  const pids = new Map([[123, 'Mon Oct 5 10:00:00 2026']]);
  assert.equal(processesAbsent(pids, ''), true);
  assert.equal(processesAbsent(pids, '123 Mon Oct 5 10:00:00 2026\n'), false);
  assert.equal(processesAbsent(pids, 'unexpected output'), false);
  assert.equal(processesAbsent(pids, '999 Mon Oct 5 10:00:00 2026\n'), false);
  assert.equal(processesAbsent(new Map(), ''), false);
});

test('a reused PID does not identify the old native process', () => {
  const pids = new Map([[123, 'Mon Oct 5 10:00:00 2026']]);
  assert.equal(processesAbsent(pids, '123 Mon Oct 5 11:00:00 2026\n'), true);
});
