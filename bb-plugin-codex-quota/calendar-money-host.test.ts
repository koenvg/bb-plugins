import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import { createQuotaHostEntry } from "./host.js";
import { createHostHistory } from "./history-host.js";
import { openHistoryDatabase, type HistoryDatabase } from "./history-storage.js";
import { initializeHistory, projectCompactRecord } from "./history-projection.js";
import { maintainHistory } from "./history-retention.js";
import { usageRecordSchema } from "./usage-record.js";
import type { CalendarQuery } from "./calendar-contract.js";
import { importedUsage } from "./import-parser.js";
import { excludeCompactIdentity } from "./history-projection.js";
import { acceptIdentityBatch, reconcileIdentity } from "./identity-storage.js";
import { readFile } from "node:fs/promises";

const roots: string[] = [];
const now = Date.parse("2026-10-01T12:00:00Z");
const query: CalendarQuery = {
  startDate: "2026-09-01",
  timezone: "UTC",
  group: "workspace",
  scope: { kind: "host" },
};
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(clock = now) {
  const root = await mkdtemp(join(tmpdir(), "bbp21-money-"));
  roots.push(root);
  const dataDir = join(root, "data");
  await mkdir(join(dataDir, "history"), { recursive: true });
  const path = join(dataDir, "history/usage-v1.sqlite"),
    db = (await openHistoryDatabase(path))!;
  initializeHistory(db, new Date(clock).toISOString(), false);
  maintainHistory(db, clock);
  const history = createHostHistory({ now: () => clock });
  const harness = experimental_createHostEntryHarness(
    createQuotaHostEntry({
      history,
      auth: async () => {
        throw Error("Money report must not read auth");
      },
      read: async () => {
        throw Error("Money report must not read quota");
      },
    }),
    { experimental_paths: { dataDir, tempDir: join(root, "temp") } },
  );
  return {
    db,
    path,
    harness,
    read: (input = query) => harness.experimental_call("calendarReport", input),
  };
}
function put(
  db: HistoryDatabase,
  n: number,
  workspace: string,
  capturedCost: number | null,
  occurredAt = "2026-09-15T12:00:00.000Z",
) {
  const record = usageRecordSchema.parse({
    version: 1,
    eventId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    provenance: "observed",
    occurredAt,
    sessionId: "synthetic",
    workspace,
    providerSessionKey: null,
    claimedThreadId: null,
    provider: "openai-codex",
    model: "synthetic",
    inputTokens: 4,
    outputTokens: 6,
    reasoningTokens: 3,
    cacheReadTokens: 2,
    cacheWriteTokens: 0,
    totalTokens: 10,
    capturedCost,
  });
  projectCompactRecord(db, record);
}
it("keeps the known captured estimate and priced denominator separate from all token entities", async () => {
  const f = await fixture();
  f.db.transaction(() => {
    put(f.db, 1, "/priced-a", 4);
    put(f.db, 2, "/priced-b", 6);
    put(f.db, 3, "/unpriced", null);
  });
  f.db.close();
  const result = await f.read();
  expect(result).toMatchObject({
    state: "partial",
    summary: {
      totalTokens: 30,
      activeEntities: 3,
      money: {
        state: "partial",
        capturedCost: 10,
        pricedRecords: 2,
        records: 3,
        pricedEntities: 2,
        reason: "missing-prices",
      },
    },
    days: expect.arrayContaining([
      expect.objectContaining({
        date: "2026-09-15",
        totalTokens: 30,
        activeEntities: 3,
        money: {
          state: "partial",
          capturedCost: 10,
          pricedRecords: 2,
          records: 3,
          pricedEntities: 2,
          reason: "missing-prices",
        },
      }),
    ]),
    ranking: expect.arrayContaining([
      expect.objectContaining({
        key: "/unpriced",
        totalTokens: 10,
        money: {
          state: "unavailable",
          capturedCost: null,
          pricedRecords: 0,
          records: 1,
          pricedEntities: 0,
          reason: "missing-prices",
        },
      }),
    ]),
  });
  await f.harness.experimental_dispose();
});
it("keeps imported tokens with missing, zero, negative, invalid and non-finite prices unpriced", async () => {
  const f = await fixture();
  const prices: unknown[] = [4, 6, undefined, 0, -1, "9", NaN, Infinity, -Infinity, 1e10];
  f.db.transaction(() =>
    prices.forEach((cost, n) => {
      const value = importedUsage(
        {
          type: "message",
          id: `entry-${n}`,
          message: {
            role: "assistant",
            provider: "openai-codex",
            model: "synthetic",
            timestamp: Date.parse("2026-09-15T12:00:00Z"),
            usage: {
              input: 4,
              output: 6,
              reasoning: 3,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 10,
              cost: { total: cost },
            },
          },
        },
        "imported",
        `/workspace-${n}`,
        null,
      );
      if (value.kind !== "usage") throw Error("Expected scalar import fixture");
      projectCompactRecord(f.db, value.record);
    }),
  );
  f.db.close();
  expect(await f.read()).toMatchObject({
    capture: "unconfirmed",
    summary: {
      totalTokens: 100,
      activeEntities: 10,
      money: {
        state: "partial",
        capturedCost: 10,
        pricedRecords: 2,
        records: 10,
        pricedEntities: 2,
      },
    },
    days: expect.arrayContaining([
      expect.objectContaining({
        date: "2026-09-15",
        coverage: expect.objectContaining({ state: "imported" }),
      }),
    ]),
  });
  await f.harness.experimental_dispose();
});
it("never creates a monetary zero when accepted usage has no eligible prices or no records", async () => {
  const f = await fixture();
  put(f.db, 1, "/unpriced", null);
  f.db.close();
  const view = await f.read();
  expect(view).toMatchObject({
    summary: {
      totalTokens: 10,
      money: { capturedCost: null, state: "unavailable", pricedEntities: 0 },
    },
    days: expect.arrayContaining([
      expect.objectContaining({
        date: "2026-09-01",
        money: {
          capturedCost: null,
          state: "unavailable",
          records: 0,
          pricedRecords: 0,
          pricedEntities: 0,
          reason: "missing-prices",
        },
      }),
    ]),
  });
  await f.harness.experimental_dispose();
});
it("uses every accepted priced entity and record beyond the fifty-row ranking and old event cap", async () => {
  const f = await fixture();
  f.db.transaction(() => {
    for (let n = 0; n < 12060; n++)
      put(f.db, n + 1, `/workspace-${n % 60}`, n % 60 === 59 ? null : 1);
  });
  f.db.close();
  expect(await f.read()).toMatchObject({
    summary: {
      totalTokens: 120600,
      activeEntities: 60,
      money: {
        state: "partial",
        capturedCost: 11859,
        pricedRecords: 11859,
        records: 12060,
        pricedEntities: 59,
      },
    },
    ranking: expect.any(Array),
    truncated: true,
  });
  const view = await f.read();
  if (view.state === "unavailable") throw Error(view.reason);
  expect(view.ranking).toHaveLength(50);
  await f.harness.experimental_dispose();
}, 30000);
it("preserves tiny and large finite originally captured values without price lookup", async () => {
  const f = await fixture();
  put(f.db, 1, "/tiny", Number.MIN_VALUE);
  put(f.db, 2, "/large", 1e9);
  f.db.close();
  const view = await f.read();
  if (view.state === "unavailable") throw Error(view.reason);
  expect(view.ranking.find((row) => row.key === "/tiny")?.money).toMatchObject({
    capturedCost: Number.MIN_VALUE,
    pricedRecords: 1,
    pricedEntities: 1,
  });
  expect(view.ranking.find((row) => row.key === "/large")?.money).toMatchObject({
    capturedCost: 1e9,
    state: "available",
  });
  expect(
    await f.read({ ...query, scope: { kind: "workspace", workspace: "/tiny" } }),
  ).toMatchObject({ summary: { money: { capturedCost: Number.MIN_VALUE } } });
  await f.harness.experimental_dispose();
});
it("retains compact prices after class expiry, reopen and changes in later model prices", async () => {
  const f = await fixture();
  put(f.db, 1, "/original", 0.125, "2026-08-05T12:00:00.000Z");
  maintainHistory(f.db, now);
  f.db.close();
  const before = await readFile(f.path);
  const previous = { ...query, startDate: "2026-08-02" };
  expect(await f.read(previous)).toMatchObject({
    summary: { totalTokens: 10, money: { capturedCost: 0.125 } },
    days: expect.arrayContaining([
      expect.objectContaining({
        date: "2026-08-05",
        money: expect.objectContaining({ capturedCost: 0.125 }),
        classes: { state: "unavailable" },
      }),
    ]),
  });
  expect(await readFile(f.path)).toEqual(before);
  const db = (await openHistoryDatabase(f.path))!;
  put(db, 2, "/original", 999);
  db.close();
  expect(await f.read(previous)).toMatchObject({
    summary: { totalTokens: 10, money: { capturedCost: 0.125 } },
  });
  await f.harness.experimental_dispose();
});
it("excludes canonical rejected prices and unverified shares from exact-thread estimates without guessing labels", async () => {
  const f = await fixture();
  f.db.transaction(() => {
    put(f.db, 1, "/shared", 4);
    put(f.db, 2, "/shared", 6);
    put(f.db, 3, "/shared", 50);
    excludeCompactIdentity(f.db, "00000000-0000-4000-8000-000000000003");
  });
  // Supply exact provider evidence through the canonical ingestion producer, not a guessed workspace allocation.
  const record = usageRecordSchema.parse({
    version: 1,
    eventId: "00000000-0000-4000-8000-000000000004",
    provenance: "observed",
    occurredAt: "2026-09-15T12:00:00.000Z",
    sessionId: "exact",
    workspace: "/shared",
    providerSessionKey: "provider-a.jsonl",
    claimedThreadId: null,
    provider: "openai-codex",
    model: "synthetic",
    inputTokens: 4,
    outputTokens: 6,
    reasoningTokens: 3,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 10,
    capturedCost: 8,
  });
  projectCompactRecord(f.db, record);
  acceptIdentityBatch(f.db, {
    hostId: "host_a",
    generation: 1,
    offset: 0,
    total: 1,
    rows: [
      { threadId: "thr_deleted", providerIdentity: "provider-a", title: null, state: "deleted" },
    ],
  });
  reconcileIdentity(f.db, new AbortController().signal);
  reconcileIdentity(f.db, new AbortController().signal);
  f.db.close();
  expect(await f.read()).toMatchObject({
    summary: {
      totalTokens: 30,
      excludedTokens: 10,
      money: { capturedCost: 18, records: 3, pricedEntities: 1 },
    },
  });
  expect(await f.read({ ...query, group: "thread" })).toMatchObject({
    summary: {
      totalTokens: 10,
      excludedTokens: 30,
      money: { capturedCost: 8, records: 1, pricedEntities: 1 },
    },
    ranking: [
      expect.objectContaining({
        key: "thr_deleted",
        label: "Deleted thread thr_deleted",
        metadata: "deleted",
        money: expect.objectContaining({ capturedCost: 8 }),
      }),
    ],
  });
  await f.harness.experimental_dispose();
});
it("assigns captured estimates to the same real local dates across the fall DST boundary", async () => {
  const f = await fixture(Date.parse("2026-11-30T12:00:00Z"));
  put(f.db, 1, "/boundary", 4, "2026-11-01T03:59:59.000Z");
  put(f.db, 2, "/boundary", 6, "2026-11-01T04:00:00.000Z");
  f.db.close();
  const view = await f.read({ ...query, startDate: "2026-10-31", timezone: "America/New_York" });
  expect(view).toMatchObject({
    summary: { totalTokens: 20, activeEntities: 1, money: { capturedCost: 10, pricedEntities: 1 } },
    days: expect.arrayContaining([
      expect.objectContaining({
        date: "2026-10-31",
        money: expect.objectContaining({ capturedCost: 4, pricedEntities: 1 }),
      }),
      expect.objectContaining({
        date: "2026-11-01",
        money: expect.objectContaining({ capturedCost: 6, pricedEntities: 1 }),
      }),
    ]),
  });
  await f.harness.experimental_dispose();
});
it("retains prices but never restores classes or expired ranges after saved cutoff rollback", async () => {
  const f = await fixture();
  put(f.db, 1, "/original", 0.125);
  maintainHistory(f.db, Date.parse("2026-11-15T12:00:00Z"));
  f.db.close();
  expect(await f.read()).toMatchObject({
    summary: { totalTokens: 10, money: { capturedCost: 0.125 } },
    compactFrom: "2026-08-06T00:00:00.000Z",
    previous: false,
    days: expect.arrayContaining([
      expect.objectContaining({
        date: "2026-09-15",
        classes: { state: "unavailable" },
        money: expect.objectContaining({ capturedCost: 0.125 }),
      }),
    ]),
  });
  expect(await f.read({ ...query, startDate: "2026-08-02" })).toEqual({
    state: "unavailable",
    reason: "range-unavailable",
  });
  await f.harness.experimental_dispose();
});

