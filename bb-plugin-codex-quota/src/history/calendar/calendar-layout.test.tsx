// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CalendarValues, UsageTooltip } from "./calendar-view.js";
import { CalendarReportPanel } from "./calendar-panel.js";
import { calendarSnapshot } from "./calendar-test-support.js";
import { axisValue, chartData } from "./calendar-chart-data.js";

const now = Date.parse("2026-10-01T12:00:00Z");
const query = {
  startDate: "2026-09-01",
  timezone: "UTC",
  group: "workspace" as const,
  scope: { kind: "host" as const },
};
afterEach(cleanup);
it("renders the real library's axes and keyboard-accessible chart", () => {
  const page = render(<CalendarValues view={calendarSnapshot(query)} metric="tokens" />);
  expect(screen.getByRole("application")).toBeTruthy();
  expect(page.container.querySelector(".recharts-xAxis")).toBeTruthy();
  expect(page.container.querySelector(".recharts-yAxis")).toBeTruthy();
  expect(
    page.container.querySelectorAll(".recharts-xAxis-tick-labels tspan").length,
  ).toBeGreaterThan(0);
  expect(page.container.querySelector(".recharts-xAxis-tick-labels tspan")?.textContent).toMatch(
    /Mon|Tue|Wed|Thu|Fri|Sat|Sun/,
  );
  expect(
    screen.getByRole("table", { name: "Daily recorded usage" }).querySelectorAll("tbody tr"),
  ).toHaveLength(30);
  expect(screen.queryByRole("region", { name: "Daily detail" })).toBeNull();
});
it("keeps just date navigation and two local metrics", async () => {
  const read = vi.fn(async ({ query }) => calendarSnapshot(query));
  render(
    <CalendarReportPanel selection={{ hostId: "host_a", generation: 1 }} now={now} read={read} />,
  );
  await screen.findByRole("group", { name: "Daily recorded values" });
  const metric = screen.getByRole("combobox", { name: "Report metric" });
  expect(
    within(metric)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["Tokens", "Estimated cost"]);
  fireEvent.change(metric, { target: { value: "cost" } });
  expect(read).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Previous 30 days" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Next 30 days" })).toBeTruthy();
  expect(screen.queryByText("Report options")).toBeNull();
});
it("keeps missing data null rather than drawing invented usage", () => {
  const view = calendarSnapshot(query),
    data = chartData(view.days, "tokens");
  expect(data.rows[0].value).toBeNull();
  expect(data.rows[0].height).toBeNull();
  expect(data.rows[14].value).toBe(600);
  expect(data.rows[14].height).toBe(1);
  render(<CalendarValues view={view} metric="tokens" />);
  const first = screen
    .getByRole("table", { name: "Daily recorded usage" })
    .querySelector("tbody tr")!;
  expect(first.textContent).toContain("Unavailable");
  expect(first.textContent).toContain("Unknown, uncovered gap");
});
it("stacks models separately from uncertainty and retains token class facts", () => {
  const view = calendarSnapshot({ ...query, includeUncertain: true });
  view.days[14].classes = {
    state: "available",
    input: 40,
    output: 340,
    cacheRead: 200,
    cacheWrite: 20,
    reasoning: 100,
  };
  view.days[14].models = {
    named: [
      { model: "gpt-5", totalTokens: 400 },
      { model: "gpt-6", totalTokens: 200 },
    ],
    otherTokens: 0,
  };
  view.days[14].uncertain = { totalTokens: 300, records: 1 };
  const data = chartData(view.days, "tokens");
  expect(data.maximum).toBe(900);
  expect(data.rows[14].modelHeights).toEqual({
    m0: 400 / 900,
    m1: 200 / 900,
    other: 0,
    unknown: 0,
  });
  expect(
    Object.values(data.rows[14].modelHeights).reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0,
    ) + data.rows[14].uncertainHeight,
  ).toBeCloseTo(1);
  expect(Object.values(data.rows[0].modelHeights).every((value) => value === null)).toBe(true);
  render(<CalendarValues view={view} metric="tokens" />);
  expect(screen.getByLabelText("Models").textContent).toContain("gpt-5");
  expect(screen.getByLabelText("Models").textContent).not.toContain("Cache write");
  const row = screen
    .getByRole("table", { name: "Daily recorded usage" })
    .querySelectorAll("tbody tr")[14];
  expect(Array.from(row.children, (cell) => cell.textContent).slice(1, 9)).toEqual([
    "600",
    "40",
    "340",
    "200",
    "20",
    "100",
    "0",
    "300",
  ]);
});
it.each(["missing", "inconsistent", "partial"])(
  "preserves retained totals with %s category detail",
  (state) => {
    const view = calendarSnapshot(query),
      day = view.days[14];
    if (state === "missing") day.classes = { state: "unavailable" };
    else
      day.classes = {
        state: "available",
        input: state === "inconsistent" ? 600 : 100,
        output: 100,
        cacheRead: 100,
        cacheWrite: 0,
        reasoning: 50,
      };
    const parts = chartData(view.days, "tokens").rows[14].modelHeights;
    expect(Object.values(parts).reduce<number>((sum, value) => sum + (value ?? 0), 0)).toBeCloseTo(
      1,
    );
    expect(parts.unknown).toBe(1);
    render(
      <>
        <CalendarValues view={view} metric="tokens" />
        <UsageTooltip day={day} metric="tokens" />
      </>,
    );
    const tip = screen.getByRole("tooltip");
    const unclassified = within(tip).getByText("Unclassified tokens").parentElement!;
    expect(unclassified.querySelector("dd")?.textContent).toBe(state === "partial" ? "300" : "600");
    expect(!!within(tip).queryByText("Input (uncached) tokens")).toBe(state === "partial");
    const cells = screen
      .getByRole("table", { name: "Daily recorded usage" })
      .querySelectorAll("tbody tr")[14].children;
    expect(cells[2].textContent).toBe(state === "partial" ? "100" : "Unavailable");
    expect(cells[7].textContent).toBe(state === "partial" ? "300" : "600");
  },
);
it("shows exact category counts and reasoning's output relationship in the tooltip", () => {
  const day = calendarSnapshot(query).days[14];
  render(<UsageTooltip day={day} metric="tokens" />);
  const definitions = Array.from(
    screen.getByRole("tooltip").querySelectorAll("dl > div"),
    (row) => [row.querySelector("dt")?.textContent, row.querySelector("dd")?.textContent],
  );
  expect(definitions).toEqual([
    ["Recorded tokens", "600"],
    ["Input (uncached) tokens", "40"],
    ["Output tokens", "360"],
    ["Cache read tokens", "200"],
    ["Cache write tokens", "0"],
    ["Reasoning tokens (in output)", "100"],
    ["Excluded tokens", "2"],
  ]);
});
it("labels unavailable category detail rather than inventing zero counts", () => {
  const day = calendarSnapshot(query).days[14];
  day.classes = { state: "unavailable" };
  render(<UsageTooltip day={day} metric="tokens" />);
  expect(screen.getByRole("tooltip").textContent).toContain("Token breakdownUnavailable");
  expect(screen.queryByText("Input (uncached) tokens")).toBeNull();
});
it("keeps precise captured prices without the lower tooltip details", () => {
  const view = calendarSnapshot(query),
    day = view.days[14];
  day.money = {
    state: "partial",
    capturedCost: 0.39813160000000003,
    pricedRecords: 1,
    records: 3,
    pricedEntities: 1,
    reason: "missing-prices",
  };
  render(<UsageTooltip day={day} metric="cost" />);
  expect(screen.getByText("$0.39813160000000003", { exact: true })).toBeTruthy();
  const tip = screen.getByRole("tooltip");
  expect(within(tip).getByText("Tue, Sep 15, 2026")).toBeTruthy();
  expect(tip.textContent).not.toMatch(/partial|accepted records priced|priced active entities/i);
  expect(within(tip).queryByText("Captured estimate, not billed charges.")).toBeNull();
});
it("shows weekdays and exact values without zero-estimate clutter", () => {
  const day = calendarSnapshot(query).days[14];
  day.uncertain = { totalTokens: 0, records: 0 };
  render(<UsageTooltip day={day} metric="tokens" />);
  const tip = screen.getByRole("tooltip");
  expect(tip.querySelector("time")?.dateTime).toBe("2026-09-15");
  expect(within(tip).getByText("Tue, Sep 15, 2026")).toBeTruthy();
  expect(within(tip).getByText("Recorded tokens")).toBeTruthy();
  expect(tip.querySelector("dl dd")?.textContent).toBe("600");
  expect(within(tip).getByText("Excluded tokens")).toBeTruthy();
  expect(within(tip).getByText("2")).toBeTruthy();
  expect(within(tip).queryByText("Uncertain estimate")).toBeNull();
  expect(within(tip).queryByText("Duplicate checks are approximate.")).toBeNull();
});
it.each(["tokens", "cost"] as const)(
  "keeps positive estimates distinct and token-only for %s",
  (metric) => {
    const day = calendarSnapshot(query).days[14];
    day.uncertain = { totalTokens: 350, records: 1 };
    render(<UsageTooltip day={day} metric={metric} />);
    const tip = screen.getByRole("tooltip");
    expect(!!within(tip).queryByText("350 tokens")).toBe(metric === "tokens");
    expect(within(tip).queryByText("Duplicate checks are approximate.")).toBeNull();
    expect(tip.textContent).not.toContain("Partial, recorded usage");
  },
);
it.each([
  [0.39813160000000003, "<$1"],
  [1.384036, "$1"],
  [287.24, "$287"],
  [1234567.89, "$1M"],
  [Number.MAX_SAFE_INTEGER, "$9007T"],
  [0.0000001, "<$1"],
  [Number.MIN_VALUE, "<$1"],
] as const)("formats axis estimates without rounding %s to zero", (value, expected) => {
  expect(axisValue(value, "cost")).toBe(expected);
  const view = calendarSnapshot(query);
  view.days[14].money = {
    state: "available",
    capturedCost: value,
    pricedRecords: 1,
    records: 1,
    pricedEntities: 1,
    reason: "ok",
  };
  const data = chartData(view.days, "cost");
  expect(data.maximum).toBe(value);
  expect(data.rows[14].height).toBe(1);
  render(<CalendarValues view={view} metric="cost" />);
  expect(screen.getByRole("application")).toBeTruthy();
  const captured = screen
    .getByRole("table", { name: "Daily recorded usage" })
    .querySelectorAll("tbody tr")[14].textContent;
  expect(captured?.replaceAll(",", "")).toContain(`$${value}`);
});
it("keeps billing limits and daily attribution exclusions in the screen-reader table", () => {
  const view = calendarSnapshot(query),
    day = view.days[14];
  day.money = {
    state: "partial",
    capturedCost: 0.39813160000000003,
    pricedRecords: 1,
    records: 60,
    pricedEntities: 1,
    reason: "missing-prices",
  };
  day.excludedTokens = 2;
  render(<CalendarValues view={view} metric="cost" />);
  const table = screen.getByRole("table", { name: "Daily recorded usage" });
  expect(table.querySelector("caption")?.textContent).toContain(
    "Captured estimate, not billed charges.",
  );
  expect(within(table).getByRole("columnheader", { name: "Recorded exclusions" })).toBeTruthy();
  const row = table.querySelectorAll("tbody tr")[14];
  expect(row.textContent).toContain("$0.39813160000000003");
  expect(row.textContent).toContain(
    "1 of 60 accepted records priced; 1 priced active entities; pricing partial",
  );
  expect(within(row as HTMLElement).getByRole("cell", { name: "2 excluded tokens" })).toBeTruthy();
});
it("keeps date arrows visually compact with larger coarse-pointer hit areas", async () => {
  render(
    <CalendarReportPanel
      selection={{ hostId: "host_a", generation: 1 }}
      now={now}
      read={async ({ query }) => calendarSnapshot(query)}
    />,
  );
  await screen.findByRole("group", { name: "Daily recorded values" });
  for (const label of ["Previous 30 days", "Next 30 days"]) {
    const button = screen.getByRole("button", { name: label });
    for (const token of [
      "size-8",
      "pointer-coarse:size-11",
      "inline-flex",
      "items-center",
      "justify-center",
      "shrink-0",
    ])
      expect(button.classList.contains(token)).toBe(true);
    for (const token of ["h-8", "px-3", "py-2"])
      expect(button.classList.contains(token)).toBe(false);
    expect(button.querySelector("svg")?.classList.contains("shrink-0")).toBe(true);
    expect(button.querySelector("span")?.classList.contains("size-8")).toBe(true);
    expect(button.classList.contains("text-muted-foreground")).toBe(true);
  }
  expect(screen.getByRole("combobox", { name: "Report metric" }).classList.contains("h-9")).toBe(
    true,
  );
});

