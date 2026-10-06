import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = mkdtempSync(join(tmpdir(), "graph-live-bundle-"));
const oldAgent = process.env.PI_CODING_AGENT_DIR;
const oldFetch = globalThis.fetch;
const NativeDate = Date;
const now = NativeDate.parse("2026-10-01T12:00:00Z");
let bundled;
try {
  globalThis.Date = class extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
    }
  };
  globalThis.fetch = async () => {
    throw Error("Network forbidden");
  };
  const agent = join(root, "agent"),
    dataDir = join(root, "data");
  mkdirSync(agent);
  mkdirSync(dataDir);
  process.env.PI_CODING_AGENT_DIR = agent;
  const artifact = join(root, "host.mjs");
  copyFileSync(new URL("../dist/host.js", import.meta.url), artifact);
  bundled = await import(pathToFileURL(artifact).href);
  const signal = new AbortController().signal;
  const context = {
    signal,
    lifecycle: { signal },
    experimental_paths: { dataDir, tempDir: join(root, "temp") },
  };
  // Fixture bootstrap only. Graph checks below never call management or install anything.
  const setup = await bundled.default.handlers.collectorControl({ action: "install" }, context);
  assert.equal(setup.state, "available");
  const directory = join(dataDir, "history"),
    path = join(directory, "usage-v1.sqlite");
  const control = readFileSync(join(directory, "collector-control-v1.json"));
  const identities = { hostId: "host_synthetic", generation: 1, offset: 0, total: 0, rows: [] };
  const query = {
    startDate: "2026-09-02",
    timezone: "UTC",
    group: "workspace",
    scope: { kind: "host" },
  };
  const calls = [];
  const call = (method, input) => {
    calls.push(method);
    return bundled.default.handlers[method](input, context);
  };
  const prepare = () => call("reportPreparation", { identities });
  const read = () => call("calendarReport", query);
  assert.equal((await prepare()).state, "available");
  assert.equal((await read()).summary.totalTokens, 0);
  const records = Array.from({ length: 501 }, (_, n) => ({
    version: 1,
    eventId: `00000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`,
    provenance: "observed",
    occurredAt: "2026-10-01T10:00:00.000Z",
    sessionId: "synthetic",
    workspace: "/original",
    providerSessionKey: null,
    claimedThreadId: null,
    provider: "openai-codex",
    model: "synthetic",
    inputTokens: 4,
    outputTokens: 3,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 7,
    capturedCost: 0.125,
  }));
  const source = join(directory, "events-v1-2026-10-01.jsonl");
  const confirmations = join(directory, "confirmations-v1-2026-10-01.jsonl");
  const confirmation = (r, n) => ({
    version: 1,
    eventId: r.eventId,
    sessionId: r.sessionId,
    entryId: `entry-${n + 1}`,
  });
  writeFileSync(source, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(
    confirmations,
    records.map((r, n) => JSON.stringify(confirmation(r, n))).join("\n") + "\n",
  );
  assert.equal((await read()).summary.totalTokens, 0, "Calendar reads must stay read-only");
  const progress = new Set();
  let batches = 0;
  for (;;) {
    const result = await prepare();
    assert.equal(result.state, "available");
    assert.equal(result.attribution.discovery, "complete");
    assert.equal(typeof result.ingestionPending, "boolean");
    assert.match(result.progress, /^[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(result).includes(records[0].eventId));
    progress.add(result.progress);
    batches++;
    if (!result.ingestionPending && !result.attribution.backlog) break;
    assert.ok(batches < 10, "Bounded preparation must settle this fixture");
  }
  assert.ok(batches >= 3);
  assert.equal(progress.size, batches);
  const report = await read();
  assert.equal(report.summary.totalTokens, 3507);
  assert.equal(report.summary.money.capturedCost, 62.625);
  assert.equal(report.days.at(-1).date, "2026-10-01");
  assert.equal(report.days.at(-1).totalTokens, 3507);
  assert.equal(report.days.at(-1).coverage.zero, false);
  assert.equal(report.state, "partial");
  const sources = [readFileSync(source), readFileSync(confirmations)];
  const unchanged = await prepare();
  assert.equal((await prepare()).progress, unchanged.progress);
  assert.deepEqual([readFileSync(source), readFileSync(confirmations)], sources);
  // Every request already reopens SQLite. Reload the complete artifact as well.
  await bundled.default.dispose();
  bundled = await import(pathToFileURL(artifact).href + "?reload=1");
  assert.deepEqual((await read()).summary, report.summary);
  appendFileSync(source, JSON.stringify(records[0]) + "\n");
  appendFileSync(confirmations, JSON.stringify(confirmation(records[0], 0)) + "\n");
  await prepare();
  assert.deepEqual((await read()).summary, report.summary);
  assert.deepEqual(readFileSync(join(directory, "collector-control-v1.json")), control);
  const db = await bundled.openHistoryDatabase(path, true);
  try {
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 4);
    assert.equal(db.prepare("SELECT count(*) AS n FROM usage_compact").get().n, 501);
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS n FROM usage_compact WHERE confirmed=1 AND captured_cost=0.125",
        )
        .get().n,
      501,
    );
  } finally {
    db.close();
  }
  // Prove the shipped offline upgrade against this owned legacy database.
  const legacy = await bundled.openHistoryDatabase(path);
  legacy.exec("DROP TABLE identity_uncertain");
  legacy.close();
  const beforeUpgrade = readFileSync(path);
  assert.equal((await prepare()).reason, "storage-incompatible");
  assert.deepEqual(readFileSync(path), beforeUpgrade);
  const packageDir = join(root, "upgrade-package");
  mkdirSync(join(packageDir, "scripts"), { recursive: true });
  mkdirSync(join(packageDir, "dist"));
  writeFileSync(join(packageDir, "package.json"), '{"type":"module"}');
  copyFileSync(artifact, join(packageDir, "dist", "host.js"));
  const upgradeScript = join(packageDir, "scripts", "upgrade-identity-storage.mjs");
  copyFileSync(new URL("./upgrade-identity-storage.mjs", import.meta.url), upgradeScript);
  const upgrade = (...args) =>
    spawnSync(process.execPath, [upgradeScript, "--data-dir", dataDir, ...args], {
      encoding: "utf8",
      timeout: 20_000,
    });
  let applied = upgrade();
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(JSON.parse(applied.stdout).state, "ready");
  assert.deepEqual(readFileSync(path), beforeUpgrade);
  applied = upgrade("--apply");
  assert.equal(applied.status, 1);
  assert.deepEqual(readFileSync(path), beforeUpgrade);
  applied = upgrade("--apply", "--backup", path);
  assert.equal(applied.status, 1);
  assert.deepEqual(readFileSync(path), beforeUpgrade);
  const historyAlias = join(root, "outside-alias");
  symlinkSync(directory, historyAlias);
  for (const parent of ["new-backups", "existing-backups"]) {
    if (parent === "existing-backups") mkdirSync(join(directory, parent), { mode: 0o700 });
    const aliasBackup = join(historyAlias, parent, "before.sqlite");
    applied = upgrade("--apply", "--backup", aliasBackup);
    assert.equal(applied.status, 1, "Reject a symlink ancestor into live history");
    assert.deepEqual(readFileSync(path), beforeUpgrade);
    assert.equal(existsSync(aliasBackup), false);
    if (parent === "new-backups") assert.equal(existsSync(join(directory, parent)), false);
  }
  mkdirSync(join(root, "private-backup"), { mode: 0o700 });
  const existingBackup = join(root, "private-backup", "existing.sqlite");
  writeFileSync(existingBackup, "keep this existing file", { mode: 0o600 });
  applied = upgrade("--apply", "--backup", existingBackup);
  assert.equal(applied.status, 1);
  assert.equal(readFileSync(existingBackup, "utf8"), "keep this existing file");
  assert.deepEqual(readFileSync(path), beforeUpgrade);
  const backupPath = join(root, "private-backup", "before.sqlite");
  applied = upgrade("--apply", "--backup", backupPath);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(JSON.parse(applied.stdout).state, "upgraded");
  const saved = await bundled.openHistoryDatabase(backupPath, true);
  assert.equal(saved.prepare("SELECT count(*) AS n FROM usage_compact").get().n, 501);
  assert.equal(
    saved.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='identity_uncertain'").get()
      .n,
    0,
  );
  saved.close();
  const savedBytes = readFileSync(backupPath);
  applied = upgrade("--apply", "--backup", backupPath);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(JSON.parse(applied.stdout).state, "current");
  assert.deepEqual(readFileSync(backupPath), savedBytes);
  for (let i = 0; i < 5; i++) {
    const result = await prepare();
    assert.equal(result.state, "available");
    if (!result.attribution.backlog && !result.ingestionPending) break;
    assert.ok(i < 4, "Upgraded preparation must settle");
  }
  assert.deepEqual((await read()).summary, report.summary);
  assert.deepEqual(readFileSync(join(directory, "collector-control-v1.json")), control);
  assert.ok(calls.every((method) => ["reportPreparation", "calendarReport"].includes(method)));
  console.log(
    `Packaged live graph refresh passed on Node ${process.versions.node}: ${batches} bounded batches, new confirmed records, original date/tokens/prices, read-only reports, no management calls after fixture setup, unchanged controls/logs, artifact reload and replay; legacy-layout rejection, explicit offline upgrade with private backup, idempotency and post-upgrade settlement. Synthetic only.`,
  );
} finally {
  await bundled?.default.dispose();
  globalThis.Date = NativeDate;
  globalThis.fetch = oldFetch;
  if (oldAgent === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = oldAgent;
  rmSync(root, { recursive: true, force: true });
}
