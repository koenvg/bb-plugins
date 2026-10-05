import { mkdtemp, mkdir, writeFile, readFile, appendFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHostHistory } from "../history-host.js";
import { openHistoryDatabase } from "../storage/history-storage.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bbp18-"));
  roots.push(root);
  const agent = join(root, "agent"),
    dataDir = join(root, "data");
  await mkdir(join(agent, "extensions"), { recursive: true });
  await writeFile(join(agent, "settings.json"), "unrelated-settings");
  await writeFile(join(agent, "extensions/other.js"), "unrelated-extension");
  let reads = 0;
  const history = createHostHistory({
    agentDir: () => agent,
    bodyRead: () => {
      reads++;
    },
    now: () => Date.UTC(2026, 9, 1),
    ingestBytes: 65536,
    ingestRows: 2,
  });
  const context = { dataDir, signal: new AbortController().signal };
  return {
    root,
    agent,
    dataDir,
    history,
    context,
    reads: () => reads,
    log: join(dataDir, "history/events-v1.jsonl"),
  };
}
function event(id: string, workspace = "/shared/a/../work") {
  return {
    version: 1,
    eventId: id,
    provenance: "observed",
    occurredAt: "2026-10-01T00:00:00.000Z",
    sessionId: "session",
    workspace,
    providerSessionKey: "provider.jsonl",
    claimedThreadId: "thr_claim",
    provider: "openai-codex",
    model: "gpt-5",
    inputTokens: 2,
    outputTokens: 3,
    cacheReadTokens: 1,
    cacheWriteTokens: 0,
    reasoningTokens: 2,
    totalTokens: 6,
    capturedCost: null,
  };
}
const line = (id: string) => JSON.stringify(event(id)) + "\n";
it("installs explicitly, repairs without reset, preserves settings/events, records pause gaps", async () => {
  const f = await fixture();
  expect(await f.history.read(f.context)).toMatchObject({ reason: "not-configured" });
  const installed = await f.history.control("install", f.context);
  expect(installed.collection).toMatchObject({
    enabled: true,
    firstObservedAt: "2026-10-01T00:00:00.000Z",
    pauseCount: 0,
  });
  expect(installed.writer).toBe("unconfirmed");
  await appendFile(f.log, line("00000000-0000-4000-8000-000000000001"));
  await f.history.control("pause", f.context);
  await f.history.control("repair", f.context);
  expect(await readFile(join(f.agent, "settings.json"), "utf8")).toBe("unrelated-settings");
  expect(await readFile(join(f.agent, "extensions/other.js"), "utf8")).toBe("unrelated-extension");
  expect(await readFile(f.log, "utf8")).toContain("000000000001");
  const resumed = await f.history.control("resume", f.context);
  expect(resumed.collection).toMatchObject({
    enabled: true,
    firstObservedAt: installed.collection!.firstObservedAt,
    pauseCount: 1,
  });
  expect(resumed.collection!.workspaces).toEqual([
    { workspace: "/shared/work", totalTokens: 6, events: 1 },
  ]);
});
it("persists transactions and unchanged-source progress, bounds backlog, excludes private/malformed records, counts confirmed replay once", async () => {
  const f = await fixture();
  await f.history.control("install", f.context);
  const ids = [1, 2, 3].map((n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
  await writeFile(
    f.log,
    ids.map(line).join("") +
      JSON.stringify({ ...event(ids[0]), content: "secret-sentinel" }) +
      "\n",
  );
  expect((await f.history.read(f.context)).collection).toMatchObject({ backlog: true });
  expect((await f.history.read(f.context)).collection).toMatchObject({ invalidRecords: 1 });
  await writeFile(
    join(f.dataDir, "history/confirmations-v1.jsonl"),
    ids
      .slice(0, 2)
      .map(
        (eventId) =>
          JSON.stringify({
            version: 1,
            eventId,
            sessionId: "session",
            entryId: "persisted-entry",
          }) + "\n",
      )
      .join(""),
  );
  expect((await f.history.read(f.context)).collection!.workspaces[0]).toMatchObject({
    totalTokens: 12,
    events: 2,
  });
  const before = f.reads();
  await f.history.read(f.context);
  expect(f.reads()).toBe(before);
  const reload = createHostHistory({ agentDir: () => f.agent });
  expect((await reload.read(f.context)).collection!.workspaces[0].totalTokens).toBe(12);
  const db = await openHistoryDatabase(join(f.dataDir, "history/usage-v1.sqlite"), true);
  expect(
    JSON.stringify(db!.prepare("SELECT payload FROM usage_events LIMIT 1").get()),
  ).not.toContain("sentinel");
  db!.close();
  await writeFile(f.log, line(ids[0])); // truncation and replay
  expect((await f.history.read(f.context)).collection!.workspaces[0].totalTokens).toBe(12);
  await writeFile(f.log + ".new", line(ids[2]));
  await rename(f.log + ".new", f.log);
  expect((await f.history.read(f.context)).collection!.workspaces[0].totalTokens).toBe(12);
});
it("does not activate after cancellation or overwrite unsupported storage", async () => {
  const f = await fixture();
  expect(
    await f.history.control("install", { ...f.context, signal: AbortSignal.abort() }),
  ).toMatchObject({ reason: "selection-changed" });
  await mkdir(join(f.dataDir, "history"), { recursive: true });
  const path = join(f.dataDir, "history/usage-v1.sqlite"),
    db = await openHistoryDatabase(path);
  db!.exec("PRAGMA user_version = 99");
  db!.close();
  const before = await readFile(path);
  expect(await f.history.control("install", f.context)).toMatchObject({
    reason: "storage-incompatible",
  });
  expect(await readFile(path)).toEqual(before);
});
it("handles oversized and partial UTF-8 lines without storing body fragments or rereading stalled sources", async () => {
  const f = await fixture();
  await f.history.control("install", f.context);
  const id = "00000000-0000-4000-8000-000000000009";
  await writeFile(f.log, "x".repeat(300000) + "\n" + line(id));
  for (let i = 0; i < 8; i++) await f.history.read(f.context);
  expect((await f.history.read(f.context)).collection).toMatchObject({
    invalidRecords: 1,
    backlog: false,
  });
  await appendFile(
    f.log,
    JSON.stringify(event("00000000-0000-4000-8000-000000000010")).slice(0, -1),
  );
  expect((await f.history.read(f.context)).collection!.backlog).toBe(true);
  const reads = f.reads();
  await f.history.read(f.context);
  expect(f.reads()).toBe(reads);
  await appendFile(f.log, "}\n");
  expect((await f.history.read(f.context)).collection!.workspaces[0].totalTokens).toBe(12);
});
it("keeps identical paths on different hosts separate and never uses claims as per-thread totals", async () => {
  const a = await fixture(),
    b = await fixture();
  await a.history.control("install", a.context);
  await b.history.control("install", b.context);
  await writeFile(a.log, line("00000000-0000-4000-8000-000000000011"));
  expect((await a.history.read(a.context)).collection!.workspaces[0].totalTokens).toBe(6);
  expect((await b.history.read(b.context)).collection!.workspaces).toEqual([]);
});
it("fails closed on lost control after pause, including repair and reinstall", async () => {
  const f = await fixture();
  await f.history.control("install", f.context);
  await f.history.control("pause", f.context);
  const { unlink } = await import("node:fs/promises");
  const control = join(f.dataDir, "history/collector-control-v1.json");
  await unlink(control);
  const asset = await readFile(join(f.agent, "extensions/bb-codex-usage/index.js"));
  for (const action of ["repair", "install", "resume"] as const)
    expect(await f.history.control(action, f.context)).toMatchObject({ state: "unavailable" });
  await expect(readFile(control)).rejects.toThrow();
  expect(await readFile(join(f.agent, "extensions/bb-codex-usage/index.js"))).toEqual(asset);
  expect(await f.history.read(f.context)).toMatchObject({ state: "unavailable" });
});
it("keeps first capture ownership on lower-UUID replay and excludes conflicting entry evidence", async () => {
  const f = await fixture();
  await f.history.control("install", f.context);
  const first = "ffffffff-ffff-4fff-8fff-ffffffffffff",
    replay = "00000000-0000-4000-8000-000000000012",
    conflict = "00000000-0000-4000-8000-000000000013";
  const confirmation = (eventId: string) =>
    JSON.stringify({ version: 1, eventId, sessionId: "session", entryId: "same-entry" }) + "\n";
  const confirmations = join(f.dataDir, "history/confirmations-v1.jsonl");
  await writeFile(f.log, line(first));
  await writeFile(confirmations, confirmation(first));
  await f.history.read(f.context);
  await appendFile(f.log, line(replay));
  await appendFile(confirmations, confirmation(replay));
  expect((await f.history.read(f.context)).collection!.workspaces).toEqual([
    { workspace: "/shared/work", totalTokens: 6, events: 1 },
  ]);
  await appendFile(
    f.log,
    JSON.stringify({ ...event(conflict, "/replay-workspace"), totalTokens: 9, capturedCost: 0.1 }) +
      "\n",
  );
  await appendFile(confirmations, confirmation(conflict));
  const result = await f.history.read(f.context);
  expect(result.collection).toMatchObject({ workspaces: [], conflictingEntries: 1 });
  const db = await openHistoryDatabase(join(f.dataDir, "history/usage-v1.sqlite"), true);
  expect(
    db!
      .prepare("SELECT event_id FROM usage_entry_owners WHERE session_id=? AND entry_id=?")
      .get("session", "same-entry"),
  ).toMatchObject({ event_id: first });
  expect(
    JSON.parse(
      (
        db!.prepare("SELECT payload FROM usage_events WHERE event_id=?").get(first) as {
          payload: string;
        }
      ).payload,
    ),
  ).toMatchObject({ workspace: "/shared/work", totalTokens: 6, capturedCost: null });
  db!.close();
  const reload = createHostHistory({ agentDir: () => f.agent });
  expect((await reload.read(f.context)).collection).toMatchObject({
    workspaces: [],
    conflictingEntries: 1,
  });
});
it("reads persisted bounded projections after reload without rescanning detailed events", async () => {
  const f = await fixture();
  await f.history.control("install", f.context);
  await writeFile(f.log, line("00000000-0000-4000-8000-000000000014"));
  await f.history.read(f.context);
  const { loadHistoryStorage } = await import("../storage/history-storage.js");
  const factory = (await loadHistoryStorage())!;
  const sql: string[] = [];
  const reload = createHostHistory({
    agentDir: () => f.agent,
    storage: async () => (path, readonly) => {
      const db = factory(path, readonly);
      return {
        ...db,
        prepare: (query: string) => {
          sql.push(query);
          return db.prepare(query);
        },
      };
    },
  });
  expect((await reload.read(f.context)).collection!.workspaces[0].totalTokens).toBe(6);
  expect(sql.filter((query) => /^SELECT.*usage_(events|confirmations)/s.test(query))).toEqual([]);
});
