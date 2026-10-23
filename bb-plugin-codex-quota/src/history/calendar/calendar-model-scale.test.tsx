// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CalendarChart } from "./calendar-tanstack.js";
import { CalendarValues } from "./calendar-view.js";
import { chartData } from "./calendar-chart-data.js";
import { capturedSubtotal } from "./calendar-model-costs.js";
import { calendarSnapshot } from "./calendar-test-support.js";

const query = {
  startDate: "2026-09-01",
  timezone: "UTC",
  group: "workspace" as const,
  scope: { kind: "host" as const },
  includeUncertain: true,
};
afterEach(cleanup);
const ticks = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll("[data-ts-key^='y-tick-label:']"),
    (node) => node.textContent,
  );
const bars = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".ts-chart__bar rect"), (node) => ({
    height: Number(node.getAttribute("height")),
    y: Number(node.getAttribute("y")),
  })).filter((bar) => bar.height > 0);

it("recovers a minimum positive model price and removes its marker after filtering a huge model", () => {
  const view = calendarSnapshot(query);
  for (const [index, model, capturedCost] of [
    [14, "Huge", Number.MAX_SAFE_INTEGER],
    [15, "Tiny", Number.MIN_VALUE],
  ] as const) {
    const day = view.days[index];
    day.money = {
      state: "available",
      capturedCost,
      records: 1,
      pricedRecords: 1,
      pricedEntities: 1,
      reason: "ok",
    };
    day.modelCosts = {
      named: [{ model, money: capturedSubtotal(capturedCost, 1, 1) }],
      other: capturedSubtotal(null, 0, 0),
      unknown: capturedSubtotal(null, 0, 0),
    };
  }
  const original = structuredClone(view);
  const data = chartData(view.days, "cost");
  const tiny = data.models.find((model) => model.label === "Tiny")!;
  expect(data.rows[15].modelFacts[tiny.key]).toBe(5e-324);
  expect(data.rows[15].modelHeights[tiny.key]).toBe(0);
  const page = render(<CalendarValues view={view} metric="cost" />);
  const table = screen.getByRole("table", { name: "Daily recorded usage" });
  const fullFacts = table.textContent;
  expect(ticks(page.container)).toEqual(["$0", "$2252T", "$4504T", "$6755T", "$9007T"]);
  expect(page.container.querySelectorAll(".calendar-positive-usage")).toHaveLength(1);
  expect(
    page.container.querySelector(".calendar-positive-usage")?.getAttribute("data-ts-key"),
  ).toBe(`positive:${view.days[15].date}`);
  fireEvent.click(screen.getByRole("button", { name: "Huge" }));
  expect(ticks(page.container)).toEqual(["$0", "<$1"]);
  expect(bars(page.container)).toEqual([{ height: 220, y: 14 }]);
  expect(page.container.querySelectorAll(".calendar-positive-usage")).toHaveLength(0);
  expect(table.textContent).toBe(fullFacts);
  fireEvent.click(screen.getByRole("button", { name: "Tiny" }));
  expect(ticks(page.container)).toEqual(["$0"]);
  expect(bars(page.container)).toEqual([]);
  expect(screen.getByRole("status").textContent).toBe(
    "All model cost series hidden. Recorded usage is not zero.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Restore all series" }));
  expect(bars(page.container)).toEqual([{ height: 220, y: 14 }]);
  expect(page.container.querySelectorAll(".calendar-positive-usage")).toHaveLength(1);
  expect(table.textContent).toBe(fullFacts);
  expect(view).toEqual(original);
});

