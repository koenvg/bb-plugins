import { expect, it } from "vitest";
import { createReportCache } from "./report-cache.js";
import { memorySummaries, recordedFixture } from "./machines.test-support.js";
import type { CalendarQuery } from "../history/calendar/calendar-contract.js";
import { calendarModelCostSnapshot } from "../history/calendar/calendar-test-support.js";
import { comparisonReasons } from "../history/calendar/calendar-comparison.js";

const now = Date.parse("2026-10-01T12:00:00Z");
const query: CalendarQuery = {
  startDate: "2026-09-02",
  timezone: "UTC",
  group: "workspace",
  scope: { kind: "host" },
  includeUncertain: true,
};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

it.each(["save", "removeQuery", "remove"] as const)(
  "retires a queued %s after its admission revision changes",
  async (operation) => {
    const storage = memorySummaries(),
      cache = createReportCache(storage, () => now);
    await cache.save("host_one", recordedFixture(query, now));
    const get = storage.get,
      entered = deferred(),
      release = deferred();
    let hold = true;
    storage.get = async <T>(key: string) => {
      if (hold) {
        hold = false;
        entered.resolve();
        await release.promise;
      }
      return get<T>(key);
    };
    const waiting = cache.read("host_one", query);
    await entered.promise;
    let revision = 0;
    const fresh = recordedFixture(query, now);
    fresh.days[14].totalTokens = fresh.summary.totalTokens = 900;
    fresh.days[14].classes = { state: "unavailable" };
    const next = cache.save("host_one", fresh, () => revision === 1);
    const retired =
      operation === "save"
        ? cache.save("host_one", recordedFixture(query, now), () => revision === 0)
        : operation === "removeQuery"
          ? cache.removeQuery("host_one", query, () => revision === 0)
          : cache.remove("host_one", () => revision === 0);
    revision = 1;
    release.resolve();
    await Promise.all([waiting, next, retired]);
    expect((await cache.read("host_one", query))?.summary).toMatchObject({
      totalTokens: 900,
      money: { capturedCost: 3 },
    });
  },
);

it("requires the requested start to meet the compact cutoff even when cached days overlap", async () => {
  const storage = memorySummaries(),
    cache = createReportCache(storage, () => now);
  const retained = { ...query, startDate: "2026-06-23" };
  await cache.save("host_one", recordedFixture(retained, now));
  expect(
    (await cache.read("host_one", { ...query, startDate: "2026-06-22" }))?.summary.totalTokens,
  ).toBe(600);
  expect(await cache.read("host_one", { ...query, startDate: "2026-06-21" })).toBeNull();
});

it("keeps only eight query payloads and preserves daily exact totals when rankings exceed the KV bound", async () => {
  const storage = memorySummaries(),
    cache = createReportCache(storage, () => now);
  for (let n = 0; n < 9; n++) {
    const q = { ...query, scope: { kind: "workspace" as const, workspace: `/workspace-${n}` } };
    const report = recordedFixture(q, now);
    report.ranking = Array.from({ length: 50 }, (_, i) => ({
      ...report.ranking[0],
      key: `/${i}`,
      label: "x".repeat(10000),
    }));
    await cache.save("host_one", report);
  }
  expect((await storage.list()).length).toBe(9);
  expect(
    await cache.read("host_one", {
      ...query,
      scope: { kind: "workspace", workspace: "/workspace-0" },
    }),
  ).toBeNull();
  const latest = await cache.read("host_one", {
    ...query,
    scope: { kind: "workspace", workspace: "/workspace-8" },
  });
  expect(latest?.summary).toMatchObject({ totalTokens: 600, money: { capturedCost: 3 } });
  expect(latest?.ranking).toEqual([]);
  expect(latest?.truncated).toBe(true);
});

it("decodes legacy speed keys before both cache validation paths without deleting valid history", async () => {
  const storage = memorySummaries(),
    cache = createReportCache(storage, () => now);
  await cache.save("host_one", recordedFixture(query, now));
  const key = (await storage.list()).find((key) => !key.endsWith("index"))!;
  const legacy = await storage.get<any>(key);
  legacy.summary.speedTokens = "obsolete malformed bucket";
  legacy.days[14].speedTokens = { fast: "obsolete" };
  legacy.days[14].models = {
    named: [{ model: "legacy-named", totalTokens: 300, speedTokens: false }],
    otherTokens: 0,
    otherSpeedTokens: "obsolete",
  };
  await storage.set(key, legacy);
  const report = await cache.read("host_one", query);
  expect(report?.summary.totalTokens).toBe(600);
  expect(report?.summary.money.capturedCost).toBe(3);
  expect(report?.days[14].models).toEqual({
    named: [{ model: "legacy-named", totalTokens: 300 }],
    otherTokens: 0,
  });
  expect(JSON.stringify(report)).not.toMatch(/speedTokens|otherSpeedTokens/);
  const unrelated = { ...query, timezone: "Europe/Paris" };
  await cache.removeQuery("host_one", unrelated);
  expect(await storage.get(key)).toEqual(legacy);
  expect((await cache.read("host_one", query))?.summary.totalTokens).toBe(600);
});

it.each([-1, 601])("rejects genuine malformed legacy model attribution %s", async (tokens) => {
  const storage = memorySummaries(),
    cache = createReportCache(storage, () => now);
  await cache.save("host_one", recordedFixture(query, now));
  const key = (await storage.list()).find((key) => !key.endsWith("index"))!;
  const legacy = await storage.get<any>(key);
  legacy.days[14].models = {
    named: [{ model: "legacy-named", totalTokens: tokens }],
    otherTokens: 0,
  };
  legacy.days[14].speedTokens = "ignored";
  await storage.set(key, legacy);
  expect(await cache.read("host_one", query)).toBeNull();
});

it("preserves captured model money and comparison summaries through legacy cache decoding", async () => {
  const storage = memorySummaries(),
    cache = createReportCache(storage, () => now);
  const compared = { ...query, includeUncertain: false, comparison: true };
  const original = calendarModelCostSnapshot(compared);
  original.comparison!.reasons = comparisonReasons(original, original.comparison!.prior);
  await cache.save("host_one", original);
  const key = (await storage.list()).find((key) => !key.endsWith("index"))!;
  const legacy = await storage.get<any>(key);
  legacy.comparison.prior.summary.speedTokens = { malformed: true };
  legacy.summary.speedTokens = null;
  legacy.days[14].speedTokens = -1;
  await storage.set(key, legacy);
  const decoded = await cache.read("host_one", compared);
  expect(decoded).toEqual(original);
  expect(decoded?.days[14].money.capturedCost).toBe(323.7267296);
  expect(decoded?.days[14].modelCosts).toEqual(original.days[14].modelCosts);
  await cache.removeQuery("host_one", { ...compared, timezone: "Europe/Paris" });
  expect(await storage.get(key)).toEqual(legacy);
});

it.each([-1, Number.MAX_SAFE_INTEGER + 1, "600"])(
  "rejects malformed legacy scalar totals %s rather than accepting obsolete buckets",
  async (totalTokens) => {
    const storage = memorySummaries(),
      cache = createReportCache(storage, () => now);
    await cache.save("host_one", recordedFixture(query, now));
    const key = (await storage.list()).find((key) => !key.endsWith("index"))!;
    const legacy = await storage.get<any>(key);
    legacy.days[14].totalTokens = totalTokens;
    legacy.days[14].speedTokens = { normal: 600, fast: 0, ultrafast: 0 };
    await storage.set(key, legacy);
    expect(await cache.read("host_one", query)).toBeNull();
  },
);
