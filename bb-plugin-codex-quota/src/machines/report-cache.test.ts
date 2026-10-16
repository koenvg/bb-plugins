import { expect, it } from "vitest";
import { createReportCache } from "./report-cache.js";
import { memorySummaries, recordedFixture } from "./machines.test-support.js";
import type { CalendarQuery } from "../history/calendar/calendar-contract.js";

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
