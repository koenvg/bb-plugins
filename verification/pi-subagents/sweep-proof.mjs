import { createHash } from 'node:crypto';
import { assessSweepWitness } from './sweep-witness.mjs';

/** Derive proof from raw public events and correlated process rows. These are
 * trusted coordinator inputs, not authenticated by this data-only function. */
export function proveSweepTarget(scope, receipt, snapshot) {
  const no = reason => ({ proved: false, reason });
  if (typeof receipt?.raw !== 'string' || Buffer.byteLength(receipt.raw) > 32_768 ||
      createHash('sha256').update(receipt.raw).digest('hex') !== receipt.source?.sha256) return no('Original log bytes missing');
  try { if (JSON.stringify(JSON.parse(receipt.raw)) !== JSON.stringify(receipt.log)) return no('Log bytes changed'); }
  catch { return no('Invalid log bytes'); }
  const events = snapshot?.events, processes = snapshot?.processes;
  if (snapshot?.coverageComplete !== true || !Array.isArray(events) || !events.length || events.length > 10_000 ||
      !Array.isArray(processes) || processes.length > 32 ||
      !events.every((e, i) => e.seq === i + 1 && e.threadId === scope.targetThreadId && Number.isFinite(e.createdAt)) ||
      new Set(processes.map(p => p.pid)).size !== processes.length) return no('Incomplete public coverage');
  const item = events.findLast(e => ['item/started', 'item/backgroundTask/progress', 'item/backgroundTask/completed', 'item/completed'].includes(e.type) &&
    e.data?.item?.id === scope.itemId && e.data.providerThreadId === scope.providerSessionId);
  const view = events.findLast(e => e.type === 'thread/extensionState/updated' &&
    e.data?.kind === 'pi-subagents-provider/pi-subagents-view' && e.data.providerThreadId === scope.providerSessionId);
  const roots = view?.data.payload?.rows?.filter(r => !r.parentId && r.runId === scope.runId &&
    r.sessionId === scope.sessionId && r.generation === scope.generation && r.source === 'background' &&
    ['subagent', 'workflow'].includes(r.kind) && ['queued', 'running'].includes(r.state));
  const same = identity => processes.some(p => p.pid === identity.pid && p.start === identity.start);
  const child = processes.find(p => p.pid === scope.child.pid);
  return assessSweepWitness({ log: receipt.log, targetThreadId: scope.targetThreadId, controlThreadId: scope.controlThreadId,
    environmentId: scope.environmentId, targetIdleObservedAtMs: scope.targetIdleObservedAtMs,
    controlDispatchAtMs: scope.controlDispatchAtMs, controlIdleAtMs: scope.controlIdleAtMs,
    targetTurnCoverageComplete: true,
    targetHadForegroundAfterControlDispatch: events.some(e => e.type === 'turn/started' && e.createdAt >= scope.controlDispatchAtMs),
    targetObservation: { atMs: snapshot.atMs, parentIdentityUnchanged: same(scope.parent),
      childIdentityUnchanged: same(scope.child) && child.ppid === scope.parent.pid &&
        typeof child.args === 'string' && child.args.includes(`async-cfg-${scope.runId}.json`),
      samePendingNativeItem: item?.createdAt >= receipt.log.time && item.data.item.status === 'pending' &&
        item.data.item.familyId === 'pi-subagents' && item.data.item.taskType === 'local_subagent' &&
        view?.data.payload.availability === 'available' && roots?.length === 1 } });
}
