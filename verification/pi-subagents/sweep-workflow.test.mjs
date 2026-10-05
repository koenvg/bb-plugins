import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSweepTiming } from './sweep-workflow.mjs';

const timing = () => ({ phaseDeadlineMs: 5_500_000,
  targetStartMs: 1_000_000, targetLimitMs: 2_700_000, targetReserveMs: 30_000, childExpiryMs: 3_520_000,
  controlStartMs: 1_050_000, controlIdleByMs: 1_060_000, controlLimitMs: 2_400_000, controlReserveMs: 30_000,
  signalLimitMs: 120_000, signalReserveMs: 30_000,
  proofBudgetMs: 6000, armBudgetMs: 5000, completionBudgetMs: 60_000 });

test('timing reserves a full idle threshold, sweep delay, proof, signal arm and completion', () => {
  assert.deepEqual(validateSweepTiming(timing()), { latestSweepMs: 3_160_000, signalWriteByMs: 3_171_000,
    completionByMs: 3_231_000, targetCutoffMs: 3_670_000, controlCutoffMs: 3_420_000 });
});

test('the recorded late control plan is rejected without extending target expiry', () => {
  const plan = timing();
  plan.targetStartMs = 1791202866712;
  plan.childExpiryMs = 1791205386712;
  plan.controlStartMs = 1791203481103;
  plan.controlIdleByMs = 1791203489317;
  plan.phaseDeadlineMs = 1791206989432;
  assert.throws(() => validateSweepTiming(plan), /INFEASIBLE_SWEEP_WINDOW/);
});


function ownedScope() {
  return { ownerThreadId: 'thr_owner', targetThreadId: 'thr_target', controlThreadId: 'thr_control', environmentId: 'env_owned',
    sessionId: 'session-owned', providerSessionId: 'pi_owned', runId: 'run-owned', itemId: 'item-owned', generation: 1,
    controlSessionId: 'control-session', targetIdleObservedAtMs: 1_040_000, controlDispatchAtMs: 1_050_000, controlIdleAtMs: 1_060_000,
    parent: { pid: 701, start: 'original-parent' }, child: { pid: 702, start: 'original-child' },
    ownedPids: [{ pid: 701, start: 'original-parent' }, { pid: 702, start: 'original-child' }],
    daemonIdentity: 'original-daemon', expectedResult: 'OWNED_SIGNAL_COMPLETED' };
}

function proof(scope) {
  return { atMs: 3_200_000, coverageComplete: true,
    events: [
      { seq: 1, threadId: scope.targetThreadId, createdAt: 1_030_000, type: 'turn/completed' },
      { seq: 2, threadId: scope.targetThreadId, createdAt: 3_190_000, type: 'item/backgroundTask/progress',
        data: { providerThreadId: scope.providerSessionId, item: { id: scope.itemId, status: 'pending', familyId: 'pi-subagents', taskType: 'local_subagent' } } },
      { seq: 3, threadId: scope.targetThreadId, createdAt: 3_190_001, type: 'thread/extensionState/updated',
        data: { providerThreadId: scope.providerSessionId, kind: 'pi-subagents-provider/pi-subagents-view',
          payload: { availability: 'available', rows: [{ runId: scope.runId, sessionId: scope.sessionId, generation: scope.generation,
            source: 'background', kind: 'subagent', state: 'running' }] } } },
    ], processes: [
      { pid: 701, start: 'original-parent', ppid: 100, args: 'pi' },
      { pid: 702, start: 'original-child', ppid: 701, args: 'node async-cfg-run-owned.json' },
    ] };
}

