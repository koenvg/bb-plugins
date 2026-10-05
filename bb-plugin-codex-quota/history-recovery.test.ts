import { mkdtemp, rm, writeFile, readFile, readdir, symlink, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHostHistory } from "./history-host.js";
import { openHistoryDatabase, loadHistoryStorage } from "./history-storage.js";
import { readCalendarTotals } from "./history-retention.js";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const at = Date.parse("2026-10-01T12:00:00.000Z");
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bbp23-recovery-"));
  roots.push(root);
  const dataDir = join(root, "data"),
    agent = join(root, "agent"),
    context = { dataDir, signal: new AbortController().signal };
  const history = createHostHistory({ agentDir: () => agent, now: () => at });
  await history.control("install", context);
  return {
    root,
    dataDir,
    agent,
    context,
    history,
    directory: join(dataDir, "history"),
    path: join(dataDir, "history/usage-v1.sqlite"),
  };
}
const value = {
  version: 1,
  eventId: "00000000-0000-4000-8000-000000000001",
  provenance: "observed",
  occurredAt: "2026-09-30T00:00:00.000Z",
  sessionId: "session",
  workspace: "/kept",
  providerSessionKey: null,
  claimedThreadId: null,
  provider: "openai-codex",
  model: "gpt-5",
  inputTokens: 2,
  outputTokens: 3,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 1,
  totalTokens: 5,
  capturedCost: 0.25,
};
it("quarantines only confirmed corrupt owned storage, preserves sidecars and reconstructs retained sources with a lost interval", async () => {
  const f = await fixture();
  await writeFile(join(f.directory, "events-v1-2026-09-30.jsonl"), JSON.stringify(value) + "\n");
  await f.history.read(f.context);
  const originalOwner = JSON.parse(
    await readFile(join(f.directory, "retention-boundary-v2.json"), "utf8"),
  ).hostKey;
  await writeFile(join(f.root, "unrelated.sqlite"), "unrelated");
  await writeFile(f.path, "confirmed-not-a-database");
  await writeFile(f.path + "-wal", "retained-sidecar");
  await writeFile(f.path + "-shm", "retained-shm");
  const view = await f.history.read(f.context);
  expect(view.health).toMatchObject({
    state: "recovered",
    recoveryGaps: [{ start: "2026-06-22T00:00:00.000Z", end: "2026-10-01T12:00:00.000Z" }],
  });
  expect(view.collection!.workspaces).toEqual([{ workspace: "/kept", totalTokens: 5, events: 1 }]);
  const quarantine = (await readdir(f.directory)).find((n) => n.startsWith("quarantine-"))!;
  expect(await readFile(join(f.directory, quarantine, "usage-v1.sqlite"), "utf8")).toBe(
    "confirmed-not-a-database",
  );
  expect(await readFile(join(f.directory, quarantine, "usage-v1.sqlite-wal"), "utf8")).toBe(
    "retained-sidecar",
  );
  expect(await readFile(join(f.root, "unrelated.sqlite"), "utf8")).toBe("unrelated");
  const db = (await openHistoryDatabase(f.path))!;
  try {
    expect(db.prepare("SELECT recorded_host FROM usage_compact").get()).toMatchObject({
      recorded_host: originalOwner,
    });
    expect(
      readCalendarTotals(db, {
        workspace: "/kept",
        timezone: "UTC",
        start: "2026-09-30T00:00:00.000Z",
        end: "2026-10-01T00:00:00.000Z",
      }).coverage,
    ).toMatchObject({ state: "incomplete", zero: false, recoveryGap: true });
  } finally {
    db.close();
  }
  const reload = createHostHistory({ agentDir: () => f.agent, now: () => at });
  expect((await reload.read(f.context)).collection!.workspaces[0].totalTokens).toBe(5);
});
it("does not quarantine permission/IO/capability failures or raw error messages", async () => {
  const f = await fixture(),
    bytes = await readFile(f.path);
  for (const code of ["EACCES", "EIO", "SQLITE_BUSY", "SQLITE_CANTOPEN"]) {
    const failing = createHostHistory({
      agentDir: () => f.agent,
      storage: async () => () => {
        throw Object.assign(Error("credential-secret"), { code });
      },
    });
    const view = await failing.read(f.context);
    expect(view.reason).toBe("storage-unavailable");
    expect(JSON.stringify(view)).not.toContain("secret");
  }
  expect(await readFile(f.path)).toEqual(bytes);
  expect((await readdir(f.directory)).some((n) => n.startsWith("quarantine-"))).toBe(false);
});
it("leaves a newer schema and all sidecars untouched even with a saved unfinished recovery receipt", async () => {
  const f = await fixture(),
    db = (await openHistoryDatabase(f.path))!;
  db.exec("PRAGMA user_version=99");
  db.close();
  await writeFile(f.path + "-wal", "private-newer-wal");
  await writeFile(f.path + "-shm", "private-newer-shm");
  await writeFile(join(f.directory, "recovery-v2.json"), "not-even-readable");
  const before = await Promise.all(
    [f.path, f.path + "-wal", f.path + "-shm"].map((p) => readFile(p)),
  );
  let calls = 0;
  const factory = (await loadHistoryStorage())!;
  const history = createHostHistory({
    storage: async () => (p, r) => {
      calls++;
      return factory(p, r);
    },
    agentDir: () => f.agent,
  });
  for (const action of [undefined, "repair", "install"] as const)
    expect(
      await (action ? history.control(action, f.context) : history.read(f.context)),
    ).toMatchObject({ reason: "storage-incompatible" });
  expect(calls).toBe(0);
  expect(
    await Promise.all([f.path, f.path + "-wal", f.path + "-shm"].map((p) => readFile(p))),
  ).toEqual(before);
});
it("does not follow a sidecar symlink or recreate missing control", async () => {
  const f = await fixture();
  await writeFile(f.path, "confirmed-corruption");
  const target = join(f.root, "foreign");
  await writeFile(target, "safe");
  await symlink(target, f.path + "-wal");
  expect(await f.history.read(f.context)).toMatchObject({ state: "unavailable" });
  expect(await readFile(target, "utf8")).toBe("safe");
  expect((await readdir(f.directory)).some((n) => n.startsWith("quarantine-"))).toBe(false);
  await rm(f.path + "-wal");
  await rm(join(f.directory, "collector-control-v1.json"));
  expect(await f.history.read(f.context)).toMatchObject({ state: "unavailable" });
  expect(await readFile(f.path, "utf8")).toBe("confirmed-corruption");
});
it("resumes durable quarantine after the database move without touching unrelated files", async () => {
  const f = await fixture(),
    boundary = JSON.parse(await readFile(join(f.directory, "retention-boundary-v2.json"), "utf8"));
  const directory = "quarantine-00000000-0000-4000-8000-000000000099";
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(f.directory, directory));
  await rename(f.path, join(f.directory, directory, "usage-v1.sqlite"));
  await writeFile(f.path + "-wal", "late-sidecar");
  await writeFile(
    join(f.directory, "recovery-v2.json"),
    JSON.stringify({
      phase: "quarantine",
      directory,
      boundary,
      start: boundary.compact,
      end: new Date(at).toISOString(),
    }),
  );
  expect((await f.history.read(f.context)).health).toMatchObject({ state: "recovered" });
  expect(await readFile(join(f.directory, directory, "usage-v1.sqlite-wal"), "utf8")).toBe(
    "late-sidecar",
  );
});