it("uses only drawn uncertainty in the scale and tiny-positive markers", () => {
  const view = calendarSnapshot(query);
  view.days[14].uncertain = { totalTokens: 300, records: 1 };
  view.days[15].uncertain = { totalTokens: 1, records: 1 };
  const data = chartData(view.days, "tokens");
  const original = structuredClone(data);
  const draw = (includeUncertain: boolean, visibleModels = data.models) => (
    <CalendarChart
      data={data}
      metric="tokens"
      visibleModels={visibleModels}
      includeUncertain={includeUncertain}
    />
  );
  const page = render(draw(false));
  expect(ticks(page.container)).toEqual(["0", "150", "300", "450", "600"]);
  expect(bars(page.container)).toEqual([{ height: 220, y: 14 }]);
  expect(page.container.querySelectorAll(".calendar-positive-usage")).toHaveLength(0);
  page.rerender(draw(true));
  expect(ticks(page.container)).toEqual(["0", "225", "450", "675", "900"]);
  expect(
    page.container.querySelector(".calendar-positive-usage")?.getAttribute("data-ts-key"),
  ).toBe(`positive:${view.days[15].date}`);
  expect(page.container.querySelectorAll(".calendar-positive-usage")).toHaveLength(1);
  page.rerender(draw(true, []));
  expect(ticks(page.container)).toEqual(["0", "75", "150", "225", "300"]);
  expect(bars(page.container)).toEqual([
    { height: 220, y: 14 },
    { height: 0.73, y: 233.27 },
  ]);
  expect(page.container.querySelectorAll(".calendar-positive-usage")).toHaveLength(1);
  page.rerender(draw(false, []));
  expect(ticks(page.container)).toEqual(["0"]);
  expect(bars(page.container)).toEqual([]);
  expect(page.container.querySelectorAll(".calendar-positive-usage")).toHaveLength(0);
  expect(data).toEqual(original);
});

it("keeps unavailable daily cost stacks hidden even when a model has a captured price", () => {
  const view = calendarSnapshot(query);
  const day = view.days[14];
  day.money = {
    state: "unavailable",
    capturedCost: null,
    records: 2,
    pricedRecords: 2,
    pricedEntities: 1,
    reason: "unsafe-sum",
  };
  day.modelCosts = {
    named: [
      { model: "A", money: capturedSubtotal(Number.MAX_SAFE_INTEGER, 1, 1) },
      { model: "B", money: capturedSubtotal(1, 1, 1) },
    ],
    other: capturedSubtotal(null, 0, 0),
    unknown: capturedSubtotal(null, 0, 0),
  };
  const data = chartData(view.days, "cost");
  const page = render(
    <CalendarChart
      data={data}
      metric="cost"
      visibleModels={[data.models[0]]}
      includeUncertain={false}
    />,
  );
  expect(ticks(page.container)).toEqual(["$0"]);
  expect(bars(page.container)).toEqual([]);
  expect(page.container.querySelectorAll(".calendar-positive-usage")).toHaveLength(0);
  expect(data.rows[14].modelFacts[data.models[0].key]).toBe(Number.MAX_SAFE_INTEGER);
});

it.each([
  { metric: "entities", labels: ["0", "15", "30", "45", "60"], count: 1 },
  { metric: "per-entity", labels: ["0", "3", "5", "8", "10"], count: 1 },
  { metric: "cost-per-entity", labels: ["$0", "$0"], count: 0 },
] as const)(
  "keeps $metric drawing coordinates independent of model selection",
  ({ metric, labels, count }) => {
    const view = calendarSnapshot(query);
    const data = chartData(view.days, metric);
    const draw = (visibleModels = data.models) => (
      <CalendarChart
        data={data}
        metric={metric}
        visibleModels={visibleModels}
        includeUncertain={true}
      />
    );
    const page = render(draw());
    const paths = () =>
      Array.from(page.container.querySelectorAll(".ts-chart__bar path"), (node) =>
        node.getAttribute("d"),
      );
    const initialPaths = paths();
    expect(ticks(page.container)).toEqual(labels);
    expect(initialPaths).toHaveLength(count);
    page.rerender(draw([]));
    expect(ticks(page.container)).toEqual(labels);
    expect(paths()).toEqual(initialPaths);
  },
);
