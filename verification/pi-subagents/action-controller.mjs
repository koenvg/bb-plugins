const systemClock = {
  now: () => performance.now(),
  later: (fn, ms) => setTimeout(fn, ms),
  cancel: id => clearTimeout(id),
};

/**
 * Run in a separate controller process, not in the model's tool-preparation path.
 * Callbacks use the existing owned public dispatch/stop routes. The receipt
 * validator must check canonical session/run/item identity and normal outcomes.
 * Timely cleanup is a controller result, never an installed acceptance claim.
 */
export async function controlAction({ threadId, limitMs, stopReserveMs, dispatch, completion, acceptCompletion, stop, verifyAbsence, clock = systemClock }) {
  if (!/^thr_[a-z0-9]{1,64}$/.test(threadId ?? '') ||
      !Number.isSafeInteger(limitMs) || limitMs <= 0 || limitMs > 2_147_483_647 ||
      !Number.isSafeInteger(stopReserveMs) || stopReserveMs <= 0 || stopReserveMs >= limitMs ||
      [dispatch, acceptCompletion, stop, verifyAbsence].some(fn => typeof fn !== 'function')) {
    throw new Error('Invalid owned scope or action deadline');
  }
  const started = clock.now();
  const dispatchAbort = new AbortController();
  const cleanupAbort = new AbortController();
  let softTimer;
  let hardTimer;
  const cutoff = new Promise(resolve => {
    softTimer = clock.later(() => resolve('deadline-stop'), limitMs - stopReserveMs);
  });
  const hardLimit = new Promise(resolve => {
    hardTimer = clock.later(() => {
      dispatchAbort.abort();
      cleanupAbort.abort();
      resolve({ cleanup: 'deadline-exceeded', timelyCleanup: false });
    }, limitMs);
  });
  const finished = Promise.all([
    Promise.resolve().then(() => dispatch({ threadId, signal: dispatchAbort.signal })),
    completion,
  ]).then(([, receipt]) => acceptCompletion(receipt) === true ? 'normal-completion' : 'failed')
    .catch(() => 'failed');
  try {
    let outcome = await Promise.race([cutoff, finished]);
    // Promise ordering cannot restore time already used from the stop reserve.
    if (clock.now() - started >= limitMs - stopReserveMs) outcome = 'deadline-stop';
    clock.cancel(softTimer);
    dispatchAbort.abort();
    const cleanup = (async () => {
      await stop({ threadId, reason: outcome, signal: cleanupAbort.signal });
      const absent = await verifyAbsence({ threadId, signal: cleanupAbort.signal });
      return {
        cleanup: absent === true ? 'verified' : 'absence-unproved',
        timelyCleanup: absent === true && clock.now() - started <= limitMs,
      };
    })().catch(() => ({ cleanup: 'failed', timelyCleanup: false }));
    const result = await Promise.race([cleanup, hardLimit]);
    return {
      outcome,
      ...result,
      elapsedMs: clock.now() - started,
      passed: outcome === 'normal-completion' && result.timelyCleanup,
    };
  } finally {
    clock.cancel(softTimer);
    clock.cancel(hardTimer);
    dispatchAbort.abort();
    cleanupAbort.abort();
  }
}
