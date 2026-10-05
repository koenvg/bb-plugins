import { execFile as execute } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { controlAction } from './action-controller.mjs';

const execFile = promisify(execute);
const id = value => typeof value === 'string' && /^thr_[a-z0-9]{1,64}$/.test(value);

export function validatePlan(p, now = Date.now()) {
  if (!p || !id(p.threadId) || !id(p.ownerThreadId) || p.threadId === p.ownerThreadId ||
      !/^[0-9A-Z]{26}$/.test(p.approvalReference ?? '') ||
      !['native', 'idle-control'].includes(p.caseKind) ||
      !Number.isSafeInteger(p.phaseStartedAtMs) || p.phaseStartedAtMs < 0 || p.phaseStartedAtMs > p.startedAtMs ||
      !Number.isSafeInteger(p.startedAtMs) || p.startedAtMs > now ||
      !Number.isSafeInteger(p.limitMs) || p.limitMs <= 0 || p.limitMs > 2_147_483_647 ||
      !Number.isSafeInteger(p.stopReserveMs) || p.stopReserveMs < 30_000 || p.stopReserveMs >= p.limitMs ||
      !Number.isSafeInteger(p.phaseDeadlineMs) || p.startedAtMs + p.limitMs > p.phaseDeadlineMs ||
      p.startedAtMs + p.limitMs - now <= p.stopReserveMs) {
    throw new Error('Missing fresh bounded plan or owned scope');
  }
  return p.startedAtMs + p.limitMs - now;
}

const textId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export function validBinding(p, scope, environmentId) {
  return Boolean(scope && textId(scope.sessionId) && scope.environmentId === environmentId &&
    (p.caseKind === 'idle-control' || (textId(scope.runId) && textId(scope.itemId) &&
      Number.isSafeInteger(scope.generation) && scope.generation >= 1)));
}

export function acceptsReceipt(p, scope, r) {
  if (!validBinding(p, scope, scope?.environmentId) || r?.threadId !== p.threadId || r.sessionId !== scope.sessionId) return false;
  if (p.caseKind === 'idle-control') {
    return r.log?.msg === 'Reaped idle provider sessions' && Array.isArray(r.log.sessions) &&
      r.log.sessions.some(s => s?.threadId === p.threadId && s.environmentId === scope.environmentId &&
        s.providerId === 'pi-subagents' && Number.isFinite(s.idleForMs) && s.idleForMs >= 1_800_000);
  }
  return r.runId === scope.runId && r.itemId === scope.itemId && r.generation === scope.generation &&
    r.nativeSettlement === 'completed' && r.parentResponse === 'completed' &&
    r.completionNoticeObserved === true && r.parentResponseHasOwnedResult === true;
}

// Input is a trusted controller channel, NEVER a child/model output stream.
// Receipt fields must be backed by separately retained public events/logs.
export async function stopOwnedThread(p, api, signal) {
  let queueFailed = false;
  try {
    const queue = await api(['thread', 'queue', 'list', p.threadId, '--json'], signal);
    if (!Array.isArray(queue)) throw new Error('Unsupported queue shape');
    if (p.queuedMessageId && queue.some(m => m.id === p.queuedMessageId)) {
      await api(['thread', 'queue', 'delete', p.threadId, p.queuedMessageId, '--json'], signal);
    }
  } catch { queueFailed = true; }
  await api(['thread', 'stop', p.threadId, '--json'], signal);
  if (queueFailed) throw new Error('Owned queue cleanup is unproved');
}

export function processesAbsent(pids, rows) {
  if (!pids.size || typeof rows !== 'string') return false;
  const normalize = value => value.trim().replace(/\s+/g, ' ');
  const seen = new Set();
  for (const line of rows.split('\n').filter(value => value.trim())) {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (!match) return false;
    const pid = Number(match[1]);
    if (!pids.has(pid) || seen.has(pid)) return false;
    seen.add(pid);
    if (normalize(match[2]) === normalize(pids.get(pid))) return false;
  }
  return true;
}

