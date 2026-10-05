import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { openSweepLog } from './sweep-log.mjs';

const release = () => ({ msg: 'Reaped idle provider sessions', time: Date.now(), count: 1,
  sessions: [{ threadId: 'thr_control', environmentId: 'env_owned', providerId: 'pi-subagents', idleForMs: 1_887_056 }] });
const scope = { controlThreadId: 'thr_control', targetThreadId: 'thr_target', environmentId: 'env_owned' };

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bbp135-log-'));
  const file = path.join(directory, 'host-daemon.13.log');
  fs.writeFileSync(file, '');
  const callbacks = new Map();
  const watch = (name, callback) => {
    callbacks.set(name, callback);
    const handle = new EventEmitter();
    handle.close = () => callbacks.delete(name);
    return handle;
  };
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, file, watch, notify: name => callbacks.get(directory)?.('change', name) };
}

test('an append is read when the directory notification names the directory, not the file', async t => {
  const f = fixture(t);
  const observer = await openSweepLog({ directory: f.directory, scope, afterMs: 0, timeoutMs: 1000, watch: f.watch });
  t.after(observer.close);
  const expected = release();
  const raw = JSON.stringify(expected);
  fs.appendFileSync(f.file, raw + '\n');
  // This hint occurred in the isolated macOS probe. It must not filter out an append.
  f.notify(path.basename(f.directory));
  const receipt = await observer.receipt;
  assert.deepEqual(receipt.log, expected);
  assert.equal(receipt.raw, raw);
  assert.equal(receipt.source.sha256, createHash('sha256').update(raw).digest('hex'));
  assert.equal(receipt.source.ino, fs.statSync(f.file).ino);
});


test('a release line above the byte bound fails instead of capturing an unbounded body', async t => {
  const f = fixture(t);
  const observer = await openSweepLog({ directory: f.directory, scope, afterMs: 0, timeoutMs: 1000, watch: f.watch });
  t.after(observer.close);
  const rejected = assert.rejects(observer.receipt, /SWEEP_LOG_LINE_LIMIT/);
  fs.appendFileSync(f.file, JSON.stringify({ ...release(), note: 'x'.repeat(32_768) }) + '\n');
  f.notify(undefined);
  await rejected;
});

test('invalid UTF-8 cannot change original log bytes into a different positive receipt', async t => {
  const f = fixture(t);
  const observer = await openSweepLog({ directory: f.directory, scope, afterMs: 0, timeoutMs: 1000, watch: f.watch });
  t.after(observer.close);
  const rejected = assert.rejects(observer.receipt, /INVALID_SWEEP_LOG_LINE/);
  const raw = JSON.stringify({ ...release(), note: 'broken-byte' });
  const parts = raw.split('broken-byte');
  fs.appendFileSync(f.file, Buffer.concat([Buffer.from(parts[0]), Buffer.from([0xff]), Buffer.from(parts[1] + '\n')]));
  f.notify(undefined);
  await rejected;
});


test('a log which releases the target cannot be used as a retention witness', async t => {
  const f = fixture(t);
  const observer = await openSweepLog({ directory: f.directory, scope, afterMs: 0, timeoutMs: 1000, watch: f.watch });
  t.after(observer.close);
  const rejected = assert.rejects(observer.receipt, /SWEEP_TARGET_RELEASED/);
  const log = release();
  log.sessions.push({ ...log.sessions[0], threadId: 'thr_target' });
  fs.appendFileSync(f.file, JSON.stringify(log) + '\n');
  f.notify(undefined);
  await rejected;
});


