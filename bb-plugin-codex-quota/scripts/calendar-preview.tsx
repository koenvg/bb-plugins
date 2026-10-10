// Public SDK React fixture. All RPCs are synthetic. No installed BB or live sources.
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import {
  calendarEmptySnapshot,
  calendarSnapshot,
} from "../src/history/calendar/calendar-test-support.js";
import type { CalendarQuery } from "../src/history/calendar/calendar-contract.js";
import type { MachineReports } from "../src/machines/machines-contract.js";
import { accountsFixture, quotaFixture } from "../src/machines/machines.test-support.js";
import { importUnavailable } from "../src/history/import/import-contract.js";
import { latestStart, shiftDate } from "../src/history/calendar/calendar-time.js";

const state = new URLSearchParams(location.search).get("state") ?? "partial";
const now = Date.parse("2026-10-01T12:00:00Z");
const latestRange = latestStart(now, "UTC");
const RealDate = Date;
// Freeze the app clock, but leave browser timers and rendering real.
globalThis.Date = class extends RealDate {
  constructor(...args: [] | [string | number]) {
    super(args.length ? args[0] : now);
  }
  static now() {
    return now;
  }
} as DateConstructor;
const errors: string[] = [];
window.addEventListener("error", (event) => errors.push(event.message));
window.addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)));
const calls: { method: string; input: unknown }[] = [];
const pending: (() => void)[] = [];
let generation = 1;
let reportCalls = 0;
let selection = { hostId: "host_a" as string | null, generation };
const record = (method: string, input: unknown) => calls.push({ method, input });
const accounts = accountsFixture(now);
accounts.machines = [
  { id: "host_a", name: "Host A", status: "connected" },
  { id: "host_b", name: "Host B", status: state === "offline" ? "disconnected" : "connected" },
];
accounts.accounts[0].machines = ["host_a", "host_b"];
accounts.accounts[0].quota = quotaFixture(now, 42);
const emptySnapshot = (query: CalendarQuery) => ({
  ...calendarEmptySnapshot(query, state === "inactive" ? "observed-inactivity" : "unknown"),
  previous: query.startDate > shiftDate(latestRange, -60),
  next: query.startDate < latestRange,
});
function snapshot(query: CalendarQuery) {
  if (state === "unknown" || state === "inactive") return emptySnapshot(query);
  const view = calendarSnapshot(query, state === "stale" ? now - 600000 : now);
  if (query.includeUncertain && state === "partial") {
    view.days[14].uncertain = { totalTokens: 300, records: 3 };
    view.summary.uncertain = { totalTokens: 300, records: 3 };
  }
  const amount =
    state === "tiny"
      ? Number.MIN_VALUE
      : state === "huge"
        ? Number.MAX_SAFE_INTEGER
        : state === "partial"
          ? 287.24
          : 0.39813160000000003;
  if (state !== "no-prices") {
    view.days[14].money = {
      state: "partial",
      capturedCost: amount,
      pricedRecords: 1,
      records: 60,
      pricedEntities: 1,
      reason: "missing-prices",
    };
    view.summary.money = { ...view.days[14].money };
  }
  if (state === "expired") view.days[14].classes = { state: "unavailable" };
  if (state === "huge")
    view.days[14].totalTokens = view.summary.totalTokens = Number.MAX_SAFE_INTEGER;
  if (query.group === "thread") {
    view.days[14].totalTokens = view.summary.totalTokens = 500;
    view.days[14].activeEntities = view.summary.activeEntities = 50;
    view.days[14].money.records = view.summary.money.records = 50;
    view.days[14].classes = {
      state: "available",
      input: 200,
      output: 300,
      reasoning: 100,
      cacheRead: 200,
      cacheWrite: 0,
    };
  }
  view.previous = query.startDate > shiftDate(latestRange, -60);
  view.next = query.startDate < latestRange;
  return view;
}
const missing = {
  state: "not-configured",
  reason: "not-configured",
  storage: "unconfigured",
  collector: "missing",
  writer: "unconfirmed",
};
const preparation: MachineReports["machines"][number]["preparation"] = ["stale", "retry"].includes(
  state,
)
  ? { state: "unavailable" as const, reason: "storage-unavailable" as const, progress: "" }
  : { state: "settled" as const, progress: "ready" };
