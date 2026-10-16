import { EventEmitter } from "node:events";
import {
  chmod,
  link,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { SUBAGENT_STATUS_SOURCE } from "./extension-source.js";
import { createSessionModelReader } from "./session-model.js";

const asyncId = "11111111-1111-4111-8111-111111111111";
const executorId = "22222222-2222-4222-8222-222222222222";
const owned: string[] = [];
afterEach(async () => {
  for (const path of owned.splice(0)) await rm(path, { recursive: true, force: true });
});

async function fixture(existing = false) {
  const base = await realpath(await mkdtemp(join(tmpdir(), "bb-model-")));
  owned.push(base);
  const parentFile = join(base, "parent.jsonl");
  const root = join(base, "parent", executorId);
  const file = join(root, "run-0", "session.jsonl");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const started = Date.now() - 100;
  const entries = [
    {
      type: "session",
      version: 3,
      id: "child-header",
      parentSession: parentFile,
      timestamp: new Date(started).toISOString(),
      cwd: base,
    },
    {
      type: "model_change",
      id: "select",
      parentId: null,
      timestamp: new Date(started).toISOString(),
      provider: "selection",
      modelId: "not-actual",
    },
    {
      type: "message",
      id: "answer",
      parentId: "select",
      timestamp: new Date(started + 1).toISOString(),
      message: {
        role: "assistant",
        content: [{ type: "text", text: "private fixture" }],
        api: "test-api",
        usage: {
          input: 0,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 1,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        provider: "child-provider",
        model: "child-actual",
        stopReason: "stop",
        timestamp: started + 1,
      },
    },
  ];
  const save = async (data = entries.map((e) => JSON.stringify(e)).join("\n") + "\n") => {
    await mkdir(join(root, "run-0"), { recursive: true, mode: 0o700 });
    await writeFile(file, data, { mode: 0o600 });
  };
  if (existing) await save();
  const context = {
    sessionId: "parent-header",
    sessionFile: parentFile,
    guard: true,
    command: true,
  };
  let current = true;
  let readContext: () => Promise<unknown> = async () => context;
  const reader = createSessionModelReader({
    parentFile,
    env: { BB_PI_SUBAGENTS_BRIDGE_SESSION_DIR: base },
    generation: 7,
    current: () => current,
    context: () => readContext(),
  });
  const bus = new EventEmitter();
  let observed = Promise.resolve<string | undefined>(undefined);
  const ready: string[] = [];
  const install = new Function(`${SUBAGENT_STATUS_SOURCE}; return installSubagentStatusChannel;`)();
  install(
    {
      events: {
        on(name: string, fn: (...args: unknown[]) => void) {
          bus.on(name, fn);
          return () => bus.off(name, fn);
        },
      },
      on() {},
    },
    () => ({
      sessionManager: {
        getSessionId: () => context.sessionId,
        getSessionFile: () => context.sessionFile,
      },
    }),
    (evidence: unknown) => {
      observed = reader.observe(evidence).then((id) => {
        if (id) ready.push(id);
        return id;
      });
    },
  );
  const start = {
    id: asyncId,
    sessionId: parentFile,
    mode: "single",
    sessionRoot: root,
    nestedRoute: {
      rootRunId: executorId,
      eventSink: "/owned-route/events",
      controlInbox: "/owned-route/controls",
      capabilityToken: "33333333-3333-4333-8333-333333333333",
    },
  };
  const complete = {
    runId: asyncId,
    sessionId: parentFile,
    mode: "single",
    success: true,
    state: "complete",
    timestamp: Date.now(),
    durationMs: 1000,
    results: [{ index: 0, context: "fresh", success: true, sessionFile: file, sessionPath: file }],
  };
  const emit = async (name: string, value: unknown) => {
    bus.emit(name, value);
    await observed;
  };
  const target = {
    id: "row",
    kind: "subagent" as const,
    asyncId,
    sessionId: context.sessionId,
    sessionFile: parentFile,
    generation: 7,
  };
  return {
    setContextRead: (fn: () => Promise<unknown>) => {
      readContext = fn;
    },
    base,
    root,
    file,
    reader,
    context,
    entries,
    start,
    complete,
    target,
    save,
    ready,
    emit,
    replace: () => {
      current = false;
    },
  };
}

it("attributes the completed assistant through real projection, distinct executor/async IDs and a pre-completion absent run-0", async () => {
  const h = await fixture();
  await h.emit("subagent:async-started", h.start);
  await h.save();
  await h.emit("subagent:async-complete", h.complete);
  expect(h.ready).toEqual([asyncId]);
  expect(await h.reader.resolve(h.target, new AbortController().signal)).toEqual({
    provider: "child-provider",
    model: "child-actual",
    capturedAt: expect.any(Number),
  });
  h.reader.dispose();
});
it("never attributes an already-existing child file even with matching fresh completion", async () => {
  const h = await fixture(true);
  await h.emit("subagent:async-started", h.start);
  await h.emit("subagent:async-complete", h.complete);
  expect(h.ready).toEqual([]);
  expect(await h.reader.resolve(h.target, new AbortController().signal)).toBeUndefined();
  h.reader.dispose();
});

async function readyFixture() {
  const h = await fixture();
  await h.emit("subagent:async-started", h.start);
  await h.save();
  await h.emit("subagent:async-complete", h.complete);
  return h;
}
const resolveModel = (h: Awaited<ReturnType<typeof fixture>>) =>
  h.reader.resolve(h.target, new AbortController().signal);

it.each([
  { generation: 8 },
  { sessionId: "foreign" },
  { sessionFile: "/foreign" },
  { asyncId: "another" },
  { kind: "workflow" as const },
  { kind: "host-step" as const },
  { childId: "step:0" },
  { kind: "step" as const, childId: "step:1" },
])("rejects foreign or non-concrete target %j", async (change) => {
  const h = await readyFixture();
  expect(
    await h.reader.resolve({ ...h.target, ...change }, new AbortController().signal),
  ).toBeUndefined();
});
it("allows only the exact step:0 child address", async () => {
  const h = await readyFixture();
  expect(
    await h.reader.resolve(
      { ...h.target, kind: "step", childId: "step:0" },
      new AbortController().signal,
    ),
  ).toMatchObject({ provider: "child-provider", model: "child-actual" });
});
it.each([
  "missed-start",
  "wrong-root",
  "same-executor-id",
  "foreign-owner",
  "header-owner-not-file",
  "fallback-only",
  "wrong-path",
  "wrong-index",
  "fork",
  "workflow",
  "nested",
  "external",
  "remote",
  "revival",
  "failed",
  "multiple",
  "conflicting-start",
  "conflicting-completion",
  "envelope-replaced",
  "reused-root",
  "completion-racing-probe",
  "missing-route",
  "inherited-route",
  "malformed-route",
  "foreign-completion-route",
])("keeps %s ineligible through actual event projection", async (scenario) => {
  const h = await fixture();
  const start = { ...h.start } as Record<string, unknown>;
  const complete = structuredClone(h.complete) as Record<string, any>;
  if (scenario === "missing-route") delete start.nestedRoute;
  if (scenario === "inherited-route")
    start.nestedRoute = {
      ...h.start.nestedRoute,
      rootRunId: "44444444-4444-4444-8444-444444444444",
    };
  if (scenario === "malformed-route") start.nestedRoute = { rootRunId: executorId };
  if (scenario === "foreign-completion-route")
    complete.nestedRoute = {
      ...h.start.nestedRoute,
      rootRunId: "44444444-4444-4444-8444-444444444444",
    };
  if (scenario === "wrong-root") start.sessionRoot = join(h.base, "outside", executorId);
  if (scenario === "same-executor-id") start.id = executorId;
  if (scenario === "foreign-owner") start.sessionId = "/foreign";
  if (scenario === "header-owner-not-file") start.sessionId = h.context.sessionId;
  if (scenario === "workflow") start.parentWorkflowRunId = "workflow";
  if (scenario === "nested") complete.isNested = true;
  if (scenario === "external") complete.results[0].runner = { type: "external-cli" };
  if (scenario === "remote") complete.results[0].placement = { machine: "remote" };
  if (scenario === "revival") start.sessionRoot = join(h.base, "parent");
  if (scenario === "fallback-only") {
    complete.sessionFile = h.file;
    delete complete.results[0].sessionFile;
  }
  if (scenario === "wrong-path") complete.results[0].sessionPath = join(h.base, "other.jsonl");
  if (scenario === "wrong-index") complete.results[0].index = 1;
  if (scenario === "fork") complete.results[0].context = "fork";
  if (scenario === "failed") complete.success = false;
  if (scenario === "multiple") complete.results.push({ ...complete.results[0] });
  if (scenario === "completion-racing-probe") {
    const probe = h.emit("subagent:async-started", start);
    await h.emit("subagent:async-complete", complete);
    await probe;
  } else if (scenario !== "missed-start") await h.emit("subagent:async-started", start);
  if (scenario === "conflicting-start")
    await h.emit("subagent:async-started", { ...start, mode: "chain" });
  if (scenario === "envelope-replaced") h.context.sessionId = "new-header";
  if (scenario === "reused-root")
    await h.emit("subagent:async-started", {
      ...start,
      id: "33333333-3333-4333-8333-333333333333",
    });
  await h.save();
  await h.emit("subagent:async-complete", complete);
  if (scenario === "conflicting-completion")
    await h.emit("subagent:async-complete", { ...complete, timestamp: complete.timestamp + 1 });
  expect(await resolveModel(h)).toBeUndefined();
});
it("coalesces identical starts and completions without a second readiness notice", async () => {
  const h = await fixture();
  await h.emit("subagent:async-started", h.start);
  await h.emit("subagent:async-started", h.start);
  await h.save();
  await h.emit("subagent:async-complete", h.complete);
  await h.emit("subagent:async-complete", h.complete);
  expect(h.ready).toEqual([asyncId]);
  expect(await resolveModel(h)).toMatchObject({ model: "child-actual" });
});
it("never rearms an identity evicted by neither the record nor metadata cap", async () => {
  const h = await fixture();
  for (let i = 0; i < 65; i++)
    await h.emit("subagent:async-complete", {
      ...h.complete,
      runId: `${String(i).padStart(8, "0")}-4444-4444-8444-444444444444`,
    });
  await h.emit("subagent:async-started", h.start);
  await h.save();
  await h.emit("subagent:async-complete", h.complete);
  expect(h.ready).toEqual([]);
  expect(await resolveModel(h)).toBeUndefined();
});
it("bounds oversized/deep event metadata without retaining transcript fields", async () => {
  const h = await fixture();
  await h.emit("subagent:async-started", {
    ...h.start,
    task: "x".repeat(1000000),
    model: "not-actual",
  });
  await h.save();
  await h.emit("subagent:async-complete", {
    ...h.complete,
    summary: "x".repeat(1000000),
    model: "not-actual",
  });
  expect(await resolveModel(h)).toMatchObject({
    provider: "child-provider",
    model: "child-actual",
  });
});

it.each([
  "truncated",
  "json",
  "utf8",
  "bom",
  "deep",
  "header-version",
  "header-parent",
  "header-id",
  "header-oversize",
  "record-oversize",
  "file-oversize",
  "record-count",
  "duplicate-id",
  "missing-parent",
  "branch",
  "missing-reference",
  "timestamp",
  "inherited",
  "unknown-type",
  "assistant-shape",
  "assistant-error",
  "assistant-aborted",
  "assistant-pending",
  "assistant-deferred",
  "empty-provider",
  "long-model",
  "no-assistant",
])("fails closed for %s session data", async (scenario) => {
  const h = await readyFixture();
  const entries = structuredClone(h.entries) as Record<string, any>[];
  const last = entries[2]!;
  let bytes: string | Buffer | undefined;
  if (scenario === "truncated") bytes = entries.map((e) => JSON.stringify(e)).join("\n");
  if (scenario === "json") bytes = "{invalid}\n";
  if (scenario === "utf8") bytes = Buffer.from([0xff, 10]);
  if (scenario === "bom")
    bytes = "\uFEFF" + entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  if (scenario === "deep") {
    let value: unknown = {};
    for (let i = 0; i < 25; i++) value = { value };
    last.extra = value;
  }
  if (scenario === "header-version") entries[0]!.version = 2;
  if (scenario === "header-parent") entries[0]!.parentSession = "/foreign";
  if (scenario === "header-id") entries[0]!.id = h.context.sessionId;
  if (scenario === "header-oversize") entries[0]!.extra = "x".repeat(4096);
  if (scenario === "record-oversize") last.message.content[0].text = "x".repeat(64 * 1024);
  if (scenario === "file-oversize") bytes = "x".repeat(512 * 1024 + 1) + "\n";
  if (scenario === "record-count") bytes = "{}\n".repeat(2049);
  if (scenario === "duplicate-id") last.id = entries[1]!.id;
  if (scenario === "missing-parent") last.parentId = "missing";
  if (scenario === "branch") last.parentId = null;
  if (scenario === "missing-reference")
    entries.push({
      type: "label",
      id: "label",
      parentId: last.id,
      timestamp: last.timestamp,
      targetId: "missing",
    });
  if (scenario === "timestamp") last.timestamp = new Date(h.complete.timestamp + 1).toISOString();
  if (scenario === "inherited") entries[0]!.timestamp = "2000-01-01T00:00:00.000Z";
  if (scenario === "unknown-type") last.type = "unsupported";
  if (scenario === "assistant-shape") last.message.content = [null];
  if (scenario.startsWith("assistant-") && scenario !== "assistant-shape")
    entries.push({
      ...last,
      id: "latest",
      parentId: last.id,
      message: { ...last.message, stopReason: scenario.slice(10) },
    });
  if (scenario === "empty-provider") last.message.provider = " ";
  if (scenario === "long-model") last.message.model = "x".repeat(257);
  if (scenario === "no-assistant") entries.pop();
  if (bytes === undefined) bytes = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await writeFile(h.file, bytes);
  expect(await resolveModel(h)).toBeUndefined();
});
it("uses only the latest completed assistant, ignoring later selection, usage and responseModel", async () => {
  const h = await readyFixture();
  const entries = structuredClone(h.entries) as Record<string, any>[];
  const last = entries[2]!;
  last.message.responseModel = "not-the-model-field";
  entries.push({
    ...last,
    id: "latest",
    parentId: last.id,
    message: {
      ...last.message,
      provider: "last-provider",
      model: "last-model",
      stopReason: "toolUse",
    },
  });
  entries.push({
    type: "model_change",
    id: "later-selection",
    parentId: "latest",
    timestamp: last.timestamp,
    provider: "selected-provider",
    modelId: "selected-model",
  });
  entries.push({
    type: "usage",
    id: "usage",
    parentId: "later-selection",
    timestamp: last.timestamp,
    provider: "usage-provider",
    model: "usage-model",
    kind: "cache_warm",
    usage: last.message.usage,
  });
  await h.save(entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  expect(await resolveModel(h)).toMatchObject({ provider: "last-provider", model: "last-model" });
});
it.each([
  "disposal",
  "replacement",
  "context-header",
  "context-file",
  "abort",
  "conflicting-event",
])("rejects %s across an awaited context boundary", async (scenario) => {
  const h = await readyFixture();
  let release!: () => void;
  const waiting = new Promise<void>((r) => {
    release = r;
  });
  h.setContextRead(async () => {
    await waiting;
    return h.context;
  });
  const controller = new AbortController();
  const result = h.reader.resolve(h.target, controller.signal);
  if (scenario === "disposal") h.reader.dispose();
  if (scenario === "replacement") h.replace();
  if (scenario === "context-header") h.context.sessionId = "foreign";
  if (scenario === "context-file") h.context.sessionFile = "/foreign";
  if (scenario === "abort") controller.abort();
  if (scenario === "conflicting-event")
    await h.emit("subagent:async-complete", { ...h.complete, success: false });
  release();
  expect(await result).toBeUndefined();
});
it("keeps one operation gate occupied after logical timeout, including absence probes", async () => {
  const h = await readyFixture();
  let calls = 0;
  let release!: () => void;
  const waiting = new Promise<void>((r) => {
    release = r;
  });
  h.setContextRead(async () => {
    calls++;
    await waiting;
    return h.context;
  });
  expect(await resolveModel(h)).toBeUndefined();
  expect(await resolveModel(h)).toBeUndefined();
  const secondRoot = join(h.base, "parent", "44444444-4444-4444-8444-444444444444");
  const secondId = "33333333-3333-4333-8333-333333333333";
  await mkdir(secondRoot);
  await h.emit("subagent:async-started", {
    ...h.start,
    id: secondId,
    sessionRoot: secondRoot,
    nestedRoute: { ...h.start.nestedRoute, rootRunId: "44444444-4444-4444-8444-444444444444" },
  });
  expect(calls).toBe(1);
  release();
  await new Promise((r) => setTimeout(r, 10));
  h.setContextRead(async () => h.context);
  expect(await resolveModel(h)).toMatchObject({ model: "child-actual" });
  const secondFile = join(secondRoot, "run-0", "session.jsonl");
  await mkdir(join(secondRoot, "run-0"));
  await writeFile(secondFile, h.entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  await h.emit("subagent:async-complete", {
    ...h.complete,
    runId: secondId,
    results: [{ ...h.complete.results[0]!, sessionFile: secondFile, sessionPath: secondFile }],
  });
  expect(h.ready).toEqual([asyncId]);
});
it("rechecks file stability after the final awaited runtime context check", async () => {
  const h = await readyFixture();
  let calls = 0;
  h.setContextRead(async () => {
    if (++calls === 2) await writeFile(h.file, "changed\n");
    return h.context;
  });
  expect(await resolveModel(h)).toBeUndefined();
});

it.each([
  "file-symlink",
  "directory-symlink",
  "hardlink",
  "world-writable-file",
  "world-writable-directory",
  "replaced-executor",
  "non-regular",
  "escape",
])("rejects %s filesystem routes", async (scenario) => {
  const h = await fixture();
  await h.emit(
    "subagent:async-started",
    scenario === "escape" ? { ...h.start, sessionRoot: h.root + "/../" + executorId } : h.start,
  );
  await h.save();
  const moved = join(h.base, "moved");
  if (scenario === "file-symlink") {
    await rename(h.file, moved);
    await symlink(moved, h.file);
  }
  if (scenario === "directory-symlink") {
    await rename(join(h.root, "run-0"), moved);
    await symlink(moved, join(h.root, "run-0"));
  }
  if (scenario === "hardlink") await link(h.file, moved);
  if (scenario === "world-writable-file") await chmod(h.file, 0o666);
  if (scenario === "world-writable-directory") await chmod(h.root, 0o777);
  if (scenario === "replaced-executor") {
    await rename(h.root, moved);
    await h.save();
  }
  if (scenario === "non-regular") {
    await rm(h.file);
    await mkdir(h.file);
  }
  await h.emit("subagent:async-complete", h.complete);
  expect(await resolveModel(h)).toBeUndefined();
});
it("accepts absence of the exact file when run-0 already exists", async () => {
  const h = await fixture();
  await mkdir(join(h.root, "run-0"));
  await h.emit("subagent:async-started", h.start);
  await h.save();
  await h.emit("subagent:async-complete", h.complete);
  expect(await resolveModel(h)).toMatchObject({ model: "child-actual" });
});
it("never rearms a rejected reused root even after its old file is removed", async () => {
  const h = await fixture(true);
  await h.emit("subagent:async-started", h.start);
  await rm(join(h.root, "run-0"), { recursive: true });
  const id = "33333333-3333-4333-8333-333333333333";
  await h.emit("subagent:async-started", { ...h.start, id });
  await h.save();
  await h.emit("subagent:async-complete", { ...h.complete, runId: id });
  expect(h.ready).toEqual([]);
});
it("saturates retained proof metadata without evicting or rearming routes", async () => {
  const h = await fixture();
  for (let i = 0; i < 63; i++) {
    const id = `${String(i).padStart(8, "0")}-4444-4444-8444-444444444444`;
    const root = join(
      h.base,
      "parent",
      `${String(i).padStart(8, "0")}-5555-4555-8555-555555555555`,
    );
    await mkdir(root, { recursive: true });
    await h.emit("subagent:async-started", {
      ...h.start,
      id,
      sessionRoot: root,
      nestedRoute: {
        ...h.start.nestedRoute,
        rootRunId: `${String(i).padStart(8, "0")}-5555-4555-8555-555555555555`,
      },
    });
  }
  await h.emit("subagent:async-started", h.start);
  await h.save();
  await h.emit("subagent:async-complete", h.complete);
  expect(h.ready).toEqual([]);
  expect(await resolveModel(h)).toBeUndefined();
});

it.each(["unknown-completion", "foreign-duplicate", "saturated-reuse"])(
  "invalidates active reads on %s",
  async (scenario) => {
    const h = await readyFixture();
    if (scenario === "saturated-reuse") {
      for (let i = 0; i < 63; i++)
        await h.emit("subagent:async-complete", {
          ...h.complete,
          runId: `${String(i).padStart(8, "0")}-4444-4444-8444-444444444444`,
          results: [{ ...h.complete.results[0]!, sessionFile: "/other", sessionPath: "/other" }],
        });
    }
    let release!: () => void;
    const waiting = new Promise<void>((r) => {
      release = r;
    });
    h.setContextRead(async () => {
      await waiting;
      return h.context;
    });
    const read = resolveModel(h);
    if (scenario === "unknown-completion")
      await h.emit("subagent:async-complete", {
        ...h.complete,
        runId: "33333333-3333-4333-8333-333333333333",
      });
    if (scenario === "foreign-duplicate")
      await h.emit("subagent:async-complete", { ...h.complete, sessionId: "/foreign" });
    if (scenario === "saturated-reuse")
      await h.emit("subagent:async-started", {
        ...h.start,
        id: "33333333-3333-4333-8333-333333333333",
      });
    release();
    expect(await read).toBeUndefined();
  },
);

it.each([false, true])(
  "does not repair or rewrite the owned session when truncated=%s",
  async (truncated) => {
    const h = await readyFixture();
    if (truncated) {
      const bytes = await readFile(h.file);
      await writeFile(h.file, bytes.subarray(0, -1));
    }
    const before = await readFile(h.file);
    const metadata = await stat(h.file);
    const started = Date.now();
    const model = await resolveModel(h);
    if (truncated) expect(model).toBeUndefined();
    else {
      expect(model).toMatchObject({ provider: "child-provider", model: "child-actual" });
      expect(model!.capturedAt).toBeGreaterThanOrEqual(started);
      expect(model!.capturedAt).toBeLessThanOrEqual(Date.now());
    }
    expect(await readFile(h.file)).toEqual(before);
    expect(await stat(h.file)).toMatchObject({
      ino: metadata.ino,
      size: metadata.size,
      mtimeMs: metadata.mtimeMs,
      ctimeMs: metadata.ctimeMs,
    });
  },
);

it("does not rearm a root first seen in a missed-start completion after its file is deleted", async () => {
  const h = await fixture(true);
  await h.emit("subagent:async-complete", h.complete);
  await rm(join(h.root, "run-0"), { recursive: true });
  const id = "33333333-3333-4333-8333-333333333333";
  await h.emit("subagent:async-started", { ...h.start, id });
  await h.save();
  await h.emit("subagent:async-complete", { ...h.complete, runId: id });
  expect(h.ready).toEqual([]);
  expect(
    await h.reader.resolve({ ...h.target, asyncId: id }, new AbortController().signal),
  ).toBeUndefined();
});
