import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { openHistoryDatabase, type HistoryDatabase } from "./storage/history-storage.js";
import { initializeHistory, projectCompactRecord } from "./storage/history-projection.js";
import { readCalendarTotals } from "./storage/history-retention.js";
import { recordCoverage, readCoverage } from "./collection/history-coverage.js";
import { reconcileCollector } from "./storage/history-ingest.js";
import { parseCompact } from "./collection/usage-record.js";
import { createHostHistory } from "./history-host.js";

const fixtures: { root: string; db?: HistoryDatabase }[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    fixture.db?.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});
const start = "2026-09-30T00:00:00.000Z";
const end = "2026-10-01T00:00:00.000Z";
const now = Date.parse("2026-10-01T12:00:00.000Z");
const report = { start, end, workspace: "/original", timezone: "UTC" };
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bbp23-review-regression-"));
  const db = (await openHistoryDatabase(join(root, "usage.sqlite")))!;
  fixtures.push({ root, db });
  initializeHistory(db, start);
  return { root, db };
}
const value = {
  version: 1,
  eventId: "00000000-0000-4000-8000-000000000001",
  provenance: "observed",
  occurredAt: start,
  sessionId: "session",
  workspace: "/original",
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
function inactivity(
  db: HistoryDatabase,
  workspace: string | null = "/original",
  threadId: string | null = null,
) {
  recordCoverage(db, {
    id: `inactivity-${threadId ?? workspace ?? "host"}`.replaceAll("/", "_"),
    start,
    end,
    workspace,
    threadId,
    kind: "observed-inactivity",
  });
}
it("persists unresolved source backlog across reopen and prevents false inactivity", async () => {
  const f = await fixture();
  inactivity(f.db);
  await writeFile(
    join(f.root, "events-v1-2026-09-30.jsonl"),
    "invalid\n" + JSON.stringify(value) + "\n",
  );
  expect(
    await reconcileCollector(f.db, f.root, { signal: new AbortController().signal, now, rows: 1 }),
  ).toBe(true);
  const reread = (await openHistoryDatabase(join(f.root, "usage.sqlite"), true))!;
  try {
    expect(readCalendarTotals(reread, report).coverage).toMatchObject({
      state: "incomplete",
      zero: false,
      backlog: true,
    });
  } finally {
    reread.close();
  }
});
it("records sources skipped when the row budget is exhausted as durable unknown-scope backlog", async () => {
  const f = await fixture();
  inactivity(f.db);
  await writeFile(
    join(f.root, "events-v1.jsonl"),
    JSON.stringify({ ...value, workspace: "/other" }) + "\n",
  );
  await writeFile(
    join(f.root, "events-v1-2026-09-30.jsonl"),
    JSON.stringify({ ...value, eventId: "00000000-0000-4000-8000-000000000002" }) + "\n",
  );
  expect(
    await reconcileCollector(f.db, f.root, { signal: new AbortController().signal, now, rows: 1 }),
  ).toBe(true);
  expect(f.db.prepare("SELECT pending FROM history_reconciliation WHERE id=1").get()).toMatchObject(
    { pending: 1 },
  );
  expect(readCalendarTotals(f.db, report).coverage).toMatchObject({
    state: "incomplete",
    zero: false,
    backlog: true,
  });
});
it("clears completed ingestion backlog, but invalid unknown-scope records remain uncertain", async () => {
  const f = await fixture();
  inactivity(f.db);
  const source = join(f.root, "events-v1-2026-09-30.jsonl");
  await writeFile(source, JSON.stringify({ ...value, workspace: "/other" }) + "\n");
  expect(
    await reconcileCollector(f.db, f.root, { signal: new AbortController().signal, now, rows: 0 }),
  ).toBe(true);
  expect(readCalendarTotals(f.db, report).coverage).toMatchObject({ zero: false, backlog: true });
  expect(
    await reconcileCollector(f.db, f.root, { signal: new AbortController().signal, now }),
  ).toBe(false);
  expect(readCalendarTotals(f.db, report).coverage).toMatchObject({ zero: true, backlog: false });
  await writeFile(source, "invalid\n");
  await reconcileCollector(f.db, f.root, { signal: new AbortController().signal, now });
  expect(readCalendarTotals(f.db, report).coverage).toMatchObject({ zero: false, uncertain: true });
  f.db.prepare("DELETE FROM collector_sources").run();
  expect(readCalendarTotals(f.db, report).coverage).toMatchObject({ zero: false, uncertain: true });
  recordCoverage(f.db, {
    id: "later-inactivity",
    workspace: "/original",
    threadId: null,
    start: "2026-10-02T00:00:00.000Z",
    end: "2026-10-03T00:00:00.000Z",
    kind: "observed-inactivity",
  });
  expect(
    readCoverage(f.db, {
      ...report,
      start: "2026-10-02T00:00:00.000Z",
      end: "2026-10-03T00:00:00.000Z",
    }),
  ).toMatchObject({ zero: true, uncertain: false });
});
it("does not record maintenance work for an already-aborted ingestion", async () => {
  const f = await fixture(),
    abort = new AbortController();
  abort.abort();
  await expect(reconcileCollector(f.db, f.root, { signal: abort.signal, now })).rejects.toThrow();
  expect(f.db.prepare("SELECT id FROM history_reconciliation").all()).toEqual([]);
});
it("keeps interrupted reconciliation uncertain until an explicit bounded retry completes", async () => {
  const f = await fixture(),
    abort = new AbortController();
  inactivity(f.db);
  await writeFile(
    join(f.root, "events-v1-2026-09-30.jsonl"),
    JSON.stringify({ ...value, workspace: "/other" }) + "\n",
  );
  await expect(
    reconcileCollector(f.db, f.root, { signal: abort.signal, now, bodyRead: () => abort.abort() }),
  ).rejects.toThrow();
  expect(readCalendarTotals(f.db, report).coverage).toMatchObject({ zero: false, backlog: true });
  await reconcileCollector(f.db, f.root, { signal: new AbortController().signal, now });
  expect(readCalendarTotals(f.db, report).coverage).toMatchObject({ zero: true, backlog: false });
});
it.each(["omission", "uncertain", "backlog"] as const)(
  "includes overlapping host-wide %s without broadening positive evidence",
  async (kind) => {
    const f = await fixture();
    inactivity(f.db);
    inactivity(f.db, null, "thr_verified");
    recordCoverage(f.db, {
      id: "host-negative",
      start,
      end,
      workspace: null,
      threadId: null,
      kind,
    });
    for (const scope of [{ workspace: "/original" }, { verifiedThread: "thr_verified" }, {}]) {
      expect(readCoverage(f.db, { start, end, ...scope })).toMatchObject({
        state: "incomplete",
        zero: false,
      });
    }
    expect(
      readCoverage(f.db, { start: end, end: "2026-10-02T00:00:00.000Z", workspace: "/original" }),
    ).toMatchObject({ state: "uncovered", zero: false });
  },
);
it("supports exact host reads without using host or workspace activity as thread inactivity", async () => {
  const f = await fixture();
  inactivity(f.db, null);
  expect(readCoverage(f.db, { start, end })).toMatchObject({
    zero: true,
    state: "observed-inactivity",
  });
  expect(readCoverage(f.db, { start, end, workspace: "/original" })).toMatchObject({ zero: false });
  inactivity(f.db);
  expect(
    readCoverage(f.db, { start, end, workspace: "/original", verifiedThread: "thr_unverified" }),
  ).toMatchObject({ zero: false });
});
it("applies workspace negatives to host and verified-thread reads, not another established workspace", async () => {
  const f = await fixture();
  inactivity(f.db, null);
  inactivity(f.db, null, "thr_verified");
  recordCoverage(f.db, {
    id: "workspace-gap",
    start,
    end,
    workspace: "/original",
    threadId: null,
    kind: "omission",
  });
  expect(readCoverage(f.db, { start, end })).toMatchObject({ zero: false, omissions: 1 });
  expect(
    readCoverage(f.db, { start, end, workspace: "/original", verifiedThread: "thr_verified" }),
  ).toMatchObject({ zero: false, omissions: 1 });
  expect(readCoverage(f.db, { start, end, verifiedThread: "thr_verified" })).toMatchObject({
    zero: false,
    uncertain: true,
  });
  expect(
    readCoverage(f.db, { start, end, workspace: "/other", verifiedThread: "thr_verified" }),
  ).toMatchObject({ zero: true, omissions: 0 });
});
it("does not turn excluded observed events into certified inactivity", async () => {
  const f = await fixture();
  inactivity(f.db);
  f.db.transaction(() => {
    projectCompactRecord(f.db, parseCompact(JSON.stringify(value), false)!);
    projectCompactRecord(
      f.db,
      parseCompact(JSON.stringify({ ...value, inputTokens: 3, totalTokens: 6 }), false)!,
    );
  });
  const actual = readCalendarTotals(f.db, report);
  expect(actual.days).toEqual([]);
  expect(actual.coverage.zero).toBe(false);
});
it("normalizes equivalent UTC precision and offsets for reports and evidence", async () => {
  const f = await fixture();
  f.db.transaction(() => projectCompactRecord(f.db, parseCompact(JSON.stringify(value), false)!));
  const expected = readCalendarTotals(f.db, report);
  expect(readCalendarTotals(f.db, { ...report, workspace: undefined })).toEqual(expected);
  expect(
    readCalendarTotals(f.db, {
      ...report,
      start: "2026-09-30T00:00:00Z",
      end: "2026-10-01T00:00:00Z",
    }),
  ).toEqual(expected);
  expect(
    readCalendarTotals(f.db, {
      ...report,
      start: "2026-09-29T20:00:00-04:00",
      end: "2026-09-30T20:00:00-04:00",
    }),
  ).toEqual(expected);
  recordCoverage(f.db, {
    id: "offset-evidence",
    workspace: "/empty",
    threadId: null,
    start: "2026-09-29T20:00:00-04:00",
    end: "2026-09-30T20:00:00-04:00",
    kind: "observed-inactivity",
  });
  expect(readCoverage(f.db, { ...report, workspace: "/empty" })).toMatchObject({ zero: true });
});
it("keeps a conservative open pause after corrupt recovery, reopen and later explicit resume", async () => {
  const root = await mkdtemp(join(tmpdir(), "bbp23-paused-recovery-"));
  fixtures.push({ root });
  const dataDir = join(root, "data"),
    agentDir = join(root, "agent"),
    directory = join(dataDir, "history");
  const context = { dataDir, signal: new AbortController().signal };
  let clock = Date.parse("2026-10-01T00:00:00.000Z");
  let history = createHostHistory({ now: () => clock, agentDir: () => agentDir });
  await mkdir(root, { recursive: true });
  await history.control("install", context);
  clock = Date.parse("2026-10-02T00:00:00.000Z");
  await history.control("pause", context);
  clock = Date.parse("2026-10-03T00:00:00.000Z");
  await writeFile(join(directory, "usage-v1.sqlite"), "confirmed-corruption");
  const recovered = await history.read(context);
  expect(recovered.collection).toMatchObject({ enabled: false, pauseCount: 1 });
  history = createHostHistory({ now: () => clock, agentDir: () => agentDir });
  expect((await history.read(context)).collection).toMatchObject({ enabled: false, pauseCount: 1 });
  const later = {
    start: "2026-10-04T00:00:00.000Z",
    end: "2026-10-05T00:00:00.000Z",
    workspace: "/original",
  };
  let db = (await openHistoryDatabase(join(directory, "usage-v1.sqlite")))!;
  try {
    recordCoverage(db, {
      id: "after-recovery",
      ...later,
      threadId: null,
      kind: "observed-inactivity",
    });
    expect(readCoverage(db, later)).toMatchObject({ zero: false, pauses: 1, recoveryGap: false });
  } finally {
    db.close();
  }
  clock = Date.parse("2026-10-04T12:00:00.000Z");
  await history.control("resume", context);
  db = (await openHistoryDatabase(join(directory, "usage-v1.sqlite")))!;
  try {
    expect(readCoverage(db, later)).toMatchObject({ zero: false, pauses: 1 });
    expect(readCoverage(db, { ...later, start: "2026-10-04T12:00:00.000Z" })).toMatchObject({
      zero: true,
      pauses: 0,
    });
  } finally {
    db.close();
  }
});