test('split UTF-8 and an incomplete line wait for the final newline', async t => {
  const f = fixture(t);
  const observer = await openSweepLog({ directory: f.directory, scope, afterMs: 0, timeoutMs: 1000, watch: f.watch });
  t.after(observer.close);
  const expected = { ...release(), note: 'é😀' };
  const bytes = Buffer.from(JSON.stringify(expected) + '\n');
  const split = bytes.indexOf(Buffer.from('é')) + 1;
  fs.appendFileSync(f.file, bytes.subarray(0, split));
  f.notify(undefined);
  const waiting = await Promise.race([observer.receipt.then(() => false), new Promise(r => setTimeout(() => r(true), 10))]);
  assert.equal(waiting, true);
  fs.appendFileSync(f.file, bytes.subarray(split));
  f.notify(undefined);
  const receipt = await observer.receipt;
  assert.deepEqual(receipt.log, expected);
  assert.deepEqual(Buffer.from(receipt.raw, 'utf8'), bytes.subarray(0, -1));
  assert.equal(receipt.source.sha256, createHash('sha256').update(bytes.subarray(0, -1)).digest('hex'));
});

for (const change of ['replace', 'truncate']) {
  test(`a ${change} discards an incomplete old frame and reads the new owned release`, async t => {
    const f = fixture(t);
    fs.writeFileSync(f.file, 'x'.repeat(2000));
    const observer = await openSweepLog({ directory: f.directory, scope, afterMs: 0, timeoutMs: 1000, watch: f.watch });
    t.after(observer.close);
    if (change === 'replace') fs.renameSync(f.file, path.join(f.directory, 'old-unselected.log'));
    const expected = release();
    fs.writeFileSync(f.file, JSON.stringify(expected) + '\n');
    f.notify(undefined);
    assert.deepEqual((await observer.receipt).log, expected);
  });
}

test('wrong scope, provider, stale time and duplicate notifications do not borrow a release', async t => {
  const f = fixture(t);
  const observer = await openSweepLog({ directory: f.directory, scope, afterMs: 100, timeoutMs: 1000, watch: f.watch });
  t.after(observer.close);
  const expected = release();
  const other = [
    { ...release(), time: 99 },
    { ...release(), sessions: [{ ...release().sessions[0], environmentId: 'env_foreign' }] },
    { ...release(), sessions: [{ ...release().sessions[0], threadId: 'thr_foreign' }] },
    { ...release(), sessions: [{ ...release().sessions[0], providerId: 'pi' }] },
  ];
  fs.appendFileSync(f.file, [...other, expected].map(JSON.stringify).join('\n') + '\n');
  f.notify(undefined); f.notify('unrelated'); f.notify(undefined);
  assert.deepEqual((await observer.receipt).log, expected);
});

test('startup reads a bounded pre-existing positive line instead of waiting for another event', async t => {
  const f = fixture(t);
  const expected = release();
  fs.writeFileSync(f.file, JSON.stringify(expected) + '\n');
  const observer = await openSweepLog({ directory: f.directory, scope, afterMs: 0, timeoutMs: 1000, watch: f.watch });
  t.after(observer.close);
  assert.deepEqual((await observer.receipt).log, expected);
});

test('missing notifications time out as unproved without an elapsed-time sweep inference', async t => {
  const f = fixture(t);
  const observer = await openSweepLog({ directory: f.directory, scope, afterMs: 0, timeoutMs: 20, watch: f.watch });
  t.after(observer.close);
  fs.appendFileSync(f.file, JSON.stringify(release()) + '\n');
  await assert.rejects(observer.receipt, /SWEEP_LOG_TIMEOUT/);
});

test('the real Node watcher captures one isolated append with no BB or model process', async t => {
  const f = fixture(t);
  const observer = await openSweepLog({ directory: f.directory, scope, afterMs: 0, timeoutMs: 2000 });
  t.after(observer.close);
  const expected = release();
  fs.appendFileSync(f.file, JSON.stringify(expected) + '\n');
  assert.deepEqual((await observer.receipt).log, expected);
});

test('a non-regular log fails before opening a blocking pipe', async t => {
  const f = fixture(t);
  fs.unlinkSync(f.file);
  fs.mkdirSync(f.file);
  const observer = await openSweepLog({ directory: f.directory, scope, afterMs: 0, timeoutMs: 1000, watch: f.watch });
  t.after(observer.close);
  await assert.rejects(observer.receipt, /INVALID_SWEEP_LOG_SOURCE/);
});


