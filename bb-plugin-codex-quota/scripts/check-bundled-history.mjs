import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  copyFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
// BB's public guide specifies a Node 22 ESM host artifact. Copy it away from package dependencies.
assert.ok(Number(process.versions.node.split(".")[0]) >= 22, "Node host runtime required");
const root = mkdtempSync(join(tmpdir(), "bbp17-bundle-"));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const previousFetch = globalThis.fetch;
try {
  const agentDir = join(root, "agent");
  const dataDir = join(root, "host-data");
  const cwd = join(root, "workspace");
  mkdirSync(cwd);
  mkdirSync(agentDir);
  mkdirSync(dataDir);
  process.env.PI_CODING_AGENT_DIR = agentDir;
  globalThis.fetch = async () => {
    throw Error("Network is forbidden in this proof");
  };
  const artifact = join(root, "host.mjs");
  copyFileSync(new URL("../dist/host.js", import.meta.url), artifact);
  const bundled = await import(pathToFileURL(artifact).href);
  const signal = new AbortController().signal;
  const context = {
    signal,
    lifecycle: { signal },
    experimental_paths: { dataDir, tempDir: join(root, "temp") },
  };
  const initial = await bundled.default.handlers.historyReadiness(null, context);
  assert.equal(initial.state, "not-configured");
  assert.equal(initial.storage, "unconfigured");
  assert.equal(initial.collector, "missing");
  assert.deepEqual(readdirSync(dataDir), []);
  assert.deepEqual(readdirSync(agentDir), []);

  mkdirSync(join(dataDir, "history"));
  const path = join(dataDir, "history/usage-v1.sqlite");
  let db = await bundled.openHistoryDatabase(path);
  assert.ok(db, "Real host SQLite adapter must be available");
  db.exec(
    "PRAGMA user_version = 1; CREATE TABLE persistence_proof (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
  );
  db.transaction(() =>
    db.prepare("INSERT INTO persistence_proof VALUES (?, ?)").run(1, "committed"),
  );
  assert.throws(() =>
    db.transaction(() => {
      db.prepare("INSERT INTO persistence_proof VALUES (?, ?)").run(2, "rolled-back");
      throw Error("rollback");
    }),
  );
  db.close();
  assert.ok(readFileSync(path).length > 0);
  db = await bundled.openHistoryDatabase(path, true);
  assert.deepEqual(
    { ...db.prepare("SELECT * FROM persistence_proof WHERE id = ?").get(1) },
    { id: 1, value: "committed" },
  );
  assert.equal(db.prepare("SELECT count(*) AS count FROM persistence_proof").get().count, 1);
  db.close();
  const beforeUnknown = readFileSync(path);
  assert.equal(
    (await bundled.default.handlers.historyReadiness(null, context)).storage,
    "incompatible",
  );
  assert.deepEqual(
    readFileSync(path),
    beforeUnknown,
    "Known version with unknown table layout is protected",
  );
  renameSync(path, join(root, "adapter-persistence-proof.sqlite")); // Owned fixture, separate from real history.
  console.log(
    "Packaged Node host: create/commit/rollback/close/reopen/query passed with persistent temporary SQLite. Runtime:",
    process.versions.node,
  );

  // Only this isolated fixture installs an asset. Production readiness has no install path.
  const extension = join(agentDir, "extensions/bb-codex-usage");
  mkdirSync(extension, { recursive: true });
  const unrelated = join(agentDir, "extensions/unrelated.js");
  const unrelatedSource =
    'export default function other(pi) { pi.on("session_shutdown", () => {}); }\n';
  writeFileSync(unrelated, unrelatedSource);
  const settings = JSON.stringify({
    extensions: ["./extensions/unrelated.js"],
    customSetting: "preserved",
  });
  writeFileSync(join(agentDir, "settings.json"), settings);
  const installed = await bundled.default.handlers.collectorControl({ action: "install" }, context);
  assert.equal(installed.state, "available");
  assert.equal(installed.writer, "unconfirmed");
  assert.equal(installed.collection.enabled, true);
  const firstBoundary = installed.collection.firstObservedAt;
  const loaderOutput = execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL("./check-collector-loading.mjs", import.meta.url)),
      agentDir,
      cwd,
      dataDir,
    ],
    { stdio: "pipe", env: { ...process.env, HOME: root, PI_CODING_AGENT_DIR: agentDir } },
  );
  console.log(loaderOutput.toString("utf8").trim());
  assert.equal(readFileSync(unrelated, "utf8"), unrelatedSource);
  assert.equal(readFileSync(join(agentDir, "settings.json"), "utf8"), settings);
  assert.deepEqual(readdirSync(dataDir), ["history"]);
  assert.equal(
    (await bundled.default.handlers.historyReadiness(null, context)).collector,
    "compatible-v1",
  );
  const collected = await bundled.default.handlers.historyReadiness(null, context);
  assert.equal(collected.writer, "observed");
  assert.equal(collected.collection.workspaces[0].totalTokens, 9);
  await bundled.default.handlers.collectorControl({ action: "repair" }, context);
  const repaired = await bundled.default.handlers.historyReadiness(null, context);
  assert.equal(repaired.collection.firstObservedAt, firstBoundary);
  assert.equal(repaired.collection.enabled, false);
  // Lower UUID replay keeps the first owner. Conflicting values are excluded, not selected by UUID.
  const eventLog = join(
    dataDir,
    `history/events-v1-${new Date().toISOString().slice(0, 10)}.jsonl`,
  );
  const confirmationLog = join(
    dataDir,
    `history/confirmations-v1-${new Date().toISOString().slice(0, 10)}.jsonl`,
  );
  const original = JSON.parse(readFileSync(eventLog, "utf8").split("\n")[0]);
  const binding = readFileSync(confirmationLog, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .find((row) => row.eventId === original.eventId);
  const { appendFileSync, unlinkSync } = await import("node:fs");
  const replayId = "00000000-0000-4000-8000-000000000101";
  appendFileSync(eventLog, JSON.stringify({ ...original, eventId: replayId }) + "\n");
  appendFileSync(confirmationLog, JSON.stringify({ ...binding, eventId: replayId }) + "\n");
  assert.equal(
    (await bundled.default.handlers.historyReadiness(null, context)).collection.workspaces[0]
      .totalTokens,
    9,
  );
  const conflictId = "00000000-0000-4000-8000-000000000102";
  appendFileSync(
    eventLog,
    JSON.stringify({
      ...original,
      eventId: conflictId,
      workspace: "/synthetic-conflict",
      totalTokens: 9,
    }) + "\n",
  );
  appendFileSync(confirmationLog, JSON.stringify({ ...binding, eventId: conflictId }) + "\n");
  const conflicted = await bundled.default.handlers.historyReadiness(null, context);
  assert.equal(conflicted.collection.conflictingEntries, 1);
  assert.equal(conflicted.collection.workspaces[0].totalTokens, 6);
  const projection = await bundled.openHistoryDatabase(path, true);
  assert.equal(
    projection
      .prepare("SELECT event_id FROM usage_entry_owners WHERE session_id=? AND entry_id=?")
      .get(binding.sessionId, binding.entryId).event_id,
    original.eventId,
  );
  const plan = JSON.stringify(
    projection
      .prepare(
        "EXPLAIN QUERY PLAN SELECT workspace,total_tokens,events FROM workspace_totals ORDER BY total_tokens DESC,workspace LIMIT 51",
      )
      .all(),
  );
  assert.ok(plan.includes("workspace_ranking"));
  assert.ok(!plan.includes("TEMP B-TREE"));
  assert.ok(!plan.includes("usage_events"));
  projection.close();
  // Missing control on an established paused installation stays missing and fail-closed.
  const controlPath = join(dataDir, "history/collector-control-v1.json");
  const pausedControl = readFileSync(controlPath);
  unlinkSync(controlPath);
  for (const action of ["repair", "install", "resume"])
    assert.equal(
      (await bundled.default.handlers.collectorControl({ action }, context)).state,
      "unavailable",
    );
  assert.ok(!readdirSync(join(dataDir, "history")).includes("collector-control-v1.json"));
  writeFileSync(controlPath, pausedControl);
  console.log(
    "Packaged review regressions: lost paused control fails closed; stable replay ownership/conflict exclusion and indexed persistent totals passed.",
  );
  // Reload the copied self-contained module and verify durable source progress/totals.
  const reopened = await import(pathToFileURL(artifact).href + "?reload=1");
  assert.equal(
    (await reopened.default.handlers.historyReadiness(null, context)).collection.workspaces[0]
      .totalTokens,
    6,
  );
  // Approved retirement control, only against the owned legacy fixture below.
  const legacyEvent = {
    ...original,
    eventId: "00000000-0000-4000-8000-000000000301",
    sessionId: "synthetic-legacy",
    occurredAt: new Date(Date.now() - 3600000).toISOString(),
    workspace: "/legacy-original",
    capturedCost: 0.456,
  };
  const expiredLegacy = {
    ...legacyEvent,
    eventId: "00000000-0000-4000-8000-000000000302",
    occurredAt: new Date(Date.now() - 60 * 86400000).toISOString(),
  };
  const legacyBody = JSON.stringify(legacyEvent) + "\n",
    expiredBody = JSON.stringify(expiredLegacy) + "\n";
  const legacyDirectory = join(dataDir, "history"),
    legacyEvents = join(legacyDirectory, "events-v1.jsonl"),
    legacyConfirmations = join(legacyDirectory, "confirmations-v1.jsonl");
  writeFileSync(legacyEvents, legacyBody + expiredBody);
  const keptConfirmation =
    JSON.stringify({
      version: 1,
      eventId: legacyEvent.eventId,
      sessionId: legacyEvent.sessionId,
      entryId: "retained-entry",
    }) + "\n";
  writeFileSync(
    legacyConfirmations,
    keptConfirmation +
      JSON.stringify({
        version: 1,
        eventId: expiredLegacy.eventId,
        sessionId: expiredLegacy.sessionId,
        entryId: "expired-entry",
      }) +
      "\n",
  );
  await reopened.default.handlers.collectorControl({ action: "pause" }, context);
  const prepared = await reopened.default.handlers.collectorControl(
    { action: "prepare-legacy" },
    context,
  );
  assert.equal(prepared.health.legacyRetirement.phase, "awaiting-confirmation");
  assert.equal(
    (
      await reopened.default.handlers.collectorControl(
        {
          action: "retire-legacy",
          confirmation: {
            token: "00000000-0000-4000-8000-000000000399",
            legacyWritersStopped: true,
          },
        },
        context,
      )
    ).reason,
    "retirement-incomplete",
  );
  assert.equal(readFileSync(legacyEvents, "utf8"), legacyBody + expiredBody);
  let retired = await reopened.default.handlers.collectorControl(
    {
      action: "retire-legacy",
      confirmation: { token: prepared.health.legacyRetirement.token, legacyWritersStopped: true },
    },
    context,
  );
  for (let step = 0; step < 10 && retired.health.legacyRetirement.phase !== "complete"; step++)
    retired = await reopened.default.handlers.historyReadiness(null, context);
  assert.equal(retired.health.legacyRetirement.phase, "complete");
  assert.equal(retired.collection.enabled, false);
  assert.equal(
    readFileSync(join(legacyDirectory, "events-legacy-retained-v1.jsonl"), "utf8"),
    legacyBody,
  );
  assert.equal(
    readFileSync(join(legacyDirectory, "confirmations-legacy-retained-v1.jsonl"), "utf8"),
    keptConfirmation,
  );
  assert.ok(!readdirSync(legacyDirectory).includes("events-v1.jsonl"));
  assert.ok(!readdirSync(legacyDirectory).includes("confirmations-v1.jsonl"));
  const legacyReload = await import(pathToFileURL(artifact).href + "?legacy-reload=1");
  assert.equal(
    (await legacyReload.default.handlers.historyReadiness(null, context)).health.legacyRetirement
      .phase,
    "complete",
  );
  const legacyDb = await bundled.openHistoryDatabase(path, true);
  assert.deepEqual(
    {
      ...legacyDb
        .prepare("SELECT occurred_at,workspace,captured_cost FROM usage_compact WHERE event_id=?")
        .get(legacyEvent.eventId),
    },
    { occurred_at: legacyEvent.occurredAt, workspace: legacyEvent.workspace, captured_cost: 0.456 },
  );
  assert.equal(
    legacyDb
      .prepare("SELECT event_id FROM usage_entry_owners WHERE session_id=? AND entry_id=?")
      .get(legacyEvent.sessionId, "retained-entry").event_id,
    legacyEvent.eventId,
  );
  assert.equal(legacyDb.prepare("PRAGMA user_version").get().user_version, 4);
  legacyDb.close();
  console.log(
    "Packaged legacy retirement: paused fresh consent, invalid-token rejection, bounded tail/copy, original body/time/workspace/cost/ownership and disabled durable reopen passed. Synthetic only.",
  );
  // Retention/recovery proof uses only owned persistent fixture data, never installed user storage.
  const oldTime = new Date(Date.now() - 60 * 86400000).toISOString();
  const oldId = "00000000-0000-4000-8000-000000000123";
  appendFileSync(
    eventLog,
    JSON.stringify({
      ...original,
      eventId: oldId,
      sessionId: "retained-session",
      workspace: "/retained-original",
      occurredAt: oldTime,
      totalTokens: 17,
      capturedCost: 0.321,
    }) + "\n",
  );
  const retained = await reopened.default.handlers.historyReadiness(null, context);
  assert.equal(
    retained.collection.workspaces.find((row) => row.workspace === "/retained-original")
      .totalTokens,
    17,
  );
  let retainedDb = await bundled.openHistoryDatabase(path, true);
  assert.equal(
    retainedDb.prepare("SELECT count(*) AS n FROM usage_events WHERE event_id=?").get(oldId).n,
    0,
  );
  assert.equal(
    retainedDb.prepare("SELECT captured_cost FROM usage_compact WHERE event_id=?").get(oldId)
      .captured_cost,
    0.321,
  );
  const owner = retainedDb
    .prepare("SELECT recorded_host FROM usage_compact WHERE event_id=?")
    .get(oldId).recorded_host;
  retainedDb.close();
  writeFileSync(path, "confirmed-corrupt-fixture");
  writeFileSync(path + "-wal", "fixture-sidecar");
  const recovered = await reopened.default.handlers.historyReadiness(null, context);
  assert.equal(recovered.health.state, "recovered");
  assert.equal(recovered.health.recoveryGaps.length, 1);
  assert.equal(
    recovered.collection.workspaces.some((row) => row.workspace === "/retained-original"),
    false,
    "Expired detail sources are not permitted recovery input",
  );
  const quarantine = readdirSync(join(dataDir, "history")).find((name) =>
    name.startsWith("quarantine-"),
  );
  assert.equal(
    readFileSync(join(dataDir, "history", quarantine, "usage-v1.sqlite-wal"), "utf8"),
    "fixture-sidecar",
  );
  retainedDb = await bundled.openHistoryDatabase(path, true);
  assert.equal(
    retainedDb.prepare("SELECT host_key FROM history_owner WHERE id=1").get().host_key,
    owner,
  );
  retainedDb.close();
  console.log(
    "Packaged BBP-23: expired classes absent, compact original tokens/cost/host retained, confirmed corruption and sidecar quarantine, retained-source-only rebuild and lost interval passed.",
  );
  console.log(
    "Packaged host controls and real persistent reconciliation/reload passed. Synthetic only; live capture is not proved.",
  );
} finally {
  globalThis.fetch = previousFetch;
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  rmSync(root, { recursive: true, force: true });
}
