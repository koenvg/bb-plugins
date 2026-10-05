import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
assert.ok(Number(process.versions.node.split(".")[0]) >= 22);
const root = mkdtempSync(join(tmpdir(), "bbp20-calendar-bundle-")),
  oldAgent = process.env.PI_CODING_AGENT_DIR,
  oldFetch = globalThis.fetch,
  NativeDate = globalThis.Date;
let clock = NativeDate.parse("2026-10-01T12:00:00Z");
class FixtureDate extends NativeDate {
  constructor(...args) {
    super(...(args.length ? args : [clock]));
  }
  static now() {
    return clock;
  }
}
function event(n, at = "2026-09-15T12:00:00.000Z", workspace = `/workspace-${n % 60}`, total = 10) {
  return {
    version: 1,
    eventId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    provenance: "observed",
    occurredAt: at,
    sessionId: "synthetic",
    workspace,
    providerSessionKey: null,
    claimedThreadId: null,
    provider: "openai-codex",
    model: "synthetic",
    inputTokens: 4,
    outputTokens: 6,
    cacheReadTokens: 2,
    cacheWriteTokens: 0,
    reasoningTokens: 3,
    totalTokens: total,
    capturedCost: n === 1 ? 0.123 : null,
  };
}
try {
  globalThis.Date = FixtureDate;
  globalThis.fetch = async () => {
    throw Error("Network forbidden");
  };
  const agent = join(root, "agent");
  mkdirSync(agent);
  process.env.PI_CODING_AGENT_DIR = agent;
  const artifact = join(root, "host.mjs");
  copyFileSync(new URL("../dist/host.js", import.meta.url), artifact);
  let bundled = await import(pathToFileURL(artifact).href);
  const signal = new AbortController().signal;
  const dataDir = join(root, "data");
  mkdirSync(dataDir);
  const context = {
    signal,
    lifecycle: { signal },
    experimental_paths: { dataDir, tempDir: join(root, "temp") },
  };
  const query = {
    startDate: "2026-09-01",
    timezone: "UTC",
    group: "workspace",
    scope: { kind: "host" },
  };
  assert.equal(
    (await bundled.default.handlers.calendarReport(query, context)).reason,
    "not-configured",
  );
  await bundled.default.handlers.collectorControl({ action: "install" }, context);
  const historyDir = join(dataDir, "history"),
    path = join(historyDir, "usage-v1.sqlite");
  writeFileSync(
    join(historyDir, "events-v1.jsonl"),
    Array.from({ length: 12060 }, (_, n) => JSON.stringify(event(n + 1))).join("\n") +
      "\n" +
      JSON.stringify(event(20000, "2026-08-05T12:00:00.000Z", "/expired", 17)) +
      "\n",
  );
  let ready;
  for (let n = 0; n < 80; n++) {
    ready = await bundled.default.handlers.historyReadiness(null, context);
    if (!ready.collection.backlog) break;
  }
  assert.equal(ready.collection.backlog, false);
  const bytes = readFileSync(path),
    control = readFileSync(join(historyDir, "collector-control-v1.json"));
  const report = await bundled.default.handlers.calendarReport(query, context);
  assert.equal(report.state, "partial");
  assert.deepEqual(report.summary, {
    totalTokens: 120600,
    activeEntities: 60,
    excludedTokens: 0,
    money: {
      state: "partial",
      capturedCost: 0.123,
      pricedRecords: 1,
      records: 12060,
      pricedEntities: 1,
      reason: "missing-prices",
    },
  });
  assert.equal(report.days.length, 30);
  assert.equal(report.ranking.length, 50);
  assert.equal(report.truncated, true);
  assert.equal(report.next, false);
  assert.deepEqual(report.days[14].classes, {
    state: "available",
    input: 48240,
    output: 72360,
    reasoning: 36180,
    cacheRead: 24120,
    cacheWrite: 0,
  });
  assert.deepEqual(report.days[14].money, report.summary.money);
  assert.equal(report.ranking.find((row) => row.key === "/workspace-1").money.capturedCost, 0.123);
  assert.equal(
    report.days[0].money.capturedCost,
    null,
    "Uncovered empty date must not become monetary zero",
  );
  assert.deepEqual(readFileSync(path), bytes, "Report aggregation must not rewrite history");
  assert.deepEqual(readFileSync(join(historyDir, "collector-control-v1.json")), control);
  const old = await bundled.default.handlers.calendarReport(
    { ...query, startDate: "2026-08-02" },
    context,
  );
  assert.equal(old.days[3].totalTokens, 17);
  assert.deepEqual(old.days[3].classes, { state: "unavailable" });
  const db = await bundled.openHistoryDatabase(path, true);
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 4);
  assert.equal(
    db.prepare("SELECT captured_cost FROM usage_compact WHERE event_id=?").get(event(1).eventId)
      .captured_cost,
    0.123,
  );
  const plan = JSON.stringify(
    db
      .prepare(
        "EXPLAIN QUERY PLAN SELECT sum(total),count(DISTINCT workspace) FROM usage_compact WHERE accepted=1 AND occurred_at>=? AND occurred_at<?",
      )
      .all("2026-09-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"),
  );
  assert.ok(plan.includes("compact_accepted_date"));
  db.close();
  bundled = await import(pathToFileURL(artifact).href + "?reload=1");
  assert.equal(
    (await bundled.default.handlers.calendarReport(query, context)).summary.totalTokens,
    120600,
  );
  const canceled = { ...context, signal: AbortSignal.abort() };
  assert.equal(
    (await bundled.default.handlers.calendarReport(query, canceled)).reason,
    "selection-changed",
  );
  // Review regressions: established-control safety and dormant logical expiry, without readiness.
  const controlPath = join(historyDir, "collector-control-v1.json");
  for (const broken of ["{", null]) {
    if (broken === null) rmSync(controlPath);
    else writeFileSync(controlPath, broken);
    assert.deepEqual(await bundled.default.handlers.calendarReport(query, context), {
      state: "unavailable",
      reason: "storage-unavailable",
    });
    assert.deepEqual(readFileSync(path), bytes, "Unsafe control must not trigger database writes");
  }
  writeFileSync(controlPath, control);
  clock = NativeDate.parse("2026-11-15T12:00:00Z");
  const dormant = await bundled.default.handlers.calendarReport(query, context);
  assert.equal(dormant.summary.totalTokens, 120600);
  assert.deepEqual(dormant.days[14].classes, { state: "unavailable" });
  assert.equal(dormant.previous, false);
  assert.equal(dormant.compactFrom, "2026-08-06T00:00:00.000Z");
  clock = NativeDate.parse("2027-02-01T12:00:00Z");
  assert.deepEqual(await bundled.default.handlers.calendarReport(query, context), {
    state: "unavailable",
    reason: "range-unavailable",
  });
  assert.equal(
    (await bundled.default.handlers.calendarReport({ ...query, startDate: "2026-11-01" }, context))
      .compactFrom,
    "2026-10-23T00:00:00.000Z",
  );
  assert.deepEqual(readFileSync(path), bytes, "Logical expiry must remain read-only");
  assert.deepEqual(readFileSync(controlPath), control);
  clock = NativeDate.parse("2026-10-01T12:00:00Z");
  // Import-only public handlers, scoped ledger and no collector installation.
  const importedDir = join(root, "import-only"),
    source = join(root, "source"),
    bbSource = join(root, "bb-source"),
    workspace = join(root, "workspace");
  mkdirSync(importedDir);
  mkdirSync(source);
  mkdirSync(bbSource);
  mkdirSync(workspace);
  const importedContext = {
    ...context,
    experimental_paths: { dataDir: importedDir, tempDir: join(root, "import-temp") },
    experimental_retainWorker: () => ({ dispose: async () => {} }),
  };
  const command = (command) => ({
    hostId: "host_synthetic",
    knownWorkspaces: [workspace],
    command,
  });
  assert.equal(
    (
      await bundled.default.handlers.historicalImport(
        command({
          action: "configure",
          configuration: { bbRoot: bbSource, ordinaryRoots: [source], workspaces: [workspace] },
        }),
        importedContext,
      )
    ).reason,
    "ok",
  );
  await bundled.default.handlers.historyReadiness(
    { identities: { hostId: "host_synthetic", generation: 1, offset: 0, total: 0, rows: [] } },
    importedContext,
  );
  writeFileSync(
    join(source, "owned.jsonl"),
    [
      JSON.stringify({
        type: "session",
        version: 3,
        id: "owned-session",
        cwd: workspace,
        timestamp: "2026-09-15T12:00:00.000Z",
      }),
      JSON.stringify({
        type: "message",
        id: "entry",
        parentId: null,
        message: {
          role: "assistant",
          provider: "openai-codex",
          model: "synthetic",
          timestamp: NativeDate.parse("2026-09-15T12:00:00Z"),
          usage: {
            input: 4,
            output: 6,
            cacheRead: 2,
            cacheWrite: 0,
            totalTokens: 10,
            cost: { total: 0 },
          },
          content: "OWNED_SYNTHETIC_CONTENT",
        },
      }),
    ].join("\n") + "\n",
  );
  let imported = await bundled.default.handlers.historicalImport(
    command({ action: "start" }),
    importedContext,
  );
  for (let n = 0; n < 10 && imported.generation.state !== "completed"; n++)
    imported = await bundled.default.handlers.historicalImport(
      command({ action: "resume" }),
      importedContext,
    );
  assert.equal(imported.generation.state, "completed");
  const importedReport = await bundled.default.handlers.calendarReport(query, importedContext);
  assert.equal(importedReport.summary.totalTokens, 10);
  assert.equal(importedReport.capture, "unconfirmed");
  assert.equal(importedReport.state, "partial");
  assert.equal(importedReport.days[14].coverage.zero, false);
  assert.deepEqual(importedReport.summary.money, {
    state: "unavailable",
    capturedCost: null,
    pricedRecords: 0,
    records: 1,
    pricedEntities: 0,
    reason: "missing-prices",
  });
  assert.ok(
    !readFileSync(join(importedDir, "history/usage-v1.sqlite")).includes(
      Buffer.from("OWNED_SYNTHETIC_CONTENT"),
    ),
  );
  console.log(
    `Packaged calendar proof passed on Node ${process.versions.node}: persistent reopen, 12,060 records/60 entities, indexed full aggregates, top-50 bounds, expired classes, original cost/schema/control unchanged, cancellation, invalid/missing established control, dormant logical expiry and import-only partial reporting. Synthetic only.`,
  );
} finally {
  globalThis.Date = NativeDate;
  globalThis.fetch = oldFetch;
  if (oldAgent === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = oldAgent;
  rmSync(root, { recursive: true, force: true });
}
