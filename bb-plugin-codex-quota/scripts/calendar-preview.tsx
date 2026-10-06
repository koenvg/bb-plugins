// Public SDK React fixture. All RPCs are synthetic. No installed BB or live sources.
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import {
  calendarEmptySnapshot,
  calendarSnapshot,
} from "../src/history/calendar/calendar-test-support.js";
import type { CalendarQuery } from "../src/history/calendar/calendar-contract.js";
import { importUnavailable } from "../src/history/import/import-contract.js";

const state = new URLSearchParams(location.search).get("state") ?? "partial";
const now = Date.parse("2026-10-01T12:00:00Z");
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
function snapshot(query: CalendarQuery) {
  if (state === "unknown" || state === "inactive")
    return calendarEmptySnapshot(query, state === "unknown" ? "unknown" : "observed-inactivity");
  const view = calendarSnapshot(query, state === "stale" ? now - 600000 : now);
  const amount =
    state === "tiny"
      ? Number.MIN_VALUE
      : state === "huge"
        ? Number.MAX_SAFE_INTEGER
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
  view.previous = query.startDate > "2026-07-03";
  view.next = query.startDate < "2026-09-01";
  return view;
}
const missing = {
  state: "not-configured",
  reason: "not-configured",
  storage: "unconfigured",
  collector: "missing",
  writer: "unconfirmed",
};
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
    selection: async (input: unknown) => {
      record("selection", input);
      return selection;
    },
    selectHost: async (input: unknown) => {
      record("selectHost", input);
      const next = {
        hostId: (input as { hostId: string | null }).hostId,
        generation: ++generation,
      };
      if (state === "selection") await new Promise<void>((resolve) => pending.push(resolve));
      return (selection = next);
    },
    read: async (input: unknown) => {
      record("read", input);
      return {
        state: "fresh",
        reason: "ok",
        snapshot: {
          observedAt: new Date(now).toISOString(),
          plan: null,
          general: [
            {
              id: "primary_window",
              name: "5 hours",
              remainingPercent: 42,
              resetAt: new Date(now + 3600000).toISOString(),
            },
          ],
          additional: [],
          bindingWindowId: "primary_window",
          bindingRemainingPercent: 42,
          bankedResets: 0,
        },
      };
    },
    calendarReport: async (input: unknown) => {
      record("calendarReport", input);
      const { hostId, query } = input as { hostId: string; query: CalendarQuery };
      reportCalls++;
      if (state === "loading") return new Promise(() => {});
      if (state === "unavailable") return { state: "unavailable", reason: "storage-incompatible" };
      if (state === "retry" && reportCalls === 1)
        return { state: "unavailable", reason: "host-offline" };
      if (state === "latest" && hostId === "host_b" && query.startDate !== "2026-09-01")
        return { state: "unavailable", reason: "range-unavailable" };
      if (state === "stale" && reportCalls > 1) throw Error("Synthetic failed refresh");
      if (state === "cancel" && hostId === "host_a" && query.startDate === "2026-08-02")
        await new Promise<void>((resolve) => pending.push(resolve));
      return snapshot(query);
    },
    activity: async (input: unknown) => {
      record("activity", input);
      return { state: "unavailable", reason: "unavailable", snapshot: null };
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
