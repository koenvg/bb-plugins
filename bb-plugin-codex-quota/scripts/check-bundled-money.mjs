import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Owned synthetic package proof. No installed source, real capture, account or transcript access.
const root = mkdtempSync(join(tmpdir(), "bbp21-money-bundle-"));
const oldAgent = process.env.PI_CODING_AGENT_DIR,
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
const query = {
  startDate: "2026-09-01",
  timezone: "UTC",
  group: "workspace",
  scope: { kind: "host" },
};
const event = (n, cost, at = "2026-09-15T12:00:00.000Z", workspace = `/workspace-${n % 60}`) => ({
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
  totalTokens: 10,
  capturedCost: cost,
});
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
  await bundled.default.handlers.collectorControl({ action: "install" }, context);
  const historyDir = join(dataDir, "history"),
    path = join(historyDir, "usage-v1.sqlite");
  writeFileSync(
    join(historyDir, "events-v1.jsonl"),
    [
      ...Array.from({ length: 12060 }, (_, n) => event(n + 1, (n + 1) % 60 === 59 ? null : 1e9)),
      event(20001, Number.MIN_VALUE, "2026-08-05T12:00:00.000Z", "/tiny-original"),
    ]
      .map((value) => JSON.stringify(value))
      .join("\n") + "\n",
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
  assert.equal(report.summary.totalTokens, 120600);
  assert.equal(report.summary.activeEntities, 60);
  assert.deepEqual(report.summary.money, {
    state: "partial",
    capturedCost: 11859000000000,
    pricedRecords: 11859,
    records: 12060,
    pricedEntities: 59,
    reason: "missing-prices",
  });
  assert.deepEqual(report.days[14].money, report.summary.money);
  assert.equal(report.ranking.length, 50);
  const compared = await bundled.default.handlers.calendarReport(
    { ...query, comparison: true },
    context,
  );
  assert.deepEqual(compared.comparison.query, {
    ...query,
    startDate: "2026-08-02",
    comparison: true,
  });
  assert.equal(compared.comparison.observedAt, compared.observedAt);
  assert.equal(compared.comparison.percentage, null);
  assert.equal(compared.comparison.prior.summary.totalTokens, 10);
  assert.equal(compared.comparison.prior.summary.money.capturedCost, Number.MIN_VALUE);
  assert.equal(compared.comparison.reasons.tokens, "collection-unproved");
  assert.equal(compared.comparison.reasons.cost, "collection-unproved");
  assert.deepEqual(compared.summary.money, report.summary.money);
  const tinyQuery = {
    ...query,
    startDate: "2026-08-02",
    scope: { kind: "workspace", workspace: "/tiny-original" },
  };
  const tiny = await bundled.default.handlers.calendarReport(tinyQuery, context);
  assert.deepEqual(tiny.summary.money, {
    state: "available",
    capturedCost: Number.MIN_VALUE,
    pricedRecords: 1,
    records: 1,
    pricedEntities: 1,
    reason: "ok",
  });
  assert.deepEqual(tiny.days[3].classes, { state: "unavailable" });
  bundled = await import(pathToFileURL(artifact).href + "?reopen=1");
  assert.equal(
    (await bundled.default.handlers.calendarReport(tinyQuery, context)).summary.money.capturedCost,
    Number.MIN_VALUE,
  );
  clock = NativeDate.parse("2026-11-15T12:00:00Z");
  const dormant = await bundled.default.handlers.calendarReport(query, context);
  assert.deepEqual(dormant.summary.money, report.summary.money);
  assert.deepEqual(dormant.days[14].classes, { state: "unavailable" });
  const expiredPrior = await bundled.default.handlers.calendarReport(
    { ...query, comparison: true },
    context,
  );
  assert.deepEqual(expiredPrior.summary.money, report.summary.money);
  assert.deepEqual(expiredPrior.comparison.prior, {
    state: "unavailable",
    reason: "range-unavailable",
  });
  assert.equal(expiredPrior.comparison.reasons.tokens, "prior-unavailable");
  assert.deepEqual(readFileSync(path), bytes);
  assert.deepEqual(readFileSync(join(historyDir, "collector-control-v1.json")), control);
  assert.equal(
    (
      await bundled.default.handlers.calendarReport(
        { ...query, comparison: true },
        { ...context, signal: AbortSignal.abort() },
      )
    ).reason,
    "selection-changed",
  );
  clock = NativeDate.parse("2026-10-01T12:00:00Z");

  // Original import prices, including invalid/zero prices, enter the canonical index through real packaged handlers.
  const importedDir = join(root, "import-only"),
    source = join(root, "ordinary-source"),
    bbRoot = join(root, "bb-source");
  [importedDir, source, bbRoot].forEach((path) => mkdirSync(path));
  const prices = [4, 6, 0, -1, "invalid", null],
    workspaces = prices.map((_, n) => join(root, `owned-workspace-${n}`));
  workspaces.forEach((path) => mkdirSync(path));
  const importedContext = {
    ...context,
    experimental_paths: { dataDir: importedDir, tempDir: join(root, "import-temp") },
    experimental_retainWorker: () => ({ dispose: async () => {} }),
  };
  const command = (command) => ({ hostId: "host_synthetic", knownWorkspaces: workspaces, command });
  assert.equal(
    (
      await bundled.default.handlers.historicalImport(
        command({
          action: "configure",
          configuration: { bbRoot, ordinaryRoots: [source], workspaces },
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
  prices.forEach((cost, n) =>
    writeFileSync(
      join(source, `owned-${n}.jsonl`),
      [
        { type: "session", version: 3, id: `owned-session-${n}`, cwd: workspaces[n] },
        {
          type: "message",
          id: `entry-${n}`,
          parentId: null,
          message: {
            role: "assistant",
            provider: "openai-codex",
            model: "synthetic",
            timestamp: NativeDate.parse("2026-09-15T12:00:00Z"),
            usage: {
              input: 4,
              output: 6,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 10,
              cost: { total: cost },
            },
            content: "OWNED_SYNTHETIC_CONTENT",
          },
        },
      ]
        .map((value) => JSON.stringify(value))
        .join("\n") + "\n",
    ),
  );
  let imported = await bundled.default.handlers.historicalImport(
    command({ action: "start" }),
    importedContext,
  );
  for (let n = 0; n < 15 && imported.generation.state !== "completed"; n++)
    imported = await bundled.default.handlers.historicalImport(
      command({ action: "resume" }),
      importedContext,
    );
  assert.equal(imported.generation.state, "completed");
  const known = await bundled.default.handlers.calendarReport(query, importedContext);
  assert.equal(known.summary.totalTokens, 60);
  assert.equal(known.summary.activeEntities, 6);
  assert.equal(known.capture, "unconfirmed");
  assert.deepEqual(known.summary.money, {
    state: "partial",
    capturedCost: 10,
    pricedRecords: 2,
    records: 6,
    pricedEntities: 2,
    reason: "missing-prices",
  });
  assert.equal(known.days[14].coverage.state, "imported");
  const importedComparison = await bundled.default.handlers.calendarReport(
    { ...query, comparison: true },
    importedContext,
  );
  assert.equal(importedComparison.comparison.prior.coverage.backlog, false);
  assert.equal(importedComparison.comparison.prior.state, "unknown");
  assert.equal(importedComparison.comparison.prior.summary.money.capturedCost, null);
  assert.equal(importedComparison.comparison.reasons.tokens, "collection-unproved");
  assert.equal(importedComparison.comparison.percentage, null);
  const unpriced = await bundled.default.handlers.calendarReport(
    { ...query, scope: { kind: "workspace", workspace: workspaces[2] } },
    importedContext,
  );
  assert.equal(unpriced.summary.totalTokens, 10);
  assert.equal(unpriced.summary.money.capturedCost, null);
  assert.equal(unpriced.summary.money.state, "unavailable");
  assert.equal(unpriced.summary.money.pricedRecords, 0);
  assert.ok(
    !readFileSync(join(importedDir, "history/usage-v1.sqlite")).includes(
      Buffer.from("OWNED_SYNTHETIC_CONTENT"),
    ),
  );
  console.log(
    `Packaged captured-money/comparison proof passed on Node ${process.versions.node}: real SQLite/reopen, all 12,060 accepted records and 59 priced entities beyond top 50, large safe sum, minimum positive price after class expiry, original import prices, unpriced tokens, same-clock adjacent subtotals, expired prior preserving current, settled-import unknown prior, read-only facts/control and cancellation. Synthetic only. Active percentages remain unavailable; no canonical money-overflow ledger proof.`,
  );
} finally {
  globalThis.Date = NativeDate;
  globalThis.fetch = oldFetch;
  if (oldAgent === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = oldAgent;
  rmSync(root, { recursive: true, force: true });
}
