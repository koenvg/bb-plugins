import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
assert.ok(Number(process.versions.node.split(".")[0]) >= 22);
const liveOverlap = process.argv.includes("--live-overlap");
const root = mkdtempSync(join(tmpdir(), "bbp22-bundle-")),
  fetch = globalThis.fetch,
  agent = process.env.PI_CODING_AGENT_DIR;
try {
  const source = join(root, "configured-custom-source"),
    ordinary = join(root, "ordinary-workspace-sessions"),
    workspace = join(root, "workspace"),
    dataDir = join(root, "host-data");
  for (const p of [source, ordinary, workspace, dataDir, join(root, "agent")])
    mkdirSync(p);
  process.env.PI_CODING_AGENT_DIR = join(root, "agent");
  globalThis.fetch = async () => {
    throw Error("Network forbidden");
  };
  const artifact = join(root, "host.mjs");
  copyFileSync(new URL("../dist/host.js", import.meta.url), artifact);
  const bundle = await import(pathToFileURL(artifact).href);
  const lifecycle = new AbortController();
  let leases = 0;
  const context = {
    signal: lifecycle.signal,
    lifecycle: { signal: lifecycle.signal },
    experimental_paths: { dataDir, tempDir: join(root, "temp") },
    experimental_retainWorker() {
      leases++;
      let released = false;
      return {
        async dispose() {
          if (!released) {
            released = true;
            leases--;
          }
        },
      };
    },
  };
  const call = (b, command) =>
    b.default.handlers.historicalImport(
      { hostId: "host-synthetic", command, knownWorkspaces: [workspace] },
      context,
    );
  assert.equal(
    (await call(bundle, { action: "status" })).reason,
    "not-configured",
  );
  const now = Date.now() - 86400000,
    instant = new Date(now).toISOString();
  const header = (id, parentSession) => ({
    type: "session",
    version: 3,
    id,
    cwd: workspace,
    timestamp: instant,
    ...(parentSession ? { parentSession } : {}),
  });
  const message = (id, parentId = null) => ({
    type: "message",
    id,
    parentId,
    timestamp: instant,
    message: {
      role: "assistant",
      provider: "openai-codex",
      model: "synthetic",
      timestamp: now,
      content: "PRIVATE_PACKAGED_MESSAGE_TOOL_PROMPT",
      usage: {
        input: 2,
        output: 3,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 5,
        cost: { total: 0.02 },
      },
    },
  });
  const parent = join(source, "provider-a.jsonl");
  writeFileSync(
    parent,
    [header("pi-original"), message("entry-a")].map(JSON.stringify).join("\n") +
      "\n",
  );
  writeFileSync(
    join(ordinary, "fork.jsonl"),
    [
      header("pi-child", parent),
      message("entry-a"),
      message("child-entry", "entry-a"),
    ]
      .map(JSON.stringify)
      .join("\n") + "\n",
  );
  const configuration = {
    bbRoot: source,
    ordinaryRoots: [ordinary],
    workspaces: [workspace],
  };
  assert.equal(
    (await call(bundle, { action: "configure", configuration })).reason,
    "ok",
  );
  const identities = {
    hostId: "host-synthetic",
    generation: 1,
    offset: 0,
    total: 1,
    rows: [
      {
        providerIdentity: "provider-a",
        threadId: "thr_synthetic",
        title: "Synthetic",
        state: "available",
      },
    ],
  };
  assert.equal(
    (await bundle.default.handlers.historyReadiness({ identities }, context))
      .attribution.discovery,
    "complete",
  );
  let live;
  if (liveOverlap) {
    // Owned persistent fixture of a previously confirmed capture. This does not install or run a live collector.
    live = {
      version: 1,
      eventId: "00000000-0000-4000-8000-000000000001",
      provenance: "observed",
      occurredAt: instant,
      sessionId: "pi-original",
      workspace,
      providerSessionKey: "provider-a.jsonl",
      claimedThreadId: null,
      provider: "openai-codex",
      model: "synthetic",
      inputTokens: 2,
      outputTokens: 3,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      totalTokens: 5,
      capturedCost: 0.02,
    };
    const seed = await bundle.openHistoryDatabase(
      join(dataDir, "history/usage-v1.sqlite"),
    );
    try {
      const {
        eventId,
        provenance,
        providerSessionKey,
        claimedThreadId,
        ...evidence
      } = live;
      seed.transaction(() => {
        seed
          .prepare("INSERT INTO usage_events VALUES (?,?,?,?,?,1,1)")
          .run(eventId, live.sessionId, workspace, 5, JSON.stringify(live));
        seed
          .prepare("INSERT INTO usage_confirmations VALUES (?,?,?)")
          .run(eventId, live.sessionId, "entry-a");
        seed
          .prepare("INSERT INTO usage_entry_owners VALUES (?,?,?,?,0)")
          .run(live.sessionId, "entry-a", eventId, JSON.stringify(evidence));
        seed
          .prepare("INSERT INTO workspace_totals VALUES (?,5,1)")
          .run(workspace);
        seed
          .prepare(
            "UPDATE history_counters SET observed_events=observed_events+1 WHERE id=1",
          )
          .run();
      });
    } finally {
      seed.close();
    }
  }
  let v = await call(bundle, { action: "start" });
  assert.equal(v.generation.state, "stopped");
  assert.equal(v.generation.bytes, 0);
  assert.equal(leases, 0);
  const generation = v.generation.id,
    start = v.generation.startAt;
  const reload = await import(pathToFileURL(artifact).href + "?reload=1");
  v = await call(reload, { action: "status" });
  assert.equal(v.generation.id, generation);
  assert.equal(v.generation.bytes, 0);
  assert.equal(
    (await call(reload, { action: "configure", configuration })).reason,
    "unfinished-generation",
  );
  for (let i = 0; i < 20 && v.generation.state === "stopped"; i++) {
    v = await call(reload, { action: "resume" });
    assert.equal(leases, 0);
  }
  assert.equal(v.generation.state, "completed");
  assert.equal(v.generation.startAt, start);
  assert.equal(v.generation.omissions, 0);
  assert.equal(v.generation.replayed, 1);
  let db = await reload.openHistoryDatabase(
    join(dataDir, "history/usage-v1.sqlite"),
    true,
  );
  assert.equal(
    db.prepare("SELECT total_tokens FROM workspace_totals").get().total_tokens,
    10,
  );
  const records = db
    .prepare("SELECT payload FROM usage_events")
    .all()
    .map((r) => JSON.parse(r.payload));
  assert.equal(records.length, liveOverlap ? 3 : 2);
  if (liveOverlap) {
    assert.equal(
      db
        .prepare("SELECT payload FROM usage_events WHERE event_id=?")
        .get(live.eventId).payload,
      JSON.stringify(live),
    );
    assert.deepEqual(
      db
        .prepare(
          "SELECT DISTINCT event_id FROM import_entries WHERE entry='entry-a'",
        )
        .all()
        .map((r) => ({ ...r })),
      [{ event_id: live.eventId }],
    );
  }
  for (const r of records) {
    assert.equal(r.occurredAt, instant);
    assert.equal(r.capturedCost, 0.02);
    assert.equal(r.workspace, workspace);
  }
  assert.ok(!JSON.stringify(records).includes("PRIVATE_"));
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM collector_meta").get().n,
    0,
  );
  db.close();
  assert.ok(
    !readFileSync(join(dataDir, "history/usage-v1.sqlite")).includes(
      Buffer.from("PRIVATE_PACKAGED"),
    ),
  );
  await call(reload, { action: "start" });
  await call(reload, { action: "cancel" });
  assert.equal(
    (await call(reload, { action: "status" })).generation.state,
    "canceled",
  );
  assert.equal(
    (await call(reload, { action: "resume" })).reason,
    "no-generation",
  );
  // A named pipe on a direct BB candidate must not retain the worker or block the shared control queue.
  const { execFileSync } = await import("node:child_process");
  const { unlinkSync } = await import("node:fs");
  unlinkSync(parent);
  execFileSync("mkfifo", [parent]);
  v = await call(reload, { action: "start" });
  for (let i = 0; i < 20 && v.generation.state === "stopped"; i++)
    v = await call(reload, { action: "resume" });
  assert.equal(v.generation.state, "completed");
  assert.ok(v.generation.diagnostics.includes("missing-source"));
  await call(reload, { action: "cancel" });
  assert.equal(
    (await reload.default.handlers.historyReadiness(null, context)).storage,
    "compatible",
  );
  assert.equal(leases, 0);
  assert.equal(
    (await reload.default.handlers.quota({}, context)).reason,
    "auth-required",
  );
  lifecycle.abort();
  assert.equal(
    (await call(reload, { action: "start" })).reason,
    "selection-changed",
  );
  assert.equal(leases, 0);
  console.log(
    "Packaged import: explicit custom roots, import-only real SQLite, distinct provider/Pi IDs, verified fork ancestry and novel child, privacy, UTC/cost preservation, durable reload with no auto-resume, frozen generation, explicit cancel, quota isolation and lease/disposal passed. Node",
    liveOverlap
      ? "Combined confirmed live overlap/fork first-owner and FIFO queue recovery passed."
      : "FIFO queue recovery passed.",
    process.versions.node,
  );
} finally {
  globalThis.fetch = fetch;
  if (agent === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = agent;
  rmSync(root, { recursive: true, force: true });
}
