import { expect, it, vi } from "vitest";
import { createFakePluginHost, makeHostResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "../plugin/server.js";
import { createReportCache } from "./report-cache.js";
import { combineReports } from "./combined-report.js";
import { memorySummaries, recordedFixture, reportsFixture } from "./machines.test-support.js";
import { latestStart } from "../history/calendar/calendar-time.js";
import { calendarReportSchema, type CalendarQuery } from "../history/calendar/calendar-contract.js";

const now = Date.UTC(2026, 9, 1, 12);
const query: CalendarQuery = {
  startDate: latestStart(now, "UTC"),
  timezone: "UTC",
  group: "workspace",
  scope: { kind: "host" },
  includeUncertain: true,
};
it("physically removes expired summaries and indices after restart", async () => {
  const storage = memorySummaries();
  await createReportCache(storage, () => now).save("host_one", recordedFixture(query, now));
  expect((await storage.list()).length).toBe(2);
  const restarted = createReportCache(storage, () => Date.UTC(2027, 9, 1));
  expect(await restarted.read("host_one", query)).toBeNull();
  expect(await storage.list()).toEqual([]);
});
it("prunes expired reports for enrolled machines during a catalog pass", async () => {
  const storage = memorySummaries();
  await createReportCache(storage, () => now).save("host_one", recordedFixture(query, now));
  await createReportCache(storage, () => Date.UTC(2027, 9, 1)).pruneMachines(new Set(["host_one"]));
  expect(await storage.list()).toEqual([]);
});
it("rejects joint accepted and uncertain sums even when each subtotal is safe", () => {
  const data = reportsFixture(query, now);
  for (const row of data.machines) {
    if (row.report.state === "unavailable") throw new Error("Fixture must be available");
    const report = row.report,
      day = report.days[14]!;
    day.totalTokens = 4e15;
    day.classes = {
      state: "available",
      input: 4e15,
      output: 0,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
    };
    day.uncertain = { totalTokens: 1e15, records: 1 };
    report.summary.totalTokens = 4e15;
    report.summary.uncertain = { totalTokens: 1e15, records: 1 };
    report.ranking = [];
    expect(calendarReportSchema.safeParse(report).success).toBe(true);
  }
  expect(() => combineReports(data, query)).toThrow();
});
it.each([false, true])(
  "fences concurrent report saves until a public collector RPC settles, failure=%s",
  async (failure) => {
    let connected = true,
      finish!: () => void;
    const { bb, harness } = createFakePluginHost({
      pluginId: "codex-quota",
      sdk: {
        hosts: {
          list: async () => [
            makeHostResponse({ id: "host_one", status: connected ? "connected" : "disconnected" }),
          ],
          get: async () =>
            makeHostResponse({ id: "host_one", status: connected ? "connected" : "disconnected" }),
        },
      },
      experimental_callHostRpc: async ({ method, input }) => {
        if (method === "calendarReport") return recordedFixture(input as CalendarQuery, Date.now());
        if (method === "collectorControl") {
          await new Promise<void>((done) => {
            finish = done;
          });
          if (failure) throw new Error("Synthetic failure");
          return {
            state: "not-configured",
            reason: "not-configured",
            storage: "unconfigured",
            collector: "missing",
            writer: "unconfirmed",
          };
        }
        throw new Error(`Unexpected synthetic RPC ${method}`);
      },
    });
    await plugin(bb);
    try {
      const selection = (await harness.behavior.callRpc("selectHost", { hostId: "host_one" })) as {
        generation: number;
      };
      const request = {
        query: { ...query, startDate: latestStart(Date.now(), "UTC") },
        prepare: false,
        refresh: false,
      };
      await harness.behavior.callRpc("machineReports", request);
      const action = harness.behavior.callRpc("collectorControl", {
        hostId: "host_one",
        generation: selection.generation,
        action: "pause",
      });
      await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
      await harness.behavior.callRpc("machineReports", request);
      finish();
      await action;
      connected = false;
      const offline = (await harness.behavior.callRpc("machineReports", request)) as {
        machines: { cached: boolean; report: { state: string } }[];
      };
      expect(offline.machines[0]!.cached).toBe(false);
      expect(offline.machines[0]!.report.state).toBe("unavailable");
    } finally {
      await harness.lifecycle.dispose();
    }
  },
);