async function setup() {
  const { createSweepCoordinator } = await import('./sweep-workflow.mjs');
  const { createHash } = await import('node:crypto');
  const scope = ownedScope();
  const log = { msg: 'Reaped idle provider sessions', time: 3_160_000,
    sessions: [{ threadId: scope.controlThreadId, environmentId: scope.environmentId, providerId: 'pi-subagents', idleForMs: 1_887_056 }] };
  const raw = JSON.stringify(log);
  const release = { log, raw, source: { sha256: createHash('sha256').update(raw).digest('hex') } };
  const effects = { signals: [], controlReceipts: [], stops: 0, archives: [], armed: false };
  let deliver;
  const delivered = new Promise(resolve => { deliver = resolve; });
  const complete = { type: 'complete', threadId: scope.targetThreadId, sessionId: scope.sessionId,
    runId: scope.runId, itemId: scope.itemId, generation: 1, nativeSettlement: 'completed', parentResponse: 'completed',
    completionNoticeObserved: true, parentResponseHasOwnedResult: true, detailPersisted: true, ownedResult: scope.expectedResult };
  const ports = {
    authenticateRelease: async () => scope.daemonIdentity,
    readTarget: async () => proof(scope),
    completeControl: async receipt => effects.controlReceipts.push(receipt),
    armSignal: async plan => { effects.armed = true; return { type: 'armed', threadId: scope.targetThreadId,
      pid: 800, start: 'independent-guard', stopAtMs: plan.stopAtMs, deadlineMs: plan.deadlineMs }; },
    writeSignal: async (_scope, signal, window) => {
      if (signal.aborted || window.nowMs() >= window.deadlineMs) throw new Error('SWEEP_SIGNAL_TOO_LATE');
      assert.equal(effects.armed, true); effects.signals.push('owned fixture signal'); deliver(complete);
    },
    waitForCompletion: () => delivered,
    cleanup: async () => { effects.stops++; },
    readClosed: async () => ({ thread: { id: scope.targetThreadId, providerId: 'pi-subagents', parentThreadId: scope.ownerThreadId,
      status: 'idle', archivedAt: null, deletedAt: null, createdAt: 1_000_000 }, queue: [], pidRows: '', guardPidRows: '' }),
    archive: async threadId => effects.archives.push(threadId),
  };
  const coordinator = (options = {}) => createSweepCoordinator({ timing: timing(), scope, ports, nowMs: 3_200_000, ...options });
  return { scope, release, effects, ports, coordinator, complete };
}

test('a simulated authenticated sweep arms before one signal and stops the target only once', async () => {
  const f = await setup();
  const controller = f.coordinator();
  const result = await controller.run(f.release);
  assert.equal(result.passed, true);
  assert.deepEqual(f.effects.signals, ['owned fixture signal']);
  assert.equal(f.effects.stops, 1);
  assert.equal(f.effects.controlReceipts[0].threadId, 'thr_control');
  assert.equal(await controller.run(f.release), result);
  assert.equal(f.effects.stops, 1);
});


function stoppedClock() {
  let now = 0, next = 0;
  const timers = new Map();
  return { now: () => now, later: (fn, ms) => { const id = ++next; timers.set(id, { fn, at: now + ms }); return id; },
    cancel: id => timers.delete(id), jump: ms => { now += ms; },
    advance: ms => { now += ms; for (const [id, t] of timers) if (t.at <= now) { timers.delete(id); t.fn(); } } };
}

test('late proof fails even if a timer callback is delayed, without writing a signal', async () => {
  const f = await setup(), clock = stoppedClock();
  f.ports.readTarget = async () => { clock.jump(6001); return proof(f.scope); };
  const result = await f.coordinator({ clock }).run(f.release);
  assert.equal(result.passed, false);
  assert.equal(result.failure, 'SWEEP_PROOF_TIMEOUT');
  assert.deepEqual(f.effects.signals, []);
  assert.equal(f.effects.stops, 1);
});

test('adapter errors cannot publish private raw text in the failure category', async () => {
  const f = await setup();
  f.ports.authenticateRelease = async () => { throw new Error('PRIVATE token and local path'); };
  const result = await f.coordinator().run(f.release);
  assert.equal(result.failure, 'SWEEP_ADAPTER_FAILED');
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});


for (const field of ['proofBudgetMs', 'armBudgetMs', 'completionBudgetMs']) {
  test(`a zero ${field} does not waive a required operation budget`, () => {
    assert.throws(() => validateSweepTiming({ ...timing(), [field]: 0 }), /INVALID_SWEEP_TIMING/);
  });
}

test('whole-queue empty and PID absence are recorded before archiving a fresh owned fixture', async () => {
  const f = await setup(), controller = f.coordinator();
  await controller.run(f.release);
  const audit = await controller.archive();
  assert.deepEqual(audit.queue, []);
  assert.equal(audit.thread.id, 'thr_target');
  assert.deepEqual(f.effects.archives, ['thr_target']);
  await controller.archive();
  assert.deepEqual(f.effects.archives, ['thr_target']);
});

