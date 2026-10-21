// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { capturedEstimate, compactEstimate, MoneyValues } from "./calendar-money-view.js";
import { UsageTooltip } from "./calendar-tooltip.js";
import { calendarDaySchema } from "./calendar-contract.js";
import { chartData } from "./calendar-chart-data.js";
import { calendarModelCostSnapshot } from "./calendar-test-support.js";

const query = {
  startDate: "2026-09-01",
  timezone: "UTC",
  group: "workspace" as const,
  scope: { kind: "host" as const },
};
afterEach(cleanup);

it.each([
  [323.7267296, "$323.73"],
  [55.753468, "$55.75"],
  [1.6619412, "$1.66"],
  [266.3113204, "$266.31"],
  [4, "$4.00"],
  [0, "$0.00"],
  [0.01, "$0.01"],
  [0.009, "<$0.01"],
  [0.0000001, "<$0.01"],
  [Number.MIN_VALUE, "<$0.01"],
  [1234567.89, "$1,234,567.89"],
] as const)("formats captured USD %s consistently as %s", (value, expected) => {
  expect(capturedEstimate(value)).toBe(expected);
  expect(compactEstimate(value)).toBe(expected);
});

it("distills model prices while keeping exact captured facts and pricing coverage", () => {
  const view = calendarModelCostSnapshot(query);
  const day = calendarDaySchema.parse(view.days[14]);
  const data = chartData([day], "cost");
  expect(data.rows[0].value).toBe(323.7267296);
  expect(data.rows[0].modelFacts).toEqual({
    c0: null,
    c1: 55.753468,
    c2: 1.6619412,
    c3: 266.3113204,
  });
  render(<UsageTooltip day={day} metric="cost" />);
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip.querySelector("dl dd")?.textContent).toBe("$323.73");
  expect(tooltip.querySelector("dl dd")?.getAttribute("title")).toBe("USD 323.7267296");
  expect(tooltip.querySelector("time")?.textContent).toBe("Tue, Sep 15, 2026");
  const models = within(tooltip).getByLabelText("Captured cost by model");
  const rows = within(models).getAllByRole("listitem");
  expect(rows.map((row) => row.textContent)).toEqual([
    "gpt5.5No price",
    "gpt6-astra$55.75",
    "gpt6-solPartial$1.66",
    "gpt6.1-solPartial$266.31",
  ]);
  expect(rows.map((row) => row.getAttribute("title"))).toEqual([
    "Unavailable · 0 of 3 records priced · pricing unavailable",
    "$55.75 · 360 of 360 records priced · pricing available; captured USD 55.753468",
    "$1.66 · 31 of 35 records priced · pricing partial; captured USD 1.6619412",
    "$266.31 · 7662 of 7674 records priced · pricing partial; captured USD 266.3113204",
  ]);
  expect(models.querySelector("p")).toBeNull();
  expect(tooltip.textContent).not.toMatch(/records priced|pricing available|323\.726|55\.753/);
});

it.each([
  [0, "$0.00"],
  [Number.MIN_VALUE, "<$0.01"],
  [null, "Unsafe sum"],
] as const)("keeps zero, tiny prices and unsafe sums distinct for %s", (cost, expected) => {
  const day = calendarModelCostSnapshot(query).days[14];
  const money = {
    state: cost === null ? ("unavailable" as const) : ("available" as const),
    capturedCost: cost,
    records: 1,
    pricedRecords: 1,
    reason: cost === null ? ("unsafe-sum" as const) : ("ok" as const),
  };
  day.money = { ...money, pricedEntities: 1 };
  day.modelCosts = {
    named: [{ model: "A", money }],
    other: day.modelCosts!.other,
    unknown: day.modelCosts!.unknown,
  };
  render(<UsageTooltip day={day} metric="cost" />);
  const row = within(screen.getByLabelText("Captured cost by model")).getByRole("listitem");
  expect(row.textContent).toBe(`A${expected}`);
  if (cost === null)
    expect(row.getAttribute("title")).toBe(
      "Unavailable · 1 of 1 records priced · pricing unavailable, unsafe monetary sum",
    );
});

it("rounds visible cost ledger dollars without dropping partial-pricing details", () => {
  render(<MoneyValues money={calendarModelCostSnapshot(query).summary.money} entities="threads" />);
  expect(screen.getByText("Captured estimated cost subtotal: $323.73.").textContent).toBe(
    "Captured estimated cost subtotal: $323.73.",
  );
  expect(
    screen.getByText("Estimate per priced active entity: $323.73 / 3 = $107.91.").textContent,
  ).toBe("Estimate per priced active entity: $323.73 / 3 = $107.91.");
  expect(screen.getByText(/8053 of 8072 accepted records priced/).textContent).toContain(
    "Pricing partial. 19 records have no eligible captured price.",
  );
});
