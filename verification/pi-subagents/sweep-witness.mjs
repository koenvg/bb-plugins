/** Data-only assessment for BB0.44.0's positive-release log. Authenticate and
 * retain the original daemon log and complete public-event coverage separately.
 * Never derive a sweep invocation from elapsed time or predicted cadence. */
export function assessSweepWitness(w) {
  const no = reason => ({ proved: false, reason });
  if (!w || w.log?.msg !== 'Reaped idle provider sessions' || !Array.isArray(w.log.sessions)) {
    return no('No actual release receipt');
  }
  if (!/^thr_[a-z0-9]+$/.test(w.targetThreadId ?? '') ||
      !/^thr_[a-z0-9]+$/.test(w.controlThreadId ?? '') ||
      w.targetThreadId === w.controlThreadId || !/^env_[a-z0-9]+$/.test(w.environmentId ?? '')) {
    return no('Invalid owned scope');
  }
  const control = w.log.sessions.find(s => s?.threadId === w.controlThreadId);
  if (!control || control.environmentId !== w.environmentId || control.providerId !== 'pi-subagents' ||
      !Number.isFinite(control.idleForMs) || control.idleForMs < 1_800_000 ||
      w.log.sessions.some(s => s?.threadId === w.targetThreadId)) {
    return no('No eligible control release or target was released');
  }
  const observation = w.targetObservation;
  const times = [w.targetIdleObservedAtMs, w.controlDispatchAtMs, w.controlIdleAtMs, w.log.time, observation?.atMs];
  if (times.some(t => !Number.isFinite(t) || t < 0) ||
      !(times[0] < times[1] && times[1] <= times[2] && times[2] < times[3] && times[3] <= times[4])) {
    return no('Missing causal order or post-sweep observation');
  }
  // Control starts after target idle. If target never re-enters foreground,
  // control's daemon-measured eligible idle proves target eligibility too.
  // Do not treat server event time as the private host idle-since clock.
  if (w.targetTurnCoverageComplete !== true || w.targetHadForegroundAfterControlDispatch !== false ||
      observation.parentIdentityUnchanged !== true || observation.childIdentityUnchanged !== true ||
      observation.samePendingNativeItem !== true) {
    return no('Incomplete coverage or protected execution changed');
  }
  return { proved: true, reason: 'Eligible owned control released while unchanged target remained pending' };
}
