import { controlAction } from './action-controller.mjs';
import { acceptsReceipt, processesAbsent } from './deadline-guard.mjs';
import { proveSweepTarget } from './sweep-proof.mjs';

const clockDefault = { now: () => performance.now(), later: (f, ms) => setTimeout(f, ms), cancel: clearTimeout };
/** Planning only. Worst-case cadence is a budget, never a sweep witness. This
 * function neither authenticates approval nor dispatches fixture work. */
export function validateSweepTiming(p) {
  const fields = ['phaseDeadlineMs', 'targetStartMs', 'targetLimitMs', 'targetReserveMs', 'childExpiryMs',
    'controlStartMs', 'controlIdleByMs', 'controlLimitMs', 'controlReserveMs', 'signalLimitMs', 'signalReserveMs',
    'proofBudgetMs', 'armBudgetMs', 'completionBudgetMs'];
  if (!p || fields.some(k => !Number.isSafeInteger(p[k]) || p[k] < 0) ||
      [p.targetLimitMs, p.controlLimitMs, p.signalLimitMs, p.proofBudgetMs, p.armBudgetMs, p.completionBudgetMs].some(n => n < 1 || n > 2_147_483_647) ||
      [p.targetReserveMs, p.controlReserveMs, p.signalReserveMs].some(n => n < 30_000) ||
      p.targetReserveMs >= p.targetLimitMs || p.controlReserveMs >= p.controlLimitMs || p.signalReserveMs >= p.signalLimitMs ||
      p.controlStartMs < p.targetStartMs || p.controlIdleByMs < p.controlStartMs ||
      p.targetStartMs + p.targetLimitMs > p.phaseDeadlineMs || p.controlStartMs + p.controlLimitMs > p.phaseDeadlineMs) {
    throw new Error('INVALID_SWEEP_TIMING');
  }
  const latestSweepMs = p.controlIdleByMs + 1_800_000 + 300_000;
  const signalWriteByMs = latestSweepMs + p.proofBudgetMs + p.armBudgetMs;
  const completionByMs = signalWriteByMs + p.completionBudgetMs;
  const targetCutoffMs = p.targetStartMs + p.targetLimitMs - p.targetReserveMs;
  const controlCutoffMs = p.controlStartMs + p.controlLimitMs - p.controlReserveMs;
  if (signalWriteByMs >= p.childExpiryMs || p.childExpiryMs + p.completionBudgetMs >= targetCutoffMs || completionByMs >= targetCutoffMs ||
      latestSweepMs + p.proofBudgetMs >= controlCutoffMs ||
      p.proofBudgetMs + p.armBudgetMs + p.completionBudgetMs >= p.signalLimitMs - p.signalReserveMs) {
    throw new Error('INFEASIBLE_SWEEP_WINDOW');
  }
  return { latestSweepMs, signalWriteByMs, completionByMs, targetCutoffMs, controlCutoffMs };
}


function validateScope(s) {
  const id = (v, prefix) => new RegExp(`^${prefix}_[a-z0-9]{1,64}$`).test(v ?? '');
  const text = v => typeof v === 'string' && v.length > 0 && v.length <= 128;
  const pid = p => Number.isSafeInteger(p?.pid) && p.pid > 1 && text(p.start);
  if (!id(s?.ownerThreadId, 'thr') || !id(s.targetThreadId, 'thr') || !id(s.controlThreadId, 'thr') ||
      new Set([s.ownerThreadId, s.targetThreadId, s.controlThreadId]).size !== 3 || !id(s.environmentId, 'env') ||
      ![s.sessionId, s.providerSessionId, s.runId, s.itemId, s.controlSessionId, s.daemonIdentity, s.expectedResult].every(text) ||
      !Number.isSafeInteger(s.generation) || s.generation < 1 || !pid(s.parent) || !pid(s.child) || s.parent.pid === s.child.pid ||
      !Array.isArray(s.ownedPids) || s.ownedPids.length < 2 || s.ownedPids.length > 32 || !s.ownedPids.every(pid) ||
      new Set(s.ownedPids.map(p => p.pid)).size !== s.ownedPids.length ||
      ![s.parent, s.child].every(p => s.ownedPids.some(owned => owned.pid === p.pid && owned.start === p.start))) {
    throw new Error('INVALID_OWNED_SWEEP_SCOPE');
  }
}