const options = {
  sdk: {
    hosts: {
      list: async () =>
        ["a", "b"].map((id) => ({
          id: `host_${id}`,
          name: `Host ${id.toUpperCase()}`,
          type: "persistent" as const,
          status: "connected" as const,
          machineProviderId: null,
          lifecycle: {
            phase: "active" as const,
            suspendedAt: null,
            message: null,
            pendingLog: "",
            teardown: null,
          },
          maxPermissionMode: "full" as const,
          lastSeenAt: null,
          lastRejectedProtocolVersion: null,
          createdAt: 0,
          updatedAt: 0,
        })),
    },
  },
  rpc: {
    machineAccounts: async (input: unknown) => {
      record("machineAccounts", input);
      return accounts;
    },
    machinePreparation: async (input: unknown) => {
      record("machinePreparation", input);
      return preparation;
    },
    machineReports: async (input: unknown): Promise<MachineReports> => {
      record("machineReports", input);
      const { query } = input as { query: CalendarQuery };
      if (query.group === "workspace") reportCalls++;
      if (state === "loading") return new Promise(() => {});
      if (state === "stale" && query.group === "workspace" && reportCalls > 1)
        throw Error("Synthetic failed refresh");
      if (state === "cancel" && query.startDate === shiftDate(latestRange, -30))
        await new Promise<void>((resolve) => pending.push(resolve));
      const unavailable =
        state === "unavailable" ||
        (state === "retry" && reportCalls === 1) ||
        (state === "latest" && query.startDate !== latestRange);
      return {
        machines: accounts.machines.map((machine, index) => ({
          machine,
          cached: state === "offline" && index === 1,
          preparation,
          report: unavailable
            ? {
                state: "unavailable",
                reason:
                  state === "unavailable"
                    ? "storage-incompatible"
                    : state === "latest"
                      ? "range-unavailable"
                      : "host-offline",
              }
            : index === 0 || state === "offline"
              ? snapshot(query)
              : emptySnapshot(query),
        })),
        truncated: false,
        cache: "saved",
      };
    },
    selection: async (input: unknown) => {
      record("selection", input);
      return selection;
    },
    selectHost: async (input: unknown) => {
      record("selectHost", input);
      return (selection = {
        hostId: (input as { hostId: string | null }).hostId,
        generation: ++generation,
      });
    },
    historyReadiness: async (input: unknown) => {
      record("historyReadiness", input);
      if (state === "settings") await new Promise<void>((resolve) => pending.push(resolve));
      return missing;
    },
    historicalImport: async (input: unknown) => {
      record("historicalImport", input);
      if ((input as { command: { action: string } }).command.action !== "status")
        throw Error("Only synthetic import status is allowed");
      if (state === "settings") await new Promise<void>((resolve) => pending.push(resolve));
      return importUnavailable("not-configured");
    },
  },
};
const app = await loadPluginApp(() => import("../src/plugin/app.js"));
const owner = renderSlot(
  app.appOverlays.find((item) => item.id === "quota-refresh")!,
  {},
  options,
);
let page: ReturnType<typeof renderSlot>;
function show(settings: boolean) {
  page?.lifecycle.unmount();
  page?.container.remove();
  page = settings
    ? renderSlot(app.settingsSections[0]!, {}, options)
    : renderSlot(app.navPanels[0]!, { subPath: "" }, options);
  page.container.setAttribute("data-bb-plugin", "codex-quota");
  document.getElementById("root")!.append(page.container);
}
const controls = document.createElement("nav");
controls.setAttribute("aria-label", "Synthetic fixture controls");
for (const [label, action] of [
  ["Show usage settings", () => show(true)],
  ["Show chart", () => show(false)],
  ["Release pending responses", () => pending.splice(0).forEach((resolve) => resolve())],
] as const) {
  const button = document.createElement("button");
  button.textContent = label;
  button.onclick = action;
  controls.append(button);
}
document.body.prepend(controls);
Object.assign(window, {
  calendarFixture: {
    calls,
    errors,
    pending: () => pending.length,
    dispose: () => {
      page.lifecycle.unmount();
      owner.lifecycle.unmount();
    },
  },
});
show(false);
