// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CalendarValues, UsageTooltip } from "./calendar-view.js";
import { CalendarReportPanel } from "./calendar-panel.js";
import { calendarSnapshot } from "./calendar-test-support.js";
import { axisValue, chartData } from "./calendar-chart-data.js";

const now = Date.parse("2026-10-01T12:00:00Z");
const query = { startDate: "2026-09-01", timezone: "UTC", group: "workspace" as const, scope: { kind: "host" as const } };
afterEach(cleanup);
it("renders the real library's axes and keyboard-accessible chart", () => {
  const page = render(<CalendarValues view={calendarSnapshot(query)} metric="tokens" />);
  expect(screen.getByRole("application")).toBeTruthy();
  expect(page.container.querySelector(".recharts-xAxis")).toBeTruthy();
  expect(page.container.querySelector(".recharts-yAxis")).toBeTruthy();
  expect(screen.getByRole("table", { name: "Daily recorded usage" }).querySelectorAll("tbody tr")).toHaveLength(30);
  expect(screen.queryByRole("region", { name: "Daily detail" })).toBeNull();
});
it("keeps just date navigation and two local metrics", async () => {
  const read = vi.fn(async ({ query }) => calendarSnapshot(query));
  render(<CalendarReportPanel selection={{ hostId: "host_a", generation: 1 }} now={now} read={read} />);
  await screen.findByRole("group", { name: "Daily recorded values" });
  const metric = screen.getByRole("combobox", { name: "Report metric" });
  expect(within(metric).getAllByRole("option").map(option => option.textContent)).toEqual(["Tokens", "Estimated cost"]);
  fireEvent.change(metric, { target: { value: "cost" } });
  expect(read).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Previous 30 days" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Next 30 days" })).toBeTruthy();
  expect(screen.queryByText("Report options")).toBeNull();
});
it("keeps missing data null rather than drawing invented usage", () => {
  const view = calendarSnapshot(query), data = chartData(view.days, "tokens");
  expect(data.rows[0].value).toBeNull(); expect(data.rows[0].height).toBeNull();
  expect(data.rows[14].value).toBe(600); expect(data.rows[14].height).toBe(1);
  render(<CalendarValues view={view} metric="tokens" />);
  const first = screen.getByRole("table", { name: "Daily recorded usage" }).querySelector("tbody tr")!;
  expect(first.textContent).toContain("Unavailable"); expect(first.textContent).toContain("Unknown, uncovered gap");
});
it("retains precise captured prices and partial coverage in the tooltip", () => {
  const view = calendarSnapshot(query), day = view.days[14];
  day.money = { state: "partial", capturedCost: 0.39813160000000003, pricedRecords: 1, records: 3, pricedEntities: 1, reason: "missing-prices" };
  render(<UsageTooltip day={day} metric="cost" />);
  expect(screen.getByText("USD estimate: $0.39813160000000003", { exact: true })).toBeTruthy();
  expect(screen.getAllByText(/partial/i).length).toBeTruthy();
  expect(screen.getByText("Captured estimate, not billed charges.")).toBeTruthy();
});
it.each([
  [0.39813160000000003, "$0.40"], [1.384036, "$1.38"], [0.0000001, "$1.00e-7"], [Number.MIN_VALUE, "$4.94e-324"],
] as const)("formats axis estimates without rounding %s to zero", (value, expected) => {
  expect(axisValue(value, "cost")).toBe(expected);
  const view = calendarSnapshot(query);
  view.days[14].money = { state: "available", capturedCost: value, pricedRecords: 1, records: 1, pricedEntities: 1, reason: "ok" };
  const data = chartData(view.days, "cost"); expect(data.maximum).toBe(value); expect(data.rows[14].height).toBe(1);
  render(<CalendarValues view={view} metric="cost" />);
  expect(screen.getByRole("application")).toBeTruthy();
  expect(screen.getByRole("table", { name: "Daily recorded usage" }).textContent).toContain(`$${value}`);
});
it("keeps billing limits and daily attribution exclusions in the screen-reader table", () => {
  const view = calendarSnapshot(query), day = view.days[14];
  day.money = { state: "partial", capturedCost: 0.39813160000000003, pricedRecords: 1, records: 60, pricedEntities: 1, reason: "missing-prices" };
  day.excludedTokens = 2;
  render(<CalendarValues view={view} metric="cost" />);
  const table = screen.getByRole("table", { name: "Daily recorded usage" });
  expect(table.querySelector("caption")?.textContent).toContain("Captured estimate, not billed charges.");
  expect(within(table).getByRole("columnheader", { name: "Recorded exclusions" })).toBeTruthy();
  const row = table.querySelectorAll("tbody tr")[14];
  expect(row.textContent).toContain("$0.39813160000000003");
  expect(row.textContent).toContain("1 of 60 accepted records priced; 1 priced active entities; pricing partial");
  expect(within(row as HTMLElement).getByRole("cell", { name: "2 excluded tokens" })).toBeTruthy();
});
it("uses equal-height controls and centres date icons without inherited text-button padding", async () => {
  render(<CalendarReportPanel selection={{ hostId: "host_a", generation: 1 }} now={now} read={async ({ query }) => calendarSnapshot(query)} />);
  await screen.findByRole("group", { name: "Daily recorded values" });
  for (const label of ["Previous 30 days", "Next 30 days"]) {
    const button = screen.getByRole("button", { name: label });
    for (const token of ["h-9", "w-9", "inline-flex", "items-center", "justify-center", "shrink-0"]) expect(button.classList.contains(token)).toBe(true);
    for (const token of ["h-8", "px-3", "py-2"]) expect(button.classList.contains(token)).toBe(false);
    expect(button.querySelector("svg")?.classList.contains("shrink-0")).toBe(true);
  }
  expect(screen.getByRole("combobox", { name: "Report metric" }).classList.contains("h-9")).toBe(true);
});