function isClosed(s, observation, guard) {
  return observation?.thread?.id === s.targetThreadId && observation.thread.parentThreadId === s.ownerThreadId &&
    observation.thread.providerId === 'pi-subagents' && observation.thread.status === 'idle' && !observation.thread.deletedAt &&
    Array.isArray(observation.queue) && observation.queue.length === 0 &&
    processesAbsent(new Map(s.ownedPids.map(p => [p.pid, p.start])), observation.pidRows) &&
    (guard.state === 'not-started' ||
      (guard.state === 'bound' && processesAbsent(new Map([[guard.pid, guard.start]]), observation.guardPidRows)));
}

async function within(ms, code, work, parent, clock) {
  const started = clock.now(), abort = new AbortController();
  let reject, timer;
  const expired = new Promise((_, no) => { reject = no; timer = clock.later(() => { abort.abort(); no(new Error(code)); }, ms); });
  const cancelled = () => { abort.abort(); reject(new Error('SWEEP_SIGNAL_CANCELLED')); };
  parent.addEventListener('abort', cancelled, { once: true });
  try {
    const value = await Promise.race([expired, Promise.resolve().then(() => {
      if (parent.aborted) throw new Error('SWEEP_SIGNAL_CANCELLED');
      return work(abort.signal);
    })]);
    if (clock.now() - started >= ms) throw new Error(code);
    return value;
  } finally { clock.cancel(timer); parent.removeEventListener('abort', cancelled); abort.abort(); }
}

/** One coordinator per owned signal action, in an independent Node process.
 * Ports are trusted public-command adapters, never child/model input. cleanup
 * has ONE owner: reuse the target guard, do not add another direct thread stop. */