test('a symlinked log directory cannot authenticate a file from another location', async t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, JSON.stringify(release()) + '\n');
  const link = f.directory + '-link';
  fs.symlinkSync(f.directory, link);
  t.after(() => fs.unlinkSync(link));
  const observer = await openSweepLog({ directory: link, scope, afterMs: 0, timeoutMs: 1000, watch: f.watch });
  t.after(observer.close);
  await assert.rejects(observer.receipt, /INVALID_SWEEP_LOG_SOURCE/);
});


test('truncate and regrow on the same inode cannot concatenate an old partial frame with a new release', async t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, 'old-partial');
  const observer = await openSweepLog({ directory: f.directory, scope, afterMs: 0, timeoutMs: 1000, watch: f.watch });
  t.after(observer.close);
  const expected = release();
  fs.writeFileSync(f.file, JSON.stringify(expected) + '\n');
  f.notify(undefined);
  assert.deepEqual((await observer.receipt).log, expected);
});


for (const defect of ['malformed', 'duplicate-control', 'too-many-files', 'too-large-file']) {
  test(`${defect} input remains failed and bounded`, async t => {
    const f = fixture(t);
    if (defect === 'malformed') fs.writeFileSync(f.file, '{private broken log text}\n');
    if (defect === 'duplicate-control') {
      const log = release(); log.sessions.push(log.sessions[0]); fs.writeFileSync(f.file, JSON.stringify(log) + '\n');
    }
    if (defect === 'too-many-files') for (let i = 0; i < 33; i++) fs.writeFileSync(path.join(f.directory, `host-daemon.${i}.log`), '');
    if (defect === 'too-large-file') fs.truncateSync(f.file, 64 * 1024 * 1024 + 1);
    const observer = await openSweepLog({ directory: f.directory, scope, afterMs: 0, timeoutMs: 1000, watch: f.watch });
    t.after(observer.close);
    await assert.rejects(observer.receipt, error => /^(INVALID_SWEEP_LOG_LINE|SWEEP_LOG_FILE_LIMIT|SWEEP_LOG_BYTE_LIMIT)$/.test(error.message));
  });
}


test('an append during file-watch setup is read without a later notification', async t => {
  const f = fixture(t), expected = release();
  let appended = false;
  const watch = (name, callback) => {
    if (name === f.file && !appended) {
      appended = true;
      fs.appendFileSync(f.file, JSON.stringify(expected) + '\n');
    }
    return f.watch(name, callback);
  };
  const observer = await openSweepLog({ directory: f.directory, scope, afterMs: 0, timeoutMs: 100, watch });
  t.after(observer.close);
  assert.deepEqual((await observer.receipt).log, expected);
});


test('a BOM-prefixed release is rejected rather than hashed as different bytes', async t => {
  const f = fixture(t);
  const original = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(release()))]);
  fs.writeFileSync(f.file, Buffer.concat([original, Buffer.from('\n')]));
  const observer = await openSweepLog({ directory: f.directory, scope, afterMs: 0, timeoutMs: 1000, watch: f.watch });
  t.after(observer.close);
  await assert.rejects(observer.receipt, /INVALID_SWEEP_LOG_LINE/);
});


for (const replacement of ['symlink', 'different-directory']) {
  test(`a ${replacement} substituted after startup cannot supply an owned release`, async t => {
    const f = fixture(t), other = fixture(t);
    const observer = await openSweepLog({ directory: f.directory, scope, afterMs: 0, timeoutMs: 1000, watch: f.watch });
    t.after(observer.close);
    const old = f.directory + '-original';
    fs.renameSync(f.directory, old);
    t.after(() => fs.rmSync(old, { recursive: true, force: true }));
    if (replacement === 'symlink') fs.symlinkSync(other.directory, f.directory);
    else fs.mkdirSync(f.directory);
    fs.writeFileSync(f.file, JSON.stringify(release()) + '\n');
    f.notify(undefined);
    await assert.rejects(observer.receipt, /INVALID_SWEEP_LOG_SOURCE/);
  });
}
