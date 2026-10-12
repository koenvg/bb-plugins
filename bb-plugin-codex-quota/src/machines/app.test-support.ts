import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { vi } from "vitest";
import { accountsFixture, machineFixture, reportsFixture } from "./machines.test-support.js";
import type { MachineAccounts, MachineReports } from "./machines-contract.js";
import type { CalendarQuery, CalendarReport } from "../history/calendar/calendar-contract.js";
import type { QuotaStatus } from "../quota/contract.js";
import { emptyActivity } from "../activity/activity-contract.js";
import { importUnavailable } from "../history/import/import-contract.js";

export function metadataFixture(ids = ["host_a", "host_b"], quota?: QuotaStatus): MachineAccounts {
  const machines = ids.map((id, index) => ({
    ...machineFixture(id),
    name: `Host ${String.fromCharCode(65 + index)}`,
  }));
  return quota
    ? {
        machines,
        truncated: false,
        accounts: [
          {
            key: "shared",
            machines: ids,
            identity: "verified",
            quota,
            activity: emptyActivity("unavailable"),
          },
        ],
      }
    : {
        machines,
        truncated: false,
        accounts: machines.map((machine) => ({
          key: `unknown-${machine.id}`,
          machines: [machine.id],
          identity: "unknown",
          quota: { state: "unavailable", reason: "auth-required", snapshot: null },
          activity: emptyActivity("auth-required"),
        })),
      };
}
export function reportFixture(report: CalendarReport, id = "host_a"): MachineReports {
  return {
    machines: [
      {
        machine: { id, name: "Host A", status: "connected" },
        cached: false,
        report,
        preparation: { state: "settled", progress: "ready" },
      },
    ],
    truncated: false,
    cache: "saved",
  };
}
export const missingHistory = {
  state: "not-configured",
  reason: "not-configured",
  storage: "unconfigured",
  collector: "missing",
  writer: "unconfirmed",
} as const;
export async function dashboardFixture() {
  const app = await loadPluginApp(() => import("../plugin/app.js"));
  const data = accountsFixture();
  const machineAccounts = vi.fn(async (_input: unknown): Promise<unknown> => data);
  const machineReports = vi.fn(async (input: unknown): Promise<unknown> =>
    reportsFixture((input as { query: CalendarQuery }).query),
  );
  const machinePreparation = vi.fn(async (_input: unknown): Promise<unknown> => ({
    state: "settled",
    progress: "ready",
  }));
  let generation = 0;
  const selectHost = vi.fn(async (input: unknown) => ({
    hostId: (input as { hostId: string }).hostId,
    generation: ++generation,
  }));
  const historyReadiness = vi.fn(async (_input: unknown): Promise<unknown> => missingHistory);
  const historicalImport = vi.fn(async (_input: unknown): Promise<unknown> =>
    importUnavailable("not-configured"),
  );
  const collectorControl = vi.fn(async (_input: unknown): Promise<unknown> => missingHistory);
  const options = {
    rpc: {
      machineAccounts,
      machineReports,
      machinePreparation,
      selectHost,
      historyReadiness,
      historicalImport,
      collectorControl,
    },
  };
  const page = () => renderSlot(app.navPanels[0]!, { subPath: "" }, options);
  const settings = () => renderSlot(app.settingsSections[0]!, {}, options);
  return { app, data, options, page, settings, ...options.rpc };
}