export function createSweepCoordinator({ timing, scope, ports, clock = clockDefault, nowMs = Date.now() }) {
  timing = structuredClone(timing); scope = structuredClone(scope);
  const planned = validateSweepTiming(timing);
  validateScope(scope);
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 ||
      ['authenticateRelease', 'readTarget', 'completeControl', 'armSignal', 'writeSignal', 'waitForCompletion', 'cleanup', 'readClosed'].some(k => typeof ports?.[k] !== 'function')) {
    throw new Error('INVALID_SWEEP_ADAPTER');
  }
  const anchor = clock.now();
  const epoch = () => nowMs + clock.now() - anchor;
  let promise, fingerprint;
  let guard = { state: 'not-started' };
  const run = release => {
    if (promise) {
      if (fingerprint !== release?.source?.sha256) return Promise.reject(new Error('FOREIGN_SWEEP_REPLAY'));
      return promise;
    }
    fingerprint = release?.source?.sha256;
    const actionStartedAtMs = Math.floor(epoch());
    const limitMs = Math.min(timing.signalLimitMs, timing.targetStartMs + timing.targetLimitMs - actionStartedAtMs, timing.phaseDeadlineMs - actionStartedAtMs);
    const reserve = Math.max(timing.signalReserveMs, timing.targetReserveMs);
    if (limitMs <= reserve || actionStartedAtMs >= planned.targetCutoffMs) return Promise.reject(new Error('SWEEP_SIGNAL_TOO_LATE'));
    const stopAtMs = actionStartedAtMs + limitMs - reserve, deadlineMs = actionStartedAtMs + limitMs;
    let closed, proof, failure, normal, signalAttempted = false;
    const completionAbort = new AbortController();
    const completion = Promise.resolve().then(() => ports.waitForCompletion(scope, completionAbort.signal)).then(r => {
      if (!signalAttempted || !acceptsReceipt({ caseKind: 'native', threadId: scope.targetThreadId }, scope, r) ||
          r.ownedResult !== scope.expectedResult || r.detailPersisted !== true) throw new Error('NORMAL_OWNED_COMPLETION_MISSING');
      normal = r; return r;
    });
    promise = controlAction({ threadId: scope.targetThreadId, limitMs, stopReserveMs: reserve, clock, completion,
      dispatch: async ({ signal }) => {
        try {
          await within(timing.proofBudgetMs, 'SWEEP_PROOF_TIMEOUT', async proofSignal => {
            if (await ports.authenticateRelease(release, proofSignal) !== scope.daemonIdentity) throw new Error('DAEMON_AUTHENTICATION_FAILED');
            const snapshot = await ports.readTarget(scope, proofSignal);
            proof = proveSweepTarget(scope, release, snapshot);
            if (!proof.proved || snapshot.atMs > epoch()) throw new Error('SWEEP_TARGET_UNPROVED');
            await ports.completeControl({ type: 'complete', threadId: scope.controlThreadId, sessionId: scope.controlSessionId, log: release.log }, proofSignal);
          }, signal, clock);
          await within(timing.armBudgetMs, 'SIGNAL_ARM_TIMEOUT', async armSignal => {
            guard = { state: 'arming' };
            const armed = await ports.armSignal({ threadId: scope.targetThreadId, startedAtMs: actionStartedAtMs, stopAtMs, deadlineMs }, armSignal);
            if (armed?.type !== 'armed' || armed.threadId !== scope.targetThreadId || !Number.isSafeInteger(armed.pid) || armed.pid <= 1 ||
                typeof armed.start !== 'string' || !armed.start || armed.stopAtMs !== stopAtMs || armed.deadlineMs !== deadlineMs) throw new Error('SIGNAL_GUARD_UNPROVED');
            guard = { state: 'bound', pid: armed.pid, start: armed.start };
          }, signal, clock);
          if (signal.aborted || epoch() >= stopAtMs || epoch() >= timing.childExpiryMs) throw new Error('SWEEP_SIGNAL_TOO_LATE');
          const writeDeadlineMs = Math.min(stopAtMs, timing.childExpiryMs);
          await within(writeDeadlineMs - epoch(), 'SWEEP_SIGNAL_TOO_LATE', async writeSignal => {
            signalAttempted = true;
            await ports.writeSignal(scope, writeSignal, { deadlineMs: writeDeadlineMs, nowMs: epoch });
          }, signal, clock);
        } catch (error) {
          const safe = ['DAEMON_AUTHENTICATION_FAILED', 'SWEEP_TARGET_UNPROVED', 'SIGNAL_GUARD_UNPROVED', 'SWEEP_SIGNAL_TOO_LATE', 'SWEEP_PROOF_TIMEOUT', 'SIGNAL_ARM_TIMEOUT', 'SWEEP_SIGNAL_CANCELLED'];
          failure = safe.includes(error?.message) ? error.message : 'SWEEP_ADAPTER_FAILED';
          throw new Error(failure);
        }
      },
      acceptCompletion: () => true,
      stop: async ({ reason, signal }) => ports.cleanup({ scope, reason, normal, signal }),
      verifyAbsence: async ({ signal }) => { closed = await ports.readClosed(scope, signal); return isClosed(scope, closed, guard); },
    }).then(result => ({ ...result, actionStartedAtMs, stopAtMs, deadlineMs, proof, failure, preArchiveObservation: closed })).finally(() => completionAbort.abort());
    return promise;
  };
  let archivePromise;
  const archive = () => {
    if (archivePromise) return archivePromise;
    archivePromise = (async () => {
      if (!promise) throw new Error('PRE_ARCHIVE_ABSENCE_UNPROVED');
      const result = await promise;
      if (result.cleanup !== 'verified' || !result.timelyCleanup) throw new Error('PRE_ARCHIVE_ABSENCE_UNPROVED');
      const remaining = Math.floor(result.deadlineMs - epoch());
      if (remaining <= 0) throw new Error('PRE_ARCHIVE_TOO_LATE');
      return within(remaining, 'PRE_ARCHIVE_TOO_LATE', async signal => {
        const observation = await ports.readClosed(scope, signal);
        if (!isClosed(scope, observation, guard) || observation.thread.archivedAt ||
            !Number.isSafeInteger(observation.thread.createdAt) || observation.thread.createdAt < timing.targetStartMs) {
          throw new Error('PRE_ARCHIVE_ABSENCE_UNPROVED');
        }
        const audit = { ...structuredClone(observation), observedAtMs: epoch() };
        if (signal.aborted || epoch() >= result.deadlineMs) throw new Error('PRE_ARCHIVE_TOO_LATE');
        await ports.archive(scope.targetThreadId, signal);
        return audit;
      }, new AbortController().signal, clock);
    })();
    return archivePromise;
  };
  return { run, archive };
}
