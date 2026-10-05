import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { openHistoryDatabase, type HistoryDatabase } from "./history-storage.js";
import { initializeHistory, projectCompactRecord, collectionView } from "./history-projection.js";
import { maintainHistory, retentionCutoffs, readCalendarTotals } from "./history-retention.js";
import { parseCompact } from "./usage-record.js";
const fixtures: { root: string; db: HistoryDatabase }[] = [];
afterEach(async () => {
  for (const f of fixtures.splice(0)) {
    f.db.close();
    await rm(f.root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bbp23-retention-")),
    db = (await openHistoryDatabase(join(root, "usage.sqlite")))!;
  fixtures.push({ root, db });
  initializeHistory(db, "2026-01-01T00:00:00.000Z");
  return db;
}
function event(n: number, at = "2026-08-01T00:30:00.000Z", cost: number | null = 0.123) {
  return {
    version: 1,
    eventId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    provenance: "observed",
    occurredAt: at,
    sessionId: "session",
    workspace: "/original",
    providerSessionKey: "provider.jsonl",
    claimedThreadId: "thr_claim",
    provider: "openai-codex",
    model: "gpt-5",
    inputTokens: 2,
    outputTokens: 3,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 1,
    totalTokens: 5,
    capturedCost: cost,
  };
}
function put(
  db: HistoryDatabase,
  value: ReturnType<typeof event>,
  entry = `entry-${value.eventId}`,
) {
  db.transaction(() => {
    projectCompactRecord(db, parseCompact(JSON.stringify(value), false)!);
    projectCompactRecord(
      db,
      parseCompact(
        JSON.stringify({
          version: 1,
          eventId: value.eventId,
          sessionId: value.sessionId,
          entryId: entry,
        }),
        true,
      )!,
    );
  });
}
const now = Date.parse("2026-10-01T12:00:00.000Z");
it("uses calendar months with month-end clamping and nine support/margin dates", () => {
  expect(retentionCutoffs(now)).toEqual({
    detail: "2026-08-17T12:00:00.000Z",
    compact: "2026-06-22T00:00:00.000Z",
  });
  expect(retentionCutoffs(Date.parse("2026-05-31T12:00:00Z")).compact).toBe(
    "2026-02-19T00:00:00.000Z",
  );
});
it("expires details but keeps original instant, tokens, cost and replay ownership across timezone changes", async () => {
  const db = await fixture();
  put(db, event(1));
  put(db, event(2, "2026-08-01T01:00:00.000Z", null));
  maintainHistory(db, now, 500);
  expect(db.prepare("SELECT count(*) AS n FROM usage_events").get()).toMatchObject({ n: 0 });
  const query = {
    start: "2026-07-31T00:00:00.000Z",
    end: "2026-08-02T00:00:00.000Z",
    workspace: "/original",
    timezone: "UTC",
  };
  expect(readCalendarTotals(db, query)).toMatchObject({
    detail: "unavailable",
    days: [
      { date: "2026-08-01", totalTokens: 10, capturedCost: 0.123, pricedEvents: 1, events: 2 },
    ],
  });
  expect(readCalendarTotals(db, { ...query, timezone: "America/Los_Angeles" }).days[0].date).toBe(
    "2026-07-31",
  );
  put(db, event(1));
  put(db, event(3), `entry-${event(1).eventId}`);
  expect(collectionView(db, true, false).workspaces).toEqual([
    { workspace: "/original", totalTokens: 10, events: 2 },
  ]);
  expect(
    db
      .prepare("SELECT event_id FROM usage_entry_owners WHERE entry_id=?")
      .get(`entry-${event(1).eventId}`),
  ).toMatchObject({ event_id: event(1).eventId });
  expect(db.prepare("SELECT count(*) AS n FROM usage_events").get()).toMatchObject({ n: 0 });
});
it("advances a durable cutoff, prunes bounded batches, resumes after reopen and rejects expired replay", async () => {
  const db = await fixture();
  for (let i = 1; i <= 7; i++) put(db, event(i, "2026-01-01T00:00:00.000Z"));
  expect(maintainHistory(db, now, 2).pending).toBe(true);
  expect(collectionView(db, true, false).workspaces[0].events).toBe(5);
  const f = fixtures[0];
  db.close();
  f.db = (await openHistoryDatabase(join(f.root, "usage.sqlite")))!;
  for (let i = 0; i < 8; i++) maintainHistory(f.db, now, 2);
  expect(collectionView(f.db, true, false).workspaces).toEqual([]);
  put(f.db, event(1, "2026-01-01T00:00:00.000Z"));
  put(f.db, event(50, "2026-01-01T00:00:00.000Z"));
  maintainHistory(f.db, Date.parse("2026-02-01T00:00:00Z"), 2);
  expect(collectionView(f.db, true, false).workspaces).toEqual([]);
  expect(f.db.prepare("SELECT count(*) AS n FROM usage_compact").get()).toMatchObject({ n: 0 });
});
it("rolls back compact prices, detail and replay evidence with totals", async () => {
  const db = await fixture();
  expect(() =>
    db.transaction(() => {
      projectCompactRecord(db, parseCompact(JSON.stringify(event(1)), false)!);
      throw Error("rollback");
    }),
  ).toThrow();
  expect(db.prepare("SELECT count(*) AS n FROM usage_compact").get()).toMatchObject({ n: 0 });
  expect(collectionView(db, true, false).workspaces).toEqual([]);
});
it("keeps verified links separate from original host/workspace and claims after expiry", async () => {
  const db = await fixture();
  put(db, event(1));
  maintainHistory(db, now);
  const original = db
    .prepare("SELECT recorded_host,workspace,claimed_thread,verified_thread FROM usage_compact")
    .get();
  expect(original).toMatchObject({
    workspace: "/original",
    claimed_thread: "thr_claim",
    verified_thread: null,
  });
  db.prepare("UPDATE usage_compact SET verified_thread=? WHERE event_id=?").run(
    "thr_verified",
    event(1).eventId,
  );
  const query = {
    start: "2026-07-31T00:00:00.000Z",
    end: "2026-08-02T00:00:00.000Z",
    timezone: "UTC",
  };
  expect(
    readCalendarTotals(db, { ...query, verifiedThread: "thr_verified" }).days[0].totalTokens,
  ).toBe(5);
  expect(readCalendarTotals(db, { ...query, verifiedThread: "thr_claim" }).days).toEqual([]);
  expect(db.prepare("SELECT recorded_host,workspace FROM usage_compact").get()).toMatchObject({
    recorded_host: (original as { recorded_host: string }).recorded_host,
    workspace: "/original",
  });
});
