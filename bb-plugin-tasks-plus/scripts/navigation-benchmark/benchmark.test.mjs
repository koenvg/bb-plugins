import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createFixture, writeFixture, cleanupFixture } from "./fixture.mjs";
import { createProbe } from "./probe.mjs";
import { summarize } from "./report.mjs";

const owner = "bbp60-local-test";
test("100 owned tasks, ten 2 KiB descriptions, separate 50-comment case", () => {
  const f = createFixture(owner);
  assert.deepEqual(f, createFixture(owner));
  assert.equal(f.tasks.length, 100);
  assert.equal(new Set(f.tasks.map((t) => t.key)).size, 100);
  assert.equal(f.warmKeys.length, 10);
  for (const key of f.warmKeys) {
    const t = f.tasks.find((t) => t.key === key);
    assert.ok(Buffer.byteLength(t.description) >= 2000);
    assert.ok(Buffer.byteLength(t.description) < 2300);
    assert.match(t.description, /\n- /);
    assert.ok(t.labelIds.length && t.dueDate);
  }
  assert.ok(!f.warmKeys.includes(f.activity.taskKey));
  assert.equal(f.activity.comments.length, 50);
  assert.equal(f.activity.comments.filter((c) => c.authorKind === "agent").length, 25);
  assert.ok(f.activity.comments.some((c) => c.attachments.length));
  assert.throws(() => createFixture("../real-tasks"));
});
test("cleanup refuses a foreign owner, changed contents, and extra files", async () => {
  const root = await mkdtemp(join(tmpdir(), "bbp60-test-"));
  const dir = join(root, "owned");
  try {
    await writeFixture(dir, owner);
    await assert.rejects(cleanupFixture(dir, "another-owner"));
    await writeFile(join(dir, "unowned.txt"), "leave this alone");
    await assert.rejects(cleanupFixture(dir, owner));
    await rm(join(dir, "unowned.txt"));
    const original = await readFile(join(dir, "fixture.json"));
    await writeFile(join(dir, "fixture.json"), "{}");
    await assert.rejects(cleanupFixture(dir, owner));
    await writeFile(join(dir, "fixture.json"), original);
    await cleanupFixture(dir, owner);
    await assert.rejects(readFile(join(dir, "fixture.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
function harness(mode = "latency") {
  let time = 0;
  let state = {
    rowKey: "A",
    detailKey: "A",
    heading: "A title",
    marker: "A description",
    rendered: true,
    visible: true,
  };
  const frames = [];
  let listener;
  const win = {
    innerWidth: 1440,
    innerHeight: 900,
    performance: { now: () => time },
    requestAnimationFrame: (cb) => {
      frames.push(cb);
      return frames.length;
    },
    addEventListener: (_, cb) => {
      listener = cb;
    },
    removeEventListener() {},
  };
  const probe = createProbe({ window: win, read: () => state, mode, timeoutMs: 500 });
  return {
    probe,
    state: (s) => {
      state = s;
    },
    frame: (dt = 16) => {
      time += dt;
      frames.shift()?.();
    },
    key: () =>
      listener({
        key: "ArrowDown",
        repeat: false,
        isComposing: false,
        target: {},
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
      }),
  };
}
const arm = (h, classification = "warm") =>
  h.probe.arm({
    fromKey: "A",
    key: "B",
    title: "B title",
    marker: "B description",
    classification,
  });
const ready = {
  rowKey: "B",
  detailKey: "B",
  heading: "B title",
  marker: "B description",
  rendered: true,
  visible: true,
};
test("ends only after a matching rendered description and a presentation opportunity", () => {
  const h = harness();
  arm(h);
  h.key();
  h.frame();
  h.state({ ...ready, rendered: false });
  h.frame();
  assert.equal(h.probe.samples.length, 0);
  h.state(ready);
  h.frame();
  assert.equal(h.probe.samples.length, 0);
  h.frame();
  assert.equal(h.probe.samples[0].status, "presented");
  assert.equal(h.probe.samples[0].latencyMs, 64);
  assert.ok(h.probe.samples[0].blankMs > 0);
  h.probe.dispose();
});
test("a mismatched row at the final frame fails rather than entering warm statistics", () => {
  const h = harness();
  arm(h);
  h.key();
  h.state(ready);
  h.frame();
  h.state({ ...ready, rowKey: "C" });
  h.frame();
  assert.equal(h.probe.samples[0].status, "failed");
  assert.throws(() => summarize({ mode: "latency", samples: h.probe.samples }));
});
test("timeouts, save waits and cold transitions stay distinct", () => {
  for (const classification of ["cold", "save-pending", "failed"]) {
    const h = harness();
    arm(h, classification);
    h.key();
    h.frame(501);
    assert.equal(h.probe.samples[0].classification, classification);
    assert.equal(h.probe.samples[0].status, "failed");
  }
});
test("profiling and final runs cannot be mixed; failed warm samples block acceptance", () => {
  const sample = {
    classification: "warm",
    status: "presented",
    key: "B",
    rowKey: "B",
    detailKey: "B",
    latencyMs: 20,
    blankMs: 0,
  };
  assert.throws(() => summarize({ mode: "latency", samples: Array(29).fill(sample) }));
  assert.throws(() => summarize({ mode: "profile", samples: Array(30).fill(sample) }));
  assert.throws(() =>
    summarize({
      mode: "latency",
      samples: [...Array(30).fill(sample), { ...sample, status: "failed" }],
    }),
  );
  const r = summarize({
    mode: "latency",
    samples: Array.from({ length: 30 }, (_, i) => ({ ...sample, latencyMs: i + 1 })),
  });
  assert.deepEqual(r.warm, { count: 30, medianMs: 15.5, p95Ms: 29, worstMs: 30, blankMs: 0 });
});

test("browser runner refuses missing approval or source evidence before touching a page", async () => {
  const { runNavigation } = await import("./runner.mjs");
  const page = new Proxy(
    {},
    {
      get() {
        throw new Error("Page must remain untouched.");
      },
    },
  );
  await assert.rejects(runNavigation(page, { fixture: createFixture(owner) }), /approval/);
  await assert.rejects(
    runNavigation(page, { fixture: createFixture(owner), approvalReference: "test-only" }),
    /source/,
  );
});

test("bounded driver warms ten keys, records 36 paired movements, and removes only its probe", async () => {
  const { runNavigation } = await import("./runner.mjs");
  const fixture = createFixture(owner);
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  let current = fixture.tasks[0];
  let time = 0;
  let listener;
  const frames = [];
  const read = () => ({
    rowKey: current.key,
    detailKey: current.key,
    heading: current.title,
    marker: current.marker,
    rendered: true,
    visible: true,
  });
  const win = {
    innerWidth: 1440,
    innerHeight: 900,
    performance: { now: () => time },
    requestAnimationFrame: (fn) => frames.push(fn),
    addEventListener: (_, fn) => {
      listener = fn;
    },
    removeEventListener() {},
  };
  globalThis.window = win;
  globalThis.document = {};
  const cdpCommands = [];
  let detached = false;
  const page = {
    setViewportSize: async () => {},
    context: () => ({
      newCDPSession: async () => ({
        send: async (...args) => cdpCommands.push(args),
        detach: async () => {
          detached = true;
        },
      }),
      browser: () => ({ version: () => "test-browser" }),
    }),
    evaluate: async (fn, arg) => fn(arg),
    addScriptTag: async () => {
      globalThis.bbp60Module = {
        createProbe: (options) => createProbe({ ...options, read }),
        readNativeTicket: read,
      };
    },
    waitForFunction: async (fn, arg) => {
      for (let i = 0; i < 100; i++) {
        if (fn(arg)) return;
        time += 16;
        frames.shift()?.();
      }
      throw new Error("Mock timeout.");
    },
    locator: (selector) => ({
      evaluateAll: async (fn) => fn(fixture.tasks.map((t) => ({ dataset: { taskKey: t.key } }))),
      click: async () => {
        current = fixture.tasks.find((t) => selector.includes(`"${t.key}"`));
      },
      focus: async () => {},
    }),
    keyboard: {
      press: async (key) => {
        listener({ key, target: {} });
        current = fixture.tasks[fixture.tasks.indexOf(current) + (key === "ArrowDown" ? 1 : -1)];
      },
    },
    on() {},
    off() {},
  };
  try {
    const run = await runNavigation(page, {
      fixture,
      approvalReference: "unit-test-only",
      identities: {
        tasks: { sourceCommit: "test", bundle: "test", enabled: true },
        quota: { sourceCommit: "test", bundle: "test", enabled: true },
      },
    });
    assert.equal(run.error, null);
    const root = await mkdtemp(join(tmpdir(), "bbp60-digest-"));
    const dir = join(root, "owned");
    try {
      await writeFixture(dir, owner);
      const bytes = await readFile(join(dir, "fixture.json"));
      const ownership = JSON.parse(await readFile(join(dir, "ownership.json"), "utf8"));
      assert.equal(run.fixtureSha256, ownership.sha256);
      assert.equal(run.fixtureSha256, createHash("sha256").update(bytes).digest("hex"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
    assert.equal(run.warmup.samples.length, 18);
    assert.equal(run.samples.length, 36);
    assert.equal(summarize(run).warm.count, 36);
    assert.deepEqual(cdpCommands, [["Emulation.setCPUThrottlingRate", { rate: 1 }]]);
    assert.equal(detached, true);
    assert.equal(globalThis.bbp60Probe, undefined);
    assert.equal(globalThis.bbp60Module, undefined);
  } finally {
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
    delete globalThis.bbp60Probe;
    delete globalThis.bbp60Module;
  }
});

test("native DOM probe does not count offscreen descriptions as presented", async () => {
  const { readNativeTicket } = await import("./probe.mjs");
  const rect = { width: 500, height: 100, top: 100, bottom: 200, left: 100, right: 600 };
  const heading = { textContent: "B title", getClientRects: () => [rect], closest: () => null };
  let descriptionRect = { ...rect, top: 1000, bottom: 1100 };
  const description = {
    getClientRects: () => [descriptionRect],
    closest: () => null,
    querySelector: (tag) => (tag === "h2" ? { textContent: "B description" } : {}),
  };
  const detail = {
    dataset: { detailKey: "B" },
    getClientRects: () => [rect],
    querySelector: (selector) => (selector.startsWith("h1") ? heading : description),
  };
  const document = {
    defaultView: { innerHeight: 900, innerWidth: 1440 },
    querySelectorAll: (selector) =>
      selector.startsWith("[data-task-key]") ? [{ dataset: { taskKey: "B" } }] : [detail],
  };
  assert.equal(readNativeTicket(document).visible, false);
  descriptionRect = rect;
  assert.equal(readNativeTicket(document).visible, true);
});

test("CDP configuration failure still detaches the created session", async () => {
  const { runNavigation } = await import("./runner.mjs");
  let detached = false;
  const page = {
    setViewportSize: async () => {},
    off() {},
    context: () => ({
      newCDPSession: async () => ({
        send: async () => {
          throw new Error("Configuration failed.");
        },
        detach: async () => {
          detached = true;
        },
      }),
      browser: () => ({ version: () => "test-browser" }),
    }),
  };
  const run = await runNavigation(page, {
    fixture: createFixture(owner),
    approvalReference: "unit-test-only",
    identities: {
      tasks: { sourceCommit: "test", bundle: "test", enabled: true },
      quota: { sourceCommit: "test", bundle: "test", enabled: true },
    },
  });
  assert.equal(run.error, "Configuration failed.");
  assert.equal(detached, true);
});
test("probe disposal failure cannot skip CDP detachment", async () => {
  const { runNavigation } = await import("./runner.mjs");
  let detached = false;
  const fixture = createFixture(owner);
  const page = {
    setViewportSize: async () => {},
    off() {},
    context: () => ({
      newCDPSession: async () => ({
        send: async () => {},
        detach: async () => {
          detached = true;
        },
      }),
      browser: () => ({ version: () => "test-browser" }),
    }),
    evaluate: async (fn, arg) => fn(arg),
    waitForFunction: async () => {},
    addScriptTag: async () => {
      globalThis.bbp60Module = {
        createProbe: () => ({
          dispose() {
            throw new Error("Disposal failed.");
          },
        }),
      };
    },
    locator: () => ({
      evaluateAll: async (fn) => fn(fixture.tasks.map((t) => ({ dataset: { taskKey: t.key } }))),
      click: async () => {
        throw new Error("Click failed.");
      },
    }),
  };
  const previousWindow = globalThis.window;
  globalThis.window = {};
  try {
    await assert.rejects(
      runNavigation(page, {
        fixture,
        approvalReference: "unit-test-only",
        identities: {
          tasks: { sourceCommit: "test", bundle: "test", enabled: true },
          quota: { sourceCommit: "test", bundle: "test", enabled: true },
        },
      }),
      /Disposal failed/,
    );
    assert.equal(detached, true);
  } finally {
    globalThis.window = previousWindow;
    delete globalThis.bbp60Probe;
    delete globalThis.bbp60Module;
  }
});