test('a new queued message after cleanup prevents archive, even though cleanup had passed', async () => {
  const f = await setup(), controller = f.coordinator();
  await controller.run(f.release);
  f.ports.readClosed = async () => ({ thread: { id: 'thr_target', providerId: 'pi-subagents', parentThreadId: 'thr_owner',
    status: 'idle', archivedAt: null, deletedAt: null, createdAt: 1_000_000 }, queue: [{ id: 'unowned-message' }], pidRows: '' });
  await assert.rejects(controller.archive(), /PRE_ARCHIVE_ABSENCE_UNPROVED/);
  assert.deepEqual(f.effects.archives, []);
});


for (const defect of ['gap', 'changed-parent', 'changed-child', 'foreign-item', 'stale-generation', 'local-step-only', 'extra-turn', 'unavailable-view']) {
  test(`a ${defect} cannot write the owned signal`, async () => {
    const f = await setup();
    f.ports.readTarget = async () => {
      const s = proof(f.scope);
      if (defect === 'gap') s.events[1].seq = 9;
      if (defect === 'changed-parent') s.processes[0].start = 'replacement';
      if (defect === 'changed-child') s.processes[1].args = 'foreign native run';
      if (defect === 'foreign-item') s.events[1].data.item.id = 'foreign-item';
      if (defect === 'stale-generation') s.events[2].data.payload.rows[0].generation = 2;
      if (defect === 'local-step-only') s.events[2].data.payload.rows[0].parentId = 'some-root';
      if (defect === 'extra-turn') s.events[0].type = 'turn/started', s.events[0].createdAt = 1_050_001;
      if (defect === 'unavailable-view') s.events[2].data.payload.availability = 'unavailable';
      return s;
    };
    const result = await f.coordinator().run(f.release);
    assert.equal(result.passed, false);
    assert.deepEqual(f.effects.signals, []);
    assert.equal(f.effects.stops, 1);
  });
}

test('an intended-result mismatch cannot turn a tool expiry into native success', async () => {
  const f = await setup();
  f.complete.ownedResult = 'real expiry error';
  const result = await f.coordinator().run(f.release);
  assert.equal(result.passed, false);
});

test('a stalled signal guard is bounded by its own arm budget', async () => {
  const f = await setup(), clock = stoppedClock();
  let ready;
  const entered = new Promise(resolve => { ready = resolve; });
  f.ports.armSignal = () => { ready(); return new Promise(() => {}); };
  const action = f.coordinator({ clock }).run(f.release);
  await entered;
  clock.advance(5000);
  const result = await action;
  assert.equal(result.passed, false);
  assert.equal(result.failure, 'SIGNAL_ARM_TIMEOUT');
  assert.deepEqual(f.effects.signals, []);
});

test('incomplete source coverage cannot be replaced by a contiguous prefix', async () => {
  const f = await setup();
  f.ports.readTarget = async () => ({ ...proof(f.scope), coverageComplete: false });
  assert.equal((await f.coordinator().run(f.release)).passed, false);
  assert.deepEqual(f.effects.signals, []);
});

test('child expiry must leave the full normal-completion budget before target cutoff', () => {
  assert.throws(() => validateSweepTiming({ ...timing(), childExpiryMs: 3_660_000 }), /INFEASIBLE_SWEEP_WINDOW/);
});


test('a normal-looking result received before a signal cannot be treated as intended work', async () => {
  const f = await setup();
  f.ports.waitForCompletion = async () => f.complete;
  const result = await f.coordinator().run(f.release);
  assert.equal(result.passed, false);
  assert.deepEqual(f.effects.signals, []);
});