it.each([
  [1_174_600_000, "1B"],
  [587_300_000, "587M"],
  [293_650_000, "294M"],
  [1000.5, "1K"],
  [0, "0"],
] as const)("shows whole-number token axis labels for %s", (value, expected) => {
  expect(axisValue(value, "tokens")).toBe(expected);
});

it("rounds displayed token averages without changing the chart values", () => {
  const view = calendarSnapshot(query);
  view.days[14].totalTokens = 1000;
  view.days[14].activeEntities = 3;
  const data = chartData(view.days, "per-entity");
  expect(data.rows[14].value).toBe(1000 / 3);
  render(<CalendarValues view={view} metric="per-entity" />);
  const row = screen
    .getByRole("table", { name: "Daily recorded usage" })
    .querySelectorAll("tbody tr")[14];
  expect(within(row as HTMLElement).getByRole("cell", { name: "333" })).toBeTruthy();
  expect(view.days[14].totalTokens).toBe(1000);
});

it("uses the same model counts and labels in legend, tooltip, and accessible daily cells", () => {
  const view = calendarSnapshot(query);
  view.days[14].models = { named: [{ model: "gpt.5[fast]", totalTokens: 400 }], otherTokens: 100 };
  render(
    <>
      <CalendarValues view={view} metric="tokens" />
      <UsageTooltip day={view.days[14]} metric="tokens" />
    </>,
  );
  expect(screen.getByLabelText("Models").textContent).toBe("gpt.5[fast]Other modelsUnknown model");
  const models = screen.getByLabelText("Tokens by model");
  expect(models.querySelectorAll("li")).toHaveLength(3);
  expect(
    Array.from(models.querySelectorAll("li [title]"), (node) => node.getAttribute("title")),
  ).toEqual(["400 tokens", "100 tokens", "100 tokens"]);
  const table = screen.getByRole("table", { name: "Daily recorded usage" });
  expect(
    Array.from(table.querySelectorAll("thead th"))
      .slice(-3)
      .map((node) => node.textContent),
  ).toEqual(["gpt.5[fast] tokens", "Other models tokens", "Unknown model tokens"]);
  expect(
    Array.from(table.querySelectorAll("tbody tr")[14].children)
      .slice(-3)
      .map((node) => node.textContent),
  ).toEqual(["400", "100", "100"]);
});

it.each([14, 0])(
  "omits duplicate or empty model details for day %s in a mixed-model range",
  (index) => {
    const view = calendarSnapshot(query);
    view.days[15] = {
      ...view.days[14],
      date: view.days[15].date,
      models: { named: [{ model: "gpt-5.4", totalTokens: 600 }], otherTokens: 0 },
    };
    const chart = chartData(view.days, "tokens");
    render(
      <>
        <CalendarValues view={view} metric="tokens" />
        <UsageTooltip
          day={view.days[index]}
          metric="tokens"
          modelView={{ series: chart.models, values: chart.rows[index].modelFacts }}
        />
      </>,
    );
    expect(screen.getByLabelText("Models").textContent).toBe("gpt-5.4Unknown model");
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.querySelector("dl dd")?.textContent).toBe(index === 14 ? "600" : "Unavailable");
    expect(within(tooltip).queryByLabelText("Tokens by model")).toBeNull();
    const cells = screen
      .getByRole("table", { name: "Daily recorded usage" })
      .querySelectorAll("tbody tr")[index].children;
    expect(cells[cells.length - 1].textContent).toBe(index === 14 ? "600" : "Unavailable");
  },
);