it("reads current/prior subtotals in one bounded read and withholds active percentages despite settled evidence", async () => {
  const { recordCoverage, recordReconciliation } = await import("./history-coverage.js");
  const f = await fixture();
  put(f.db, 1, "/a", 4);
  put(f.db, 2, "/b", 6);
  put(f.db, 3, "/c", null);
  put(f.db, 4, "/a", 2, "2026-08-05T12:00:00.000Z");
  put(f.db, 5, "/b", null, "2026-08-05T12:00:00.000Z");
  recordCoverage(f.db, {
    id: "active-not-complete",
    workspace: null,
    threadId: null,
    start: "2026-08-02T00:00:00Z",
    end: "2026-10-01T00:00:00Z",
    kind: "writer-active",
  });
  recordReconciliation(f.db, false);
  acceptIdentityBatch(f.db, { hostId: "host_a", generation: 1, offset: 0, total: 0, rows: [] });
  reconcileIdentity(f.db, new AbortController().signal);
  reconcileIdentity(f.db, new AbortController().signal);
  f.db.close();
  const before = await readFile(f.path);
  const view = await f.read({ ...query, comparison: true });
  expect(view).toMatchObject({
    state: "partial",
    summary: { totalTokens: 30, activeEntities: 3, money: { capturedCost: 10, pricedEntities: 2 } },
    comparison: {
      query: { ...query, startDate: "2026-08-02", comparison: true },
      observedAt: new Date(now).toISOString(),
      prior: {
        state: "partial",
        identity: "complete",
        identityPending: false,
        coverage: { zero: false, writerActive: true, backlog: false },
        summary: {
          totalTokens: 20,
          activeEntities: 2,
          money: { capturedCost: 2, pricedEntities: 1, state: "partial" },
        },
      },
      reasons: {
        tokens: "collection-unproved",
        entities: "collection-unproved",
        "per-entity": "collection-unproved",
        cost: "collection-unproved",
        "cost-per-entity": "collection-unproved",
      },
      percentage: null,
    },
  });
  expect(await readFile(f.path)).toEqual(before);
  await f.harness.experimental_dispose();
});
it("allows only genuine inactive token zeros and refuses zero-baseline, missing-price and denominator percentages", async () => {
  const { recordCoverage } = await import("./history-coverage.js");
  const f = await fixture();
  recordCoverage(f.db, {
    id: "genuine-inactive",
    workspace: "/empty",
    threadId: null,
    start: "2026-08-02T00:00:00Z",
    end: "2026-10-01T00:00:00Z",
    kind: "observed-inactivity",
  });
  f.db.close();
  expect(
    await f.read({ ...query, scope: { kind: "workspace", workspace: "/empty" }, comparison: true }),
  ).toMatchObject({
    state: "observed-inactivity",
    summary: { totalTokens: 0, activeEntities: 0, money: { capturedCost: null } },
    comparison: {
      prior: {
        state: "observed-inactivity",
        coverage: { zero: true },
        summary: { totalTokens: 0, activeEntities: 0, money: { capturedCost: null } },
      },
      percentage: null,
      reasons: {
        tokens: "zero-baseline",
        entities: "zero-baseline",
        "per-entity": "denominator-unavailable",
        cost: "pricing-unavailable",
        "cost-per-entity": "pricing-unavailable",
      },
    },
  });
  await f.harness.experimental_dispose();
});
it("keeps retained current subtotals when the immediately prior range expired, with the same frozen scope", async () => {
  const f = await fixture();
  put(f.db, 1, "/scoped", 4, "2026-07-15T12:00:00.000Z");
  f.db.close();
  expect(
    await f.read({
      ...query,
      startDate: "2026-07-03",
      scope: { kind: "workspace", workspace: "/scoped" },
      comparison: true,
    }),
  ).toMatchObject({
    summary: { totalTokens: 10, money: { capturedCost: 4 } },
    comparison: {
      query: {
        ...query,
        startDate: "2026-06-03",
        scope: { kind: "workspace", workspace: "/scoped" },
        comparison: true,
      },
      prior: { state: "unavailable", reason: "range-unavailable" },
      percentage: null,
      reasons: { tokens: "prior-unavailable", cost: "prior-unavailable" },
    },
  });
  await f.harness.experimental_dispose();
});

