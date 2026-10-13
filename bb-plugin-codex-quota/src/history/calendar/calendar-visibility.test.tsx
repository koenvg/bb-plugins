// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CalendarValues, UsageTooltip } from "./calendar-view.js";
import { chartData } from "./calendar-chart-data.js";
import { calendarMixedMagnitudeSnapshot } from "./calendar-test-support.js";

const query = {
  startDate: "2026-09-01",
  timezone: "UTC",
  group: "workspace" as const,
  scope: { kind: "host" as const },
  includeUncertain: true,
};
afterEach(cleanup);

it("marks each tiny positive day once without changing model, category, or fallback amounts", () => {
  const view = calendarMixedMagnitudeSnapshot(query);
  const before = structuredClone(view);
  const data = chartData(view.days, "tokens");
  expect(data.maximum).toBe(1_000_000_000);
  expect(data.rows[15].modelFacts).toEqual({ m0: 1, m1: 3, unknown: 0 });
  expect(data.rows[15].modelHeights).toEqual({ m0: 1e-9, m1: 3e-9, unknown: 0 });
  expect(data.rows[16].modelFacts).toEqual({ m0: 0, m1: 0, unknown: 1 });
  expect(data.rows[16].height).toBe(1e-9);
  const page = render(<CalendarValues view={view} metric="tokens" />);
  const markers = page.container.querySelectorAll("[data-positive-usage]");
  expect(Array.from(markers, (node) => node.getAttribute("data-positive-usage"))).toEqual([
    view.days[15].date,
    view.days[16].date,
  ]);
  for (const marker of Array.from(markers)) expect(marker.getAttribute("height")).toBe("2");
  const rows = screen
    .getByRole("table", { name: "Daily recorded usage" })
    .querySelectorAll("tbody tr");
  expect(Array.from(rows[15].children, (cell) => cell.textContent).slice(1, 8)).toEqual([
    "4",
    "1",
    "1",
    "1",
    "1",
    "0",
    "0",
  ]);
  expect(rows[16].children[1].textContent).toBe("1");
  expect(rows[16].children[7].textContent).toBe("1");
  expect(data.rows[0].value).toBeNull();
  expect(data.rows[17].value).toBe(0);
  expect(data.rows[18].value).toBeNull();
  expect(view).toEqual(before);
});

it.each([15, 16])("keeps exact tooltip facts for small day %s", (index) => {
  const day = calendarMixedMagnitudeSnapshot(query).days[index];
  render(<UsageTooltip day={day} metric="tokens" />);
  const tip = screen.getByRole("tooltip");
  expect(tip.querySelector("dl dd")?.textContent).toBe(index === 15 ? "4" : "1");
  if (index === 15) {
    for (const label of [
      "Input (uncached) tokens",
      "Output tokens",
      "Cache read tokens",
      "Cache write tokens",
    ])
      expect(within(tip).getByText(label).parentElement?.querySelector("dd")?.textContent).toBe(
        "1",
      );
  } else {
    expect(
      within(tip).getByText("Unclassified tokens").parentElement?.querySelector("dd")?.textContent,
    ).toBe("1");
    expect(
      within(tip).getByText("Token breakdown").parentElement?.querySelector("dd")?.textContent,
    ).toBe("Unavailable");
  }
});
