import { test } from "node:test";
import assert from "node:assert/strict";
import { createWarmthLedger, installQualificationObservers } from "./qualification.mjs";

const ledger = () => createWarmthLedger({ now: () => 10, expectedRevisions: { A: "a1", B: "b1" } });
const load = (l, key, revision) => l.confirm(l.beginRead(key), revision);

test("previsited and still-current loaded entries are different after invalidation", () => {
  const l = ledger();
  assert.equal(l.inspect("A").classification, "cold");
  load(l, "A", "a1");
  assert.equal(l.inspect("A").classification, "warm");
  l.invalidate("manual-refresh");
  assert.deepEqual(l.inspect("A"), {
    key: "A",
    epoch: 1,
    previsited: true,
    current: false,
    revision: "a1",
    classification: "cold",
  });
  load(l, "A", "a1");
  assert.equal(l.inspect("A").current, true);
});
test("a response begun before invalidation cannot restore warmth", () => {
  const l = ledger();
  const old = l.beginRead("A");
  l.invalidate("connection-close");
  l.confirm(old, "a1");
  assert.equal(l.inspect("A").previsited, true);
  assert.equal(l.inspect("A").current, false);
  assert.equal(l.export().reads[0].accepted, false);
});
test("changed revisions and attempted writes block clean qualification", () => {
  const l = ledger();
  load(l, "A", "different");
  assert.equal(l.inspect("A").current, false);
  assert.equal(l.export().errors.length, 1);
  l.mutation("updateTask");
  assert.equal(l.export().mutations.length, 1);
});
test("all own signal channels invalidate; other plugins and thread notices do not", () => {
  const l = ledger();
  load(l, "A", "a1");
  l.message({ type: "changed", entity: "thread", id: "irrelevant" });
  l.message({ type: "plugin-signal", pluginId: "other", channel: "tasks:changed" });
  assert.equal(l.inspect("A").current, true);
  for (const channel of [
    "tasks:changed",
    "projects:changed",
    "comments:changed",
    "threads:changed",
  ]) {
    l.message({ type: "plugin-signal", pluginId: "tasks-plus", channel });
  }
  assert.equal(l.export().invalidations.length, 4);
  assert.equal(l.inspect("A").current, false);
});
test("invalidation during presentation remains explicit, not a warm success", () => {
  const l = ledger();
  load(l, "B", "b1");
  const before = l.inspect("B");
  l.invalidate("tasks:changed");
  load(l, "B", "b1");
  const q = l.qualify(before);
  assert.equal(q.classification, "cold");
  assert.equal(q.invalidatedDuringMovement, true);
  assert.equal(q.currentAtEnd, true);
});
test("observer preserves response and socket semantics and restores its own wrappers", async () => {
  const listeners = new Map();
  class Socket {
    static OPEN = 1;
    constructor() {
      this.handlers = new Map();
    }
    addEventListener(k, f) {
      this.handlers.set(k, f);
    }
  }
  const fetch = async () => ({
    ok: true,
    clone: () => ({
      json: async () => ({ ok: true, result: { task: { key: "A", updatedAt: "a1" } } }),
    }),
  });
  const win = {
    WebSocket: Socket,
    fetch,
    performance: { now: () => 10 },
    document: {
      addEventListener(k, f) {
        listeners.set(k, f);
      },
      removeEventListener(k) {
        listeners.delete(k);
      },
    },
    addEventListener(k, f) {
      listeners.set(k, f);
    },
    removeEventListener(k) {
      listeners.delete(k);
    },
  };
  const installed = installQualificationObservers(win, { A: "a1" });
  const socket = new win.WebSocket();
  assert.ok(socket instanceof Socket);
  assert.equal(win.WebSocket.OPEN, 1);
  socket.handlers.get("open")();
  const response = await win.fetch("/api/v1/plugins/tasks-plus/rpc/getTaskByKey", {
    body: JSON.stringify({ taskKey: "A" }),
  });
  await installed.settle();
  assert.equal(response.ok, true);
  assert.equal(installed.ledger.inspect("A").current, true);
  socket.handlers.get("message")({
    data: JSON.stringify({
      type: "plugin-signal",
      pluginId: "tasks-plus",
      channel: "tasks:changed",
    }),
  });
  assert.equal(installed.ledger.inspect("A").current, false);
  installed.dispose();
  assert.equal(win.WebSocket, Socket);
  assert.equal(win.fetch, fetch);
  assert.equal(listeners.size, 0);
});

function observerWindow(fetch) {
  return Object.assign(new EventTarget(), {
    WebSocket: class {},
    document: new EventTarget(),
    performance: { now: () => 10 },
    fetch,
  });
}

test("settle waits for current reads, excludes later reads and clears completed work", async () => {
  const bodies = Object.fromEntries(["A", "B", "C"].map((key) => [key, Promise.withResolvers()]));
  const win = observerWindow(async (_input, options) => {
    const key = JSON.parse(options.body).taskKey;
    return { ok: true, clone: () => ({ json: () => bodies[key].promise }) };
  });
  const installed = installQualificationObservers(win, { A: "a1", B: "b1", C: "c1" });
  const read = (key) =>
    win.fetch("/api/v1/plugins/tasks-plus/rpc/getTaskByKey", {
      body: JSON.stringify({ taskKey: key }),
    });
  const confirm = (key) =>
    bodies[key].resolve({
      ok: true,
      result: { task: { key, updatedAt: key.toLowerCase() + "1" } },
    });
  try {
    assert.deepEqual(await installed.settle(), []);
    await read("A");
    await read("B");
    let settled = false;
    const initial = installed.settle().then((results) => {
      settled = true;
      return results;
    });
    await read("C");
    confirm("B");
    await bodies.B.promise;
    assert.equal(installed.ledger.inspect("B").current, true);
    assert.equal(settled, false);
    confirm("A");
    assert.deepEqual(await initial, [undefined, undefined]);
    assert.equal(installed.ledger.inspect("A").current, true);
    assert.equal(installed.ledger.inspect("C").current, false);
    const later = installed.settle();
    confirm("C");
    assert.deepEqual(await later, [undefined]);
    assert.deepEqual(await installed.settle(), []);
  } finally {
    installed.dispose();
  }
});

test("settle records parsing failure and preserves native fetch rejection", async () => {
  const body = Promise.withResolvers();
  const failure = new Error("Network failed.");
  let rejectFetch = false;
  const win = observerWindow(async () => {
    if (rejectFetch) throw failure;
    return { ok: true, clone: () => ({ json: () => body.promise }) };
  });
  const installed = installQualificationObservers(win, { A: "a1" });
  const read = () =>
    win.fetch("/api/v1/plugins/tasks-plus/rpc/getTaskByKey", {
      body: JSON.stringify({ taskKey: "A" }),
    });
  try {
    await read();
    const settled = installed.settle();
    body.reject(new Error("Invalid JSON."));
    assert.deepEqual(await settled, [undefined]);
    assert.equal(installed.ledger.inspect("A").current, false);
    assert.deepEqual(installed.ledger.export().errors, [
      { reason: "Unparsed lookup response.", time: 10 },
    ]);
    rejectFetch = true;
    await assert.rejects(read(), (error) => error === failure);
    assert.equal(installed.ledger.export().reads.at(-1).reason, "Fetch rejected.");
    assert.deepEqual(await installed.settle(), []);
  } finally {
    installed.dispose();
  }
});