it.each(["paused", "backlog", "omitted", "recovery", "unknown"])(
  "withholds percentages for %s prior collection without hiding current values",
  async (mode) => {
    const { recordCoverage, recordReconciliation } = await import("./history-coverage.js");
    const f = await fixture();
    put(f.db, 1, "/current", 4);
    recordCoverage(f.db, {
      id: "prior-inactive",
      workspace: null,
      threadId: null,
      start: "2026-08-02T00:00:00Z",
      end: "2026-09-01T00:00:00Z",
      kind: "observed-inactivity",
    });
    if (mode === "paused")
      f.db
        .prepare("INSERT INTO collector_pauses(started,ended) VALUES (?,?)")
        .run("2026-08-03T00:00:00.000Z", "2026-08-04T00:00:00.000Z");
    if (mode === "backlog") recordReconciliation(f.db, true);
    if (mode === "omitted")
      recordCoverage(f.db, {
        id: "omitted",
        workspace: null,
        threadId: null,
        start: "2026-08-03T00:00:00Z",
        end: "2026-08-04T00:00:00Z",
        kind: "omission",
      });
    if (mode === "recovery")
      f.db
        .prepare("INSERT INTO history_recovery VALUES (1,?,?)")
        .run("2026-08-03T00:00:00.000Z", "2026-08-04T00:00:00.000Z");
    if (mode === "unknown")
      f.db.prepare("DELETE FROM history_coverage WHERE id=?").run("prior-inactive");
    f.db.close();
    expect(await f.read({ ...query, comparison: true })).toMatchObject({
      summary: { totalTokens: 10, money: { capturedCost: 4 } },
      comparison: {
        prior: {
          state: "unknown",
          coverage: { zero: false },
          summary: { money: { capturedCost: null } },
        },
        percentage: null,
        reasons: { tokens: "collection-unproved" },
      },
    });
    await f.harness.experimental_dispose();
  },
);
it("compares the immediately adjacent local dates across DST, not a fixed UTC duration", async () => {
  const f = await fixture(Date.parse("2026-11-30T12:00:00Z"));
  put(f.db, 1, "/scope", 4, "2026-10-31T03:59:59.000Z");
  put(f.db, 2, "/scope", 6, "2026-10-31T04:00:00.000Z");
  f.db.close();
  expect(
    await f.read({
      ...query,
      startDate: "2026-10-31",
      timezone: "America/New_York",
      scope: { kind: "workspace", workspace: "/scope" },
      comparison: true,
    }),
  ).toMatchObject({
    summary: { totalTokens: 10, money: { capturedCost: 6 } },
    comparison: {
      query: {
        startDate: "2026-10-01",
        timezone: "America/New_York",
        scope: { kind: "workspace", workspace: "/scope" },
      },
      prior: { summary: { totalTokens: 10, money: { capturedCost: 4 } } },
    },
  });
  await f.harness.experimental_dispose();
});

it("keeps current tokens/prices when prior token arithmetic is unsafe, without claiming a monetary overflow proof", async () => {
  const f = await fixture();
  put(f.db, 1, "/current", 4);
  const record = usageRecordSchema.parse({
    version: 1,
    eventId: "00000000-0000-4000-8000-000000099999",
    provenance: "observed",
    occurredAt: "2026-08-05T12:00:00.000Z",
    sessionId: "synthetic",
    workspace: "/prior",
    providerSessionKey: null,
    claimedThreadId: null,
    provider: "openai-codex",
    model: "synthetic",
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: Number.MAX_SAFE_INTEGER,
    capturedCost: 4,
  });
  projectCompactRecord(f.db, record);
  put(f.db, 2, "/other-prior", null, "2026-08-05T12:00:00.000Z");
  f.db.close();
  expect(await f.read({ ...query, comparison: true })).toMatchObject({
    summary: { totalTokens: 10, money: { capturedCost: 4 } },
    comparison: {
      prior: { state: "unavailable", reason: "storage-unavailable" },
      percentage: null,
      reasons: { tokens: "prior-unavailable" },
    },
  });
  await f.harness.experimental_dispose();
});
