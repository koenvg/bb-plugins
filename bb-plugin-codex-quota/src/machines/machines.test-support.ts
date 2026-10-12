import { emptyActivity } from "../activity/activity-contract.js";
import { calendarSnapshot } from "../history/calendar/calendar-test-support.js";
import type { CalendarQuery } from "../history/calendar/calendar-contract.js";
import type { MachineAccounts, Machine, MachineReports } from "./machines-contract.js";
import type { SummaryStorage } from "./report-cache.js";

export function memorySummaries(): SummaryStorage {
  const rows = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => structuredClone(rows.get(key)) as T | undefined,
    set: async (key, value) => {
      rows.set(key, structuredClone(value));
    },
    delete: async (key) => {
      rows.delete(key);
    },
    list: async (prefix = "") => [...rows.keys()].filter((key) => key.startsWith(prefix)),
  };
}
export function quotaFixture(now: number, percent = 63) {
  return {
    state: "fresh" as const,
    reason: "ok" as const,
    snapshot: {
      observedAt: new Date(now).toISOString(),
      plan: "plus" as const,
      general: [
        {
          id: "primary_window",
          name: "5 hours",
          remainingPercent: percent,
          resetAt: new Date(now + 7200000).toISOString(),
        },
        {
          id: "secondary_window",
          name: "7 days",
          remainingPercent: 72,
          resetAt: new Date(now + 86400000).toISOString(),
        },
      ],
      additional: [],
      bankedResets: 0,
      bindingWindowId: "primary_window",
      bindingRemainingPercent: percent,
    },
  };
}
export const machineFixture = (
  id = "host_one",
  status: Machine["status"] = "connected",
): Machine => ({ id, name: id === "host_one" ? "MacBook" : "Build server", status });
export function accountsFixture(now = Date.now(), multiple = false): MachineAccounts {
  const machines = [machineFixture(), machineFixture("host_two")];
  return {
    machines,
    truncated: false,
    accounts: multiple
      ? machines.map((machine, index) => ({
          key: `account-${index + 1}`,
          machines: [machine.id],
          identity: "verified",
          quota: quotaFixture(now, index ? 38 : 63),
          activity: emptyActivity("unavailable"),
        }))
      : [
          {
            key: "account-shared",
            machines: machines.map((machine) => machine.id),
            identity: "verified",
            quota: quotaFixture(now),
            activity: emptyActivity("unavailable"),
          },
        ],
  };
}
export function recordedFixture(query: CalendarQuery, now: number) {
  const report = calendarSnapshot(query, now);
  report.summary.activeEntities = 1;
  const priced = {
    state: "available" as const,
    capturedCost: 3,
    pricedRecords: 1,
    records: 1,
    pricedEntities: 1,
    reason: "ok" as const,
  };
  report.summary.money = priced;
  report.days[14]!.activeEntities = 1;
  report.days[14]!.money = priced;
  report.ranking = [{ ...report.ranking[0]!, totalTokens: 600, money: priced }];
  report.truncated = false;
  return report;
}
export function reportsFixture(query: CalendarQuery, now = Date.now()): MachineReports {
  return {
    machines: [machineFixture(), machineFixture("host_two")].map((machine) => ({
      machine,
      cached: false,
      report: recordedFixture(query, now),
      preparation: { state: "settled", progress: "ready" },
    })),
    truncated: false,
    cache: "saved",
  };
}