async function run(p) {
  validatePlan(p);
  const api = async (args, signal) => JSON.parse((await execFile('bb', args, {
    timeout: 2000, maxBuffer: 1024 * 1024, signal,
  })).stdout);
  const thread = (await api(['thread', 'show', p.threadId, '--json'])).thread;
  if (thread.providerId !== 'pi-subagents' || thread.parentThreadId !== p.ownerThreadId ||
      thread.archivedAt || thread.deletedAt || !Number.isFinite(thread.createdAt) || thread.createdAt < p.phaseStartedAtMs) {
    throw new Error('Thread is not a fresh owned fork fixture');
  }
  const remaining = validatePlan(p);
  let scope;
  const pids = new Map();
  let finish;
  let fail;
  const completion = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on('line', line => {
    try {
      if (Buffer.byteLength(line) > 32_768) throw new Error('Oversized controller message');
      const message = JSON.parse(line);
      if (message.threadId !== p.threadId) throw new Error('Foreign controller message');
      if (message.type === 'bind') {
        if (scope || !validBinding(p, message.scope, thread.environmentId)) throw new Error('Invalid session binding');
        scope = message.scope;
      } else if (message.type === 'pids') {
        if (!Array.isArray(message.pids) || !message.pids.length || message.pids.length > 32) throw new Error('Invalid PID receipt');
        for (const row of message.pids) {
          if (!Number.isSafeInteger(row.pid) || row.pid <= 1 || typeof row.start !== 'string' ||
              !row.start || row.start.length > 100 || (pids.has(row.pid) && pids.get(row.pid) !== row.start)) {
            throw new Error('PID identity changed');
          }
          pids.set(row.pid, row.start);
          if (pids.size > 32) throw new Error('PID receipt bound exceeded');
        }
      } else if (message.type === 'complete') finish(message);
      else throw new Error('Unknown controller message');
    } catch { fail(new Error('Invalid controller input')); }
  });
  input.on('close', () => fail(new Error('Controller input closed before completion')));
  try {
    const resultPromise = controlAction({
      threadId: p.threadId, limitMs: remaining, stopReserveMs: p.stopReserveMs,
      dispatch: async () => {}, completion,
      acceptCompletion: r => acceptsReceipt(p, scope, r),
      stop: ({ signal }) => stopOwnedThread(p, api, signal),
      verifyAbsence: async ({ signal }) => {
        if (!pids.size) return false;
        const state = (await api(['thread', 'show', p.threadId, '--json'], signal)).thread;
        const queue = await api(['thread', 'queue', 'list', p.threadId, '--json'], signal);
        let rows;
        try {
          rows = (await execFile('ps', ['-p', [...pids.keys()].join(','), '-o', 'pid=,lstart='], { timeout: 2000, signal })).stdout;
        } catch (error) {
          if (error.code !== 1 || error.stdout?.trim() || error.stderr?.trim()) throw error;
          rows = '';
        }
        return processesAbsent(pids, rows) && state.status === 'idle' && Array.isArray(queue) && queue.length === 0;
      },
    });
    console.log(JSON.stringify({ type: 'armed', pid: process.pid, threadId: p.threadId,
      stopAtMs: p.startedAtMs + p.limitMs - p.stopReserveMs, deadlineMs: p.startedAtMs + p.limitMs }));
    const result = await resultPromise;
    console.log(JSON.stringify({ type: 'result', threadId: p.threadId, ...result,
      actionElapsedMs: p.limitMs - remaining + result.elapsedMs,
      scopeBound: Boolean(scope), knownPidCount: pids.size }));
    process.exitCode = result.passed ? 0 : 1;
  } finally { input.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--run' && process.argv.length === 4) {
    try { await run(JSON.parse(await readFile(process.argv[3], 'utf8'))); }
    catch { console.error('Deadline guard failed. Retain evidence and perform scoped cleanup.'); process.exitCode = 1; }
  } else {
    console.log('Usage: node deadline-guard.mjs --run approved-action.json');
    console.log('Requires fresh bounded approval. No dispatch, model call or default change. Trusted receipts on stdin.');
    if (process.argv[2] && process.argv[2] !== '--help') process.exitCode = 1;
  }
}
