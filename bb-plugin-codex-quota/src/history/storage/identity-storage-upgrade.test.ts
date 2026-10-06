import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { upgradeRetainedIdentityStorage } from "./identity-storage-upgrade.js";
import {
  openHistoryDatabase,
  loadHistoryStorage,
  type HistoryDatabase,
} from "./history-storage.js";
import { initializeHistory, projectCompactRecord } from "./history-projection.js";
import { maintainHistory } from "./history-retention.js";
import { acceptIdentityBatch, reconcileIdentity } from "../identity/identity-storage.js";
import { createHostHistory } from "../history-host.js";
import { usageRecordSchema } from "../collection/usage-record.js";

const roots: string[] = [];
const now = Date.parse("2026-10-01T12:00:00Z");
const signal = () => new AbortController().signal;
const row = {
  threadId: "thr_synthetic",
  providerIdentity: "provider",
  title: "Synthetic",
  state: "available" as const,
};
afterEach(async () => {
  for (const p of roots.splice(0)) await rm(p, { recursive: true, force: true });
});
async function fixture(collector = true) {
  const dataDir = await mkdtemp(join(tmpdir(), "identity-upgrade-"));
  roots.push(dataDir);
  const directory = join(dataDir, "history");
  await mkdir(directory);
  const path = join(directory, "usage-v1.sqlite");
  const db = (await openHistoryDatabase(path))!;
  initializeHistory(db, new Date(now).toISOString(), collector);
  maintainHistory(db, now);
  projectCompactRecord(
    db,
    usageRecordSchema.parse({
      version: 1,
      eventId: "00000000-0000-4000-8000-000000000001",
      provenance: "observed",
      occurredAt: "2026-10-01T10:00:00.000Z",
      sessionId: "session",
      workspace: "/original",
      providerSessionKey: "provider.jsonl",
      claimedThreadId: "thr_synthetic",
      provider: "openai-codex",
      model: "synthetic",
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      totalTokens: 3,
      capturedCost: 0.125,
    }),
  );
  acceptIdentityBatch(db, { hostId: "host_a", generation: 1, offset: 0, total: 1, rows: [row] });
  reconcileIdentity(db, signal());
  db.exec("DROP TABLE identity_uncertain");
  db.close();
  if (collector)
    await writeFile(
      join(directory, "collector-control-v1.json"),
      JSON.stringify({
        protocol: 2,
        enabled: false,
        revision: "00000000-0000-4000-8000-000000000003",
      }),
    );
  await writeFile(join(directory, "events-v1-2026-10-01.jsonl"), "not read during upgrade\n");
  return { dataDir, directory, path };
}
function snapshot(db: HistoryDatabase) {
  const names = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('identity_receipt','identity_uncertain') ORDER BY name",
    )
    .all() as { name: string }[];
  return names.map(({ name }) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]);
}
it("inspects legacy storage without mutation, preserves all recorded data on apply, and is idempotent", async () => {
  const f = await fixture();
  const before = await readFile(f.path);
  expect(await upgradeRetainedIdentityStorage({ ...f, signal: signal() })).toEqual({
    state: "ready",
  });
  expect(await readFile(f.path)).toEqual(before);
  const source = await readFile(join(f.directory, "events-v1-2026-10-01.jsonl"));
  const control = await readFile(join(f.directory, "collector-control-v1.json"));
  let db = (await openHistoryDatabase(f.path, true))!;
  const facts = snapshot(db),
    receipt = db.prepare("SELECT * FROM identity_receipt").get();
  db.close();
  expect(await upgradeRetainedIdentityStorage({ ...f, signal: signal(), apply: true })).toEqual({
    state: "upgraded",
  });
  db = (await openHistoryDatabase(f.path, true))!;
  expect(snapshot(db)).toEqual(facts);
  expect(db.prepare("SELECT * FROM identity_receipt").get()).toEqual({
    ...(receipt as object),
    revision: 2,
    evidence_changed: 1,
  });
  expect(db.prepare("SELECT * FROM identity_uncertain").all()).toEqual([
    { thread_id: "thr_synthetic", provider_identity: "provider" },
  ]);
  expect(db.prepare("PRAGMA user_version").get()).toEqual({ user_version: 4 });
  db.close();
  const current = await readFile(f.path);
  expect(await upgradeRetainedIdentityStorage({ ...f, signal: signal(), apply: true })).toEqual({
    state: "current",
  });
  expect(await readFile(f.path)).toEqual(current);
  expect(await readFile(join(f.directory, "events-v1-2026-10-01.jsonl"))).toEqual(source);
  expect(await readFile(join(f.directory, "collector-control-v1.json"))).toEqual(control);
});
it("requires fresh positive evidence to restore exact ownership and permits bounded preparation", async () => {
  const f = await fixture();
  await upgradeRetainedIdentityStorage({ ...f, signal: signal(), apply: true });
  let db = (await openHistoryDatabase(f.path))!;
  reconcileIdentity(db, signal());
  expect(db.prepare("SELECT grade FROM identity_usage").get()).toEqual({ grade: "workspace-only" });
  db.close();
  // No source body reads: the fixture is import-only for preparation, but retains ownership evidence.
  db = (await openHistoryDatabase(f.path))!;
  db.exec("DELETE FROM collector_meta");
  db.close();
  await rm(join(f.directory, "collector-control-v1.json"));
  const history = createHostHistory({ now: () => now });
  const prepared = await history.prepare!({
    ...f,
    signal: signal(),
    identities: { hostId: "host_a", generation: 2, offset: 0, total: 1, rows: [row] },
  });
  expect(prepared.state).toBe("available");
  if (prepared.state === "available") {
    expect(prepared.ingestionPending).toBe(false);
    expect(prepared.attribution.backlog).toBe(false);
  }
  db = (await openHistoryDatabase(f.path, true))!;
  expect(db.prepare("SELECT grade FROM identity_usage").get()).toEqual({ grade: "exact-thread" });
  expect(db.prepare("SELECT count(*) AS n FROM identity_uncertain").get()).toEqual({ n: 0 });
  db.close();
  history.dispose();
});
it("supports import-only storage without creating collector control", async () => {
  const f = await fixture(false);
  expect(await upgradeRetainedIdentityStorage({ ...f, signal: signal(), apply: true })).toEqual({
    state: "upgraded",
  });
  expect(await readdir(f.directory)).not.toContain("collector-control-v1.json");
});
for (const problem of [
  "partial",
  "malformed",
  "future",
  "unfinished",
  "wal",
  "control",
  "view",
  "index",
  "exhausted",
] as const) {
  it(`refuses ${problem} storage without changing the index`, async () => {
    const f = await fixture();
    const db = (await openHistoryDatabase(f.path))!;
    if (problem === "partial") db.exec("DROP TABLE identity_aliases");
    if (problem === "malformed") db.exec("CREATE TABLE identity_uncertain (wrong TEXT)");
    if (problem === "future") db.exec("PRAGMA user_version=5");
    if (problem === "unfinished") db.exec("UPDATE history_retention SET backfill_done=0");
    if (problem === "wal") db.exec("PRAGMA journal_mode=WAL");
    if (problem === "view") db.exec("CREATE VIEW identity_uncertain AS SELECT 1 AS wrong");
    if (problem === "index")
      db.exec("CREATE INDEX identity_uncertain_provider ON identity_edges(thread_id)");
    if (problem === "exhausted")
      db.prepare("UPDATE identity_receipt SET revision=?").run(Number.MAX_SAFE_INTEGER);
    db.close();
    if (problem === "control")
      await writeFile(join(f.directory, "collector-control-v1.json"), "invalid");
    const before = await readFile(f.path),
      files = await readdir(f.directory);
    expect(
      (await upgradeRetainedIdentityStorage({ ...f, signal: signal(), apply: true })).state,
    ).toBe("unavailable");
    expect(await readFile(f.path)).toEqual(before);
    expect(await readdir(f.directory)).toEqual(files);
  });
}
it("does not create missing storage or follow a symbolic data directory", async () => {
  const f = await fixture();
  const alias = join(f.dataDir, "alias");
  await symlink(f.dataDir, alias);
  expect(
    await upgradeRetainedIdentityStorage({ dataDir: alias, signal: signal(), apply: true }),
  ).toEqual({ state: "unavailable", reason: "storage-incompatible" });
  const missing = join(f.dataDir, "missing");
  expect(
    (await upgradeRetainedIdentityStorage({ dataDir: missing, signal: signal(), apply: true }))
      .state,
  ).toBe("unavailable");
  expect(await readdir(f.dataDir)).not.toContain("missing");
});
it("stops before opening storage when already cancelled", async () => {
  const f = await fixture(),
    controller = new AbortController();
  controller.abort();
  const before = await readFile(f.path);
  expect(
    await upgradeRetainedIdentityStorage({ ...f, signal: controller.signal, apply: true }),
  ).toEqual({ state: "unavailable", reason: "selection-changed" });
  expect(await readFile(f.path)).toEqual(before);
});

it("rolls back the complete upgrade when cancellation follows DDL", async () => {
  const f = await fixture(),
    controller = new AbortController(),
    factory = (await loadHistoryStorage())!;
  const before = await readFile(f.path);
  const result = await upgradeRetainedIdentityStorage(
    { ...f, signal: controller.signal, apply: true },
    {
      storage: async () => (path, readonly) => {
        const db = factory(path, readonly);
        return {
          ...db,
          exec(sql) {
            db.exec(sql);
            if (sql.includes("CREATE TABLE identity_uncertain")) controller.abort();
          },
        };
      },
    },
  );
  expect(result).toEqual({ state: "unavailable", reason: "selection-changed" });
  expect(await readFile(f.path)).toEqual(before);
});
