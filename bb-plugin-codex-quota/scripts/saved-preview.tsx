import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { CalendarQuery } from "../src/history/calendar/calendar-contract.js";
import { accountsFixture, reportsFixture } from "../src/machines/machines.test-support.js";

const now = Date.parse("2026-10-01T12:00:00Z");
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args: [] | [string | number]) {
    super(args.length ? args[0] : now);
  }
  static now() {
    return now;
  }
} as DateConstructor;
const cold = new URLSearchParams(location.search).get("state") === "cold";
const events: { event: string; query?: CalendarQuery }[] = [];
const errors: string[] = [];
window.addEventListener("error", (event) => errors.push(event.message));
window.addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)));
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((done) => {
    release = done;
  });
  return { promise, release };
}
const live = gate(),
  preparation = gate(),
  saved = gate(),
  threads = gate();
function observation(query: CalendarQuery, tokens: number, cached: boolean) {
  const value = reportsFixture(query, now);
  for (const row of value.machines) {
    row.cached = cached;
    if (row.report.state === "unavailable") throw Error("Synthetic history missing");
    const report = row.report;
    report.summary.totalTokens = report.days[14].totalTokens = tokens / 2;
    report.days[14].classes = { state: "unavailable" };
    report.summary.money.capturedCost = report.days[14].money.capturedCost =
      tokens === 1200 ? 3 : 4.5;
    report.ranking[0].totalTokens = tokens / 2;
  }
  return value;
}
const app = await loadPluginApp(() => import("../src/plugin/app.js"));
const options = {
  rpc: {
    machineAccounts: async () => {
      events.push({ event: "accounts-request" });
      return accountsFixture(now);
    },
    machinePreparation: async () => {
      events.push({ event: "preparation-request" });
      await preparation.promise;
      events.push({ event: "preparation-response" });
      return { state: "settled", progress: "synthetic-ready" };
    },
    machineReportSnapshot: async (input: unknown) => {
      const { query } = input as { query: CalendarQuery };
      events.push({ event: "saved-request", query });
      if (query.group === "thread") await threads.promise;
      if (cold) await saved.promise;
      events.push({ event: "saved-response", query });
      return observation(query, 1200, true);
    },
    machineReports: async (input: unknown) => {
      const { query } = input as { query: CalendarQuery };
      events.push({ event: "live-request", query });
      await live.promise;
      events.push({ event: "live-response", query });
      return observation(query, 1800, false);
    },
  },
};
const page = renderSlot(app.navPanels[0]!, { subPath: "" }, options);
page.container.setAttribute("data-bb-plugin", "codex-quota");
document.getElementById("root")!.append(page.container);
events.push({ event: "opened" });
Object.assign(window, {
  savedFixture: {
    events,
    errors,
    release: (name: "live" | "preparation" | "saved" | "threads") => {
      events.push({ event: `release-${name}` });
      ({ live, preparation, saved, threads })[name].release();
    },
  },
});
