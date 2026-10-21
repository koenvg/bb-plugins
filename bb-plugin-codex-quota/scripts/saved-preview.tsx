import { Profiler } from "react";
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
const fixtureState = new URLSearchParams(location.search).get("state");
const modelTransition = ["model-transition", "model-replacement"].includes(fixtureState ?? "");
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
    if (modelTransition) {
      const day = report.days[14];
      const empty = {
        state: "unavailable" as const,
        capturedCost: null,
        records: 0,
        pricedRecords: 0,
        reason: "missing-prices" as const,
      };
      const models = cached ? ["A"] : fixtureState === "model-replacement" ? ["B"] : ["B", "C"];
      const money = models.map((_, index) => ({
        state: "available" as const,
        capturedCost: cached ? 3 : models.length === 1 ? 4.5 : index === 0 ? 1.5 : 3,
        records: 1,
        pricedRecords: 1,
        reason: "ok" as const,
      }));
      day.models = {
        named: models.map((model) => ({ model, totalTokens: day.totalTokens / models.length })),
        otherTokens: 0,
      };
      day.modelCosts = {
        named: models.map((model, index) => ({ model, money: money[index] })),
        other: empty,
        unknown: empty,
      };
      day.money = { ...day.money, records: models.length, pricedRecords: models.length };
      report.summary.money = { ...day.money };
    }
  }
  return value;
}
const app = await loadPluginApp(() => import("../src/plugin/app.js"));
const tooltipCommits: { subtotal: string | null; models: string[] }[] = [];
const Panel = app.navPanels[0]!.component;
function ObservedPanel(props: { subPath: string }) {
  return (
    <Profiler
      id="cost-tooltip-coherence"
      onRender={() => {
        tooltipCommits.push({
          subtotal:
            document.querySelector('[aria-label="Captured cost subtotal"]')?.textContent ?? null,
          models: Array.from(
            document.querySelectorAll('[aria-label="Captured cost by model"] li'),
            (row) => row.textContent ?? "",
          ),
        });
      }}
    >
      <Panel {...props} />
    </Profiler>
  );
}
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
const page = renderSlot(
  modelTransition ? { component: ObservedPanel } : app.navPanels[0]!,
  { subPath: "" },
  options,
);
page.container.setAttribute("data-bb-plugin", "codex-quota");
document.getElementById("root")!.append(page.container);
events.push({ event: "opened" });
Object.assign(window, {
  savedFixture: {
    events,
    tooltipCommits,
    errors,
    release: (name: "live" | "preparation" | "saved" | "threads") => {
      events.push({ event: `release-${name}` });
      ({ live, preparation, saved, threads })[name].release();
    },
  },
});
