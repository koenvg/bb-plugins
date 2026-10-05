import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  appendFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
assert.ok(Number(process.versions.node.split(".")[0]) >= 22);
const root = mkdtempSync(join(tmpdir(), "bbp19-bundle-"));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR,
  previousFetch = globalThis.fetch;
try {
  const agent = join(root, "agent"),
    dataDir = join(root, "host-data");
  mkdirSync(agent);
  mkdirSync(dataDir);
  process.env.PI_CODING_AGENT_DIR = agent;
  globalThis.fetch = async () => {
    throw Error("Network forbidden");
  };
  const artifact = join(root, "host.mjs");
  copyFileSync(new URL("../dist/host.js", import.meta.url), artifact);
  const bundled = await import(pathToFileURL(artifact).href);
  const signal = new AbortController().signal,
    context = {
      signal,
      lifecycle: { signal },
      experimental_paths: { dataDir, tempDir: join(root, "temp") },
    };
  assert.equal(
    (await bundled.default.handlers.collectorControl({ action: "install" }, context)).state,
    "available",
  );
  const event = (n, key, claim = null) => ({
    version: 1,
    eventId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    provenance: "observed",
    occurredAt: "2026-10-01T00:00:00.000Z",
    sessionId: "pi-not-provider",
    workspace: "/original",
    providerSessionKey: key,
    claimedThreadId: claim,
    provider: "openai-codex",
    model: "synthetic",
    inputTokens: 1,
    outputTokens: 2,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 1,
    totalTokens: 3,
    capturedCost: 0.001,
  });
  const records = [
    event(1, "provider-a.jsonl"),
    event(2, "provider-b.jsonl"),
    event(3, null, "thr_a"),
  ];
  writeFileSync(
    join(dataDir, "history/events-v1.jsonl"),
    records.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
  const rows = [
    {
      threadId: "thr_a",
      providerIdentity: "provider-a",
      title: "Synthetic thread",
      state: "available",
    },
    {
      threadId: "thr_a",
      providerIdentity: "provider-b",
      title: "Synthetic thread",
      state: "available",
    },
    { threadId: "thr_b", providerIdentity: null, title: "Shared path thread", state: "available" },
  ];
  const batch = (generation, rows, offset = 0, total = rows.length) => ({
    hostId: "host_synthetic",
    generation,
    rows,
    offset,
    total,
  });
  let view = await bundled.default.handlers.historyReadiness(
    { identities: batch(1, rows.slice(0, 1), 0, 3) },
    context,
  );
  assert.equal(view.collection.attribution.discovery, "partial");
  assert.deepEqual(view.collection.attribution.threads, []);
  view = await bundled.default.handlers.historyReadiness(
    { identities: batch(1, rows.slice(1), 1, 3) },
    context,
  );
  assert.equal(view.collection.attribution.threads[0].totalTokens, 6);
  assert.equal(
    view.collection.attribution.grades.find((g) => g.grade === "workspace-only").totalTokens,
    3,
  );
  assert.equal(view.collection.workspaces[0].totalTokens, 9);
  view = await bundled.default.handlers.historyReadiness({ identities: batch(2, []) }, context);
  assert.equal(view.collection.attribution.threads[0].label, "Unavailable thread thr_a");
  assert.equal(view.collection.attribution.threads[0].totalTokens, 6);
  const reopened = await import(pathToFileURL(artifact).href + "?reload=1");
  view = await reopened.default.handlers.historyReadiness({ identities: batch(2, []) }, context);
  assert.equal(view.collection.attribution.threads[0].totalTokens, 6);
  const db = await reopened.openHistoryDatabase(join(dataDir, "history/usage-v1.sqlite"), true);
  assert.equal(
    db.prepare("SELECT workspace FROM identity_usage LIMIT 1").get().workspace,
    "/original",
  );
  assert.equal(
    db.prepare("SELECT payload FROM usage_events WHERE event_id=?").get(records[0].eventId).payload,
    JSON.stringify(records[0]),
  );
  db.close();
  view = await reopened.default.handlers.historyReadiness(
    { identities: batch(3, [{ ...rows[0], threadId: "thr_b" }]) },
    context,
  );
  assert.equal(view.collection.attribution.threads[0].totalTokens, 3);
  assert.equal(
    view.collection.attribution.grades.find((g) => g.grade === "ambiguous").totalTokens,
    3,
  );
  assert.equal(view.collection.workspaces[0].totalTokens, 9);
  // Review regression: a fresh identical or title-only catalog must not restart 1000 usage rows.
  const cohort = Array.from({ length: 1000 }, (_, n) => event(n + 4, "provider-c.jsonl"));
  appendFileSync(
    join(dataDir, "history/events-v1.jsonl"),
    cohort.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
  const stable = [
    { ...rows[0], threadId: "thr_b" },
    { ...rows[0], threadId: "thr_c", providerIdentity: "provider-c" },
  ];
  for (let generation = 4; generation <= 10; generation++)
    view = await reopened.default.handlers.historyReadiness(
      { identities: batch(generation, stable) },
      context,
    );
  assert.equal(view.collection.attribution.backlog, false);
  assert.equal(
    view.collection.attribution.threads.find((r) => r.threadId === "thr_c").totalTokens,
    3000,
  );
  for (let generation = 11; generation <= 16; generation++) {
    view = await reopened.default.handlers.historyReadiness(
      {
        identities: batch(
          generation,
          stable.map((r) => ({ ...r, title: generation === 16 ? "Updated title" : r.title })),
        ),
      },
      context,
    );
    assert.equal(view.collection.attribution.backlog, false);
    assert.equal(
      view.collection.attribution.threads.find((r) => r.threadId === "thr_c").totalTokens,
      3000,
    );
  }
  assert.equal(
    view.collection.attribution.threads.find((r) => r.threadId === "thr_c").label,
    "Updated title",
  );
  console.log(
    "Packaged review regression: 1000-row bounded progress survives repeated catalog generations; unchanged and title-only refreshes do not invalidate verified totals.",
  );
  assert.equal(
    (await reopened.default.handlers.historyReadiness(null, context)).collection.attribution
      .discovery,
    "unknown",
  );
  console.log(
    "Packaged identity: real SQLite, complete-batch verification, distinct Pi/provider IDs, multiple identities, workspace-only claims, missing labels, durable reload, immutable workspace/payload and conflict exclusions passed. Node",
    process.versions.node,
  );
} finally {
  globalThis.fetch = previousFetch;
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  rmSync(root, { recursive: true, force: true });
}