test('temporary log append reaches the coordinator and writes only the new owned fixture file', async t => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const { openSweepLog } = await import('./sweep-log.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bbp135-pipeline-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'host-daemon.13.log');
  const signalFile = path.join(directory, 'owned.signal');
  fs.writeFileSync(file, '');
  const f = await setup();
  const oldWrite = f.ports.writeSignal;
  f.ports.writeSignal = async (scope, signal, window) => {
    if (signal.aborted || window.nowMs() >= window.deadlineMs) throw new Error('SWEEP_SIGNAL_TOO_LATE');
    fs.writeFileSync(signalFile, 'owned-signal-nonce', { flag: 'wx' });
    return oldWrite(scope, signal, window);
  };
  const observer = await openSweepLog({ directory, scope: f.scope, afterMs: 0, timeoutMs: 2000 });
  t.after(observer.close);
  const controller = f.coordinator();
  const action = observer.receipt.then(controller.run);
  fs.appendFileSync(file, f.release.raw + '\n');
  assert.equal((await action).passed, true);
  assert.equal(fs.readFileSync(signalFile, 'utf8'), 'owned-signal-nonce');
  const audit = await controller.archive();
  assert.deepEqual(audit.queue, []);
  assert.deepEqual(f.effects.archives, ['thr_target']);
});


test('a still-running owned signal guard cannot pass cleanup or permit archive', async () => {
  const f = await setup();
  const old = f.ports.readClosed;
  f.ports.readClosed = async () => ({ ...await old(), guardPidRows: '800 independent-guard' });
  const controller = f.coordinator();
  assert.equal((await controller.run(f.release)).passed, false);
  await assert.rejects(controller.archive(), /PRE_ARCHIVE_ABSENCE_UNPROVED/);
  assert.deepEqual(f.effects.archives, []);
});


for (const reply of [undefined, null, false, {}, { type: 'armed', pid: 800 }]) {
  test(`an invalid arm reply ${JSON.stringify(reply)} leaves guard absence unproved through archive`, async () => {
    const f = await setup();
    f.ports.armSignal = async () => reply;
    const old = f.ports.readClosed;
    f.ports.readClosed = async () => { const snapshot = await old(); delete snapshot.guardPidRows; return snapshot; };
    const controller = f.coordinator();
    const result = await controller.run(f.release);
    assert.equal(result.failure, 'SIGNAL_GUARD_UNPROVED');
    assert.equal(result.cleanup, 'absence-unproved');
    await assert.rejects(controller.archive(), /PRE_ARCHIVE_ABSENCE_UNPROVED/);
    assert.deepEqual(f.effects.archives, []);
  });
}


test('an asynchronous write cannot create its signal after child expiry', async () => {
  const f = await setup(), clock = stoppedClock(), write = f.ports.writeSignal;
  let deadline;
  f.ports.writeSignal = async (scope, signal, window) => {
    deadline = window?.deadlineMs;
    clock.jump(2); // Complete asynchronous preparation without firing timer callbacks.
    if (signal.aborted || (window && window.nowMs() >= window.deadlineMs)) throw new Error('SWEEP_SIGNAL_TOO_LATE');
    return write(scope, signal, window);
  };
  const result = await f.coordinator({ clock, nowMs: 3_519_999 }).run(f.release);
  assert.equal(result.passed, false);
  assert.equal(result.failure, 'SWEEP_SIGNAL_TOO_LATE');
  assert.equal(deadline, 3_520_000);
  assert.deepEqual(f.effects.signals, []);
});


test('signal creation also honours an action cutoff earlier than child expiry', async () => {
  const f = await setup(), clock = stoppedClock(), write = f.ports.writeSignal;
  let deadline;
  f.ports.writeSignal = async (scope, signal, window) => {
    deadline = window.deadlineMs;
    clock.jump(90_000);
    return write(scope, signal, window);
  };
  const result = await f.coordinator({ clock }).run(f.release);
  assert.equal(result.passed, false);
  assert.equal(deadline, 3_290_000);
  assert.deepEqual(f.effects.signals, []);
});

test('a stalled write is cancelled at child expiry instead of the longer action deadline', async () => {
  const f = await setup(), clock = stoppedClock();
  let ready, writing;
  const entered = new Promise(resolve => { ready = resolve; });
  f.ports.writeSignal = (_scope, signal) => { writing = signal; ready(); return new Promise(() => {}); };
  const action = f.coordinator({ clock, nowMs: 3_519_999 }).run(f.release);
  await entered;
  clock.advance(1);
  const result = await action;
  assert.equal(writing.aborted, true);
  assert.equal(result.failure, 'SWEEP_SIGNAL_TOO_LATE');
  assert.equal(result.passed, false);
  assert.deepEqual(f.effects.signals, []);
});
