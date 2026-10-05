import { watch as watchFile } from 'node:fs';
import { readdir, open, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const filename = name => /^host-daemon(?:\.\d+)?\.log$/.test(name);
const ownedId = (value, prefix) => new RegExp(`^${prefix}_[a-z0-9]{1,64}$`).test(value ?? '');

/** A positive log receipt, not daemon authentication or approval. Run in a
 * separate controller. Notification names are hints, never ingestion filters. */
export async function openSweepLog({ directory, scope, afterMs, timeoutMs, watch = watchFile }) {
  if (typeof directory !== 'string' || !ownedId(scope?.controlThreadId, 'thr') ||
      !ownedId(scope?.targetThreadId, 'thr') || scope.controlThreadId === scope.targetThreadId ||
      !ownedId(scope?.environmentId, 'env') || !Number.isSafeInteger(afterMs) || afterMs < 0 ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
    throw new Error('INVALID_SWEEP_LOG_PLAN');
  }
  const started = performance.now();
  let resolve, reject, timer, closed = false, scanning = false, dirty = false, readBytes = 0;
  let directorySource;
  const checkDirectory = async () => {
    const source = await lstat(directory);
    if (!source.isDirectory() || source.uid !== process.getuid() ||
        (directorySource && (source.ino !== directorySource.ino || source.dev !== directorySource.dev || source.uid !== directorySource.uid))) {
      throw new Error('INVALID_SWEEP_LOG_SOURCE');
    }
    return source;
  };
  const receipt = new Promise((yes, no) => { resolve = yes; reject = no; });
  receipt.catch(() => {}); // Observe failure while the caller is still arming.
  const handles = new Map();
  const states = new Map();
  const close = () => { closed = true; clearTimeout(timer); for (const h of handles.values()) h.close(); handles.clear(); };
  const fail = code => { if (!closed) { close(); reject(new Error(code)); } };
  const accept = (raw, frame, file, source) => {
    let log;
    try { log = JSON.parse(raw); } catch { throw new Error('INVALID_SWEEP_LOG_LINE'); }
    if (log?.msg !== 'Reaped idle provider sessions' || !Number.isSafeInteger(log.time) || log.time < afterMs) return;
    if (!Array.isArray(log.sessions) || log.sessions.length > 128) throw new Error('INVALID_SWEEP_LOG_LINE');
    if (log.sessions.some(s => s?.threadId === scope.targetThreadId && s.environmentId === scope.environmentId && s.providerId === 'pi-subagents')) {
      throw new Error('SWEEP_TARGET_RELEASED');
    }
    const matches = log.sessions.filter(s => s?.threadId === scope.controlThreadId);
    if (matches.length > 1) throw new Error('INVALID_SWEEP_LOG_LINE');
    const control = matches[0];
    if (!control || control.providerId !== 'pi-subagents' || control.environmentId !== scope.environmentId ||
        !Number.isSafeInteger(log.time) || log.time < afterMs || !Number.isFinite(control.idleForMs) ||
        control.idleForMs < 1_800_000) return;
    if (performance.now() - started >= timeoutMs) { fail('SWEEP_LOG_TIMEOUT'); return; }
    close();
    resolve({ raw, log, source: { path: file, ino: source.ino, uid: source.uid,
      sha256: createHash('sha256').update(frame).digest('hex') } });
  };
  const scan = async () => {
    dirty = true;
    if (scanning || closed) return;
    scanning = true;
    try {
      do {
        dirty = false;
        await checkDirectory();
        const names = (await readdir(directory)).filter(filename);
        if (names.length > 32) throw new Error('SWEEP_LOG_FILE_LIMIT');
        for (const file of states.keys()) {
          if (!names.includes(path.basename(file))) {
            handles.get(file)?.close(); handles.delete(file); states.delete(file);
          }
        }
        for (const name of names) {
          if (closed) break;
          const file = path.join(directory, name);
          const entry = await lstat(file);
          if (!entry.isFile() || entry.uid !== process.getuid()) throw new Error('INVALID_SWEEP_LOG_SOURCE');
          if (closed) break;
          const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
          try {
            let source = await handle.stat();
            await checkDirectory();
            if (closed) break;
            if (!source.isFile() || source.uid !== process.getuid()) throw new Error('INVALID_SWEEP_LOG_SOURCE');
            if (source.size > 64 * 1024 * 1024) throw new Error('SWEEP_LOG_BYTE_LIMIT');
            let state = states.get(file);
            if (state?.ino === source.ino && state.checkpoint?.length && source.size >= state.offset) {
              const bytes = Buffer.alloc(state.checkpoint.length);
              const { bytesRead } = await handle.read(bytes, 0, bytes.length, state.offset - bytes.length);
              readBytes += bytesRead;
              if (readBytes > 16 * 1024 * 1024) throw new Error('SWEEP_LOG_BYTE_LIMIT');
              if (bytesRead !== bytes.length || !bytes.equals(state.checkpoint)) state = undefined;
            }
            if (!state || state.ino !== source.ino || source.size < state.offset) {
              handles.get(file)?.close();
              const h = watch(file, () => void scan());
              h.on('error', () => fail('SWEEP_LOG_WATCH_FAILED'));
              handles.set(file, h);
              source = await handle.stat(); // Drain bytes appended while the file watcher was arming.
              await checkDirectory();
              if (!source.isFile() || source.uid !== process.getuid()) throw new Error('INVALID_SWEEP_LOG_SOURCE');
              if (source.size > 64 * 1024 * 1024) throw new Error('SWEEP_LOG_BYTE_LIMIT');
              const offset = Math.max(0, source.size - 65_536);
              state = { ino: source.ino, offset, pending: Buffer.alloc(0), skipPrefix: offset > 0 };
              states.set(file, state);
            }
            const end = source.size;
            while (state.offset < end && !closed) {
              const chunk = Buffer.alloc(Math.min(65_536, end - state.offset));
              const { bytesRead } = await handle.read(chunk, 0, chunk.length, state.offset);
              if (!bytesRead) break;
              readBytes += bytesRead;
              if (readBytes > 16 * 1024 * 1024) throw new Error('SWEEP_LOG_BYTE_LIMIT');
              state.offset += bytesRead;
              state.checkpoint = Buffer.from(Buffer.concat([state.checkpoint ?? Buffer.alloc(0), chunk.subarray(0, bytesRead)]).subarray(-64));
              let bytes = Buffer.concat([state.pending, chunk.subarray(0, bytesRead)]);
              if (state.skipPrefix) {
                const newline = bytes.indexOf(10);
                if (newline < 0) { state.pending = Buffer.alloc(0); continue; }
                bytes = bytes.subarray(newline + 1); state.skipPrefix = false;
              }
              let from = 0, newline;
              while ((newline = bytes.indexOf(10, from)) >= 0 && !closed) {
                const frame = bytes.subarray(from, newline);
                if (frame.length > 32_768) throw new Error('SWEEP_LOG_LINE_LIMIT');
                let raw;
                try { raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(frame); }
                catch { throw new Error('INVALID_SWEEP_LOG_LINE'); }
                if (raw.trim()) {
                  await checkDirectory();
                  if (!closed) accept(raw, frame, file, source);
                }
                from = newline + 1;
              }
              state.pending = Buffer.from(bytes.subarray(from));
              if (!closed && state.pending.length > 32_768) throw new Error('SWEEP_LOG_LINE_LIMIT');
            }
          } finally { await handle.close(); }
        }
      } while (dirty && !closed);
    } catch (error) {
      const safe = ['INVALID_SWEEP_LOG_LINE', 'SWEEP_TARGET_RELEASED', 'INVALID_SWEEP_LOG_SOURCE', 'SWEEP_LOG_FILE_LIMIT', 'SWEEP_LOG_BYTE_LIMIT', 'SWEEP_LOG_LINE_LIMIT'];
      fail(safe.includes(error.message) ? error.message : 'SWEEP_LOG_READ_FAILED');
    }
    finally { scanning = false; }
  };
  timer = setTimeout(() => fail('SWEEP_LOG_TIMEOUT'), timeoutMs);
  try {
    directorySource = await checkDirectory();
    if (!closed) {
      const h = watch(directory, () => void scan());
      h.on('error', () => fail('SWEEP_LOG_WATCH_FAILED'));
      handles.set(directory, h);
      await scan();
    }
  } catch (error) { fail(error.message === 'INVALID_SWEEP_LOG_SOURCE' ? error.message : 'SWEEP_LOG_WATCH_FAILED'); }
  return { receipt, close: () => fail('SWEEP_LOG_CLOSED') };
}
