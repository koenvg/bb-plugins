import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { openHistoryDatabase, type HistoryDatabase } from "./history-storage.js";
import { initializeHistory, projectCompactRecord, collectionView } from "./history-projection.js";
import { createRetentionSchema, maintainHistory, readCalendarTotals } from "./history-retention.js";
import { parseCompact } from "./usage-record.js";
import { reconcileCollector } from "./history-ingest.js";
import { pruneCollectorLogs, collectorLogNames } from "./history-logs.js";
const fixtures: { root: string; db: HistoryDatabase }[] = [];
afterEach(async () => {
  for (const f of fixtures.splice(0)) {
    f.db.close();
    await rm(f.root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bbp23-maintenance-")),
    db = (await openHistoryDatabase(join(root, "usage.sqlite")))!;
  const f = { root, db };
  fixtures.push(f);
  initializeHistory(db, "2026-08-10T00:00:00.000Z");
  return f;
}
const now = Date.parse("2026-10-01T12:00:00.000Z"),
  signal = new AbortController().signal;
function event(n: number, at = "2026-08-10T00:00:00.000Z") {
  return {
    version: 1,
    eventId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    provenance: "observed",
    occurredAt: at,
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
    capturedCost: 0.123,
  };
}
it("backfills supported v1 in durable bounded transactions before pruning; original prices and ranked totals persist", async () => {
  const f = await fixture();
  for (let i = 1; i <= 5; i++)
    f.db.transaction(() =>
      projectCompactRecord(f.db, parseCompact(JSON.stringify(event(i)), false)!),
    );
  f.db.exec(
    "DROP TABLE usage_compact; DROP TABLE history_retention; DROP TABLE history_owner; PRAGMA user_version=1;",
  );
  f.db.transaction(() => createRetentionSchema(f.db, true));
  maintainHistory(f.db, now, 2);
  expect(f.db.prepare("SELECT count(*) AS n FROM usage_compact").get()).toMatchObject({ n: 2 });
  expect(collectionView(f.db, true, false).workspaces[0].totalTokens).toBe(25);
  f.db.close();
  f.db = (await openHistoryDatabase(join(f.root, "usage.sqlite")))!;
  for (let i = 0; i < 8; i++) maintainHistory(f.db, now, 2);
  expect(f.db.prepare("SELECT count(*) AS n FROM usage_events").get()).toMatchObject({ n: 0 });
  expect(f.db.prepare("SELECT count(*) AS n FROM usage_compact").get()).toMatchObject({ n: 5 });
  const report = readCalendarTotals(f.db, {
    workspace: "/original",
    start: "2026-08-10T00:00:00.000Z",
    end: "2026-08-11T00:00:00.000Z",
    timezone: "UTC",
  });
  expect(report.days[0]).toMatchObject({ totalTokens: 25, pricedEvents: 5 });
  expect(report.days[0].capturedCost).toBeCloseTo(0.615);
});
it("does not prune a daily source until bounded ingestion reaches its stable complete boundary, preserves compact tokens and reports legacy limits", async () => {
  const f = await fixture(),
    path = join(f.root, "events-v1-2026-08-10.jsonl");
  await writeFile(path, [1, 2, 3].map((n) => JSON.stringify(event(n)) + "\n").join(""));
  await reconcileCollector(f.db, f.root, { signal, now, rows: 2 });
  expect(await pruneCollectorLogs(f.db, f.root, now, signal)).toMatchObject({ pending: true });
  expect(await readFile(path, "utf8")).toContain("000000000003");
  await reconcileCollector(f.db, f.root, { signal, now, rows: 2 });
  await pruneCollectorLogs(f.db, f.root, now, signal);
  await expect(readFile(path)).rejects.toThrow();
  maintainHistory(f.db, now);
  expect(collectionView(f.db, true, false).workspaces[0].totalTokens).toBe(15);
  expect(f.db.prepare("SELECT count(*) AS n FROM usage_events").get()).toMatchObject({ n: 0 });
  await writeFile(join(f.root, "events-v1.jsonl"), JSON.stringify(event(1)) + "\n");
  expect((await pruneCollectorLogs(f.db, f.root, now, signal)).legacyLogsPending).toBe(true);
  expect(await readFile(join(f.root, "events-v1.jsonl"), "utf8")).toContain("000000000001");
  expect(collectorLogNames(f.db, now).length).toBeLessThanOrEqual(124);
});
it("late conflicting replay after detail expiry excludes totals without replacing original compact ownership or prices", async () => {
  const f = await fixture();
  const put = (n: number, cost = 0.123) =>
    f.db.transaction(() => {
      projectCompactRecord(
        f.db,
        parseCompact(JSON.stringify({ ...event(n), capturedCost: cost }), false)!,
      );
      projectCompactRecord(
        f.db,
        parseCompact(
          JSON.stringify({
            version: 1,
            eventId: event(n).eventId,
            sessionId: "session",
            entryId: "original-entry",
          }),
          true,
        )!,
      );
    });
  put(1);
  maintainHistory(f.db, now);
  put(2, 0.456);
  expect(collectionView(f.db, true, false)).toMatchObject({
    workspaces: [],
    conflictingEntries: 1,
  });
  expect(
    f.db
      .prepare("SELECT captured_cost,accepted FROM usage_compact WHERE event_id=?")
      .get(event(1).eventId),
  ).toMatchObject({ captured_cost: 0.123, accepted: 0 });
  expect(f.db.prepare("SELECT event_id FROM usage_entry_owners").get()).toMatchObject({
    event_id: event(1).eventId,
  });
});
it("regroups repeated DST instants and uses only an indexed compact date query", async () => {
  const f = await fixture();
  for (const [i, at] of ["2026-11-01T08:30:00Z", "2026-11-01T09:30:00Z"].entries())
    f.db.transaction(() =>
      projectCompactRecord(f.db, parseCompact(JSON.stringify(event(i + 1, at)), false)!),
    );
  const view = readCalendarTotals(f.db, {
    workspace: "/original",
    start: "2026-11-01T00:00:00.000Z",
    end: "2026-11-02T12:00:00.000Z",
    timezone: "America/Los_Angeles",
  });
  expect(view.days).toMatchObject([{ date: "2026-11-01", totalTokens: 10, events: 2 }]);
  const plan = JSON.stringify(
    f.db
      .prepare(
        "EXPLAIN QUERY PLAN SELECT total FROM usage_compact WHERE workspace=? AND occurred_at>=? AND occurred_at<? ORDER BY occurred_at,event_id LIMIT 10001",
      )
      .all("/original", "2026-11-01", "2026-11-02"),
  );
  expect(plan).toContain("compact_workspace_date");
  expect(plan).not.toContain("usage_events");
  expect(plan).not.toContain("TEMP B-TREE");
});
