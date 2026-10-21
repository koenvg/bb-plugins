// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MachineReportPanel } from "./machines/report-view.js";
import { reportFixture } from "./machines/app.test-support.js";
import { CalendarValues, UsageTooltip } from "./history/calendar/calendar-view.js";
import {
  calendarEmptySnapshot,
  calendarSnapshot,
} from "./history/calendar/calendar-test-support.js";
import type { CalendarQuery } from "./history/calendar/calendar-contract.js";

const now = Date.parse("2026-10-01T12:00:00Z");
const query: CalendarQuery = {
  startDate: "2026-09-02",
  timezone: "UTC",
  group: "workspace",
  scope: { kind: "host" },
  includeUncertain: true,
};
const prepare = async () => ({ state: "settled", progress: "ready" });
afterEach(cleanup);

it.each([
  [5_880_000_001, "5.88 billion", "5,880,000,001"],
  [301_550_001, "301.55 million", "301,550,001"],
  [745_920_001, "745.92 million", "745,920,001"],
  [1_200, "1.2 thousand", "1,200"],
  [42, "42", "42"],
  [999_999, "1 million", "999,999"],
  [999_999_999, "1 billion", "999,999,999"],
] as const)(
  "shows readable totals and ranking counts with exact titles for %s",
  async (count, readable, exact) => {
    render(
      <MachineReportPanel
        now={now}
        prepare={prepare}
        read={async ({ query }) => {
          const view = calendarSnapshot(query);
          view.days[14].totalTokens = view.summary.totalTokens = count;
          view.ranking = [{ ...view.ranking[0], totalTokens: count }];
          return reportFixture(view);
        }}
      />,
    );
    const subtotal = screen.getByLabelText("Recorded token subtotal");
    await waitFor(() => expect(subtotal.textContent).toBe(readable));
    expect(subtotal.getAttribute("title")).toBe(`${exact} tokens`);
    const ranking = screen.getByRole("table", { name: "Recorded usage ranking" });
    await waitFor(() =>
      expect(ranking.querySelector("tbody td:last-child")?.textContent).toBe(readable),
    );
    expect(ranking.querySelector("tbody td:last-child")?.getAttribute("title")).toBe(
      `${exact} tokens`,
    );
    const daily = screen.getByRole("table", { name: "Daily recorded usage" });
    expect(daily.querySelectorAll("tbody tr")[14].children[1].textContent).toBe(exact);
  },
);

it("sorts distinct raw counts even when their readable labels match, and leaves money unchanged", async () => {
  render(
    <MachineReportPanel
      now={now}
      prepare={prepare}
      read={async ({ query }) => {
        const view = calendarSnapshot(query);
        view.ranking = [
          {
            ...view.ranking[0],
            key: "lower",
            label: "Lower",
            totalTokens: 301_550_001,
            money: {
              state: "available",
              capturedCost: 2.5,
              records: 1,
              pricedRecords: 1,
              pricedEntities: 1,
              reason: "ok",
            },
          },
          {
            ...view.ranking[0],
            key: "higher",
            label: "Higher",
            totalTokens: 301_550_002,
            money: {
              state: "available",
              capturedCost: 1.25,
              records: 1,
              pricedRecords: 1,
              pricedEntities: 1,
              reason: "ok",
            },
          },
        ];
        return reportFixture(view);
      }}
    />,
  );
  const table = screen.getByRole("table", { name: "Recorded usage ranking" });
  await waitFor(() => expect(table.querySelectorAll("tbody tr")).toHaveLength(2));
  const rows = () => Array.from(table.querySelectorAll("tbody tr"));
  expect(rows().map((row) => row.querySelector("td span")?.textContent)).toEqual([
    "Higher",
    "Lower",
  ]);
  expect(rows().map((row) => row.lastElementChild?.textContent)).toEqual([
    "301.55 million",
    "301.55 million",
  ]);
  expect(rows().map((row) => row.lastElementChild?.getAttribute("title"))).toEqual([
    "301,550,002 tokens",
    "301,550,001 tokens",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Estimated cost" }));
  expect(rows().map((row) => row.querySelector("td span")?.textContent)).toEqual([
    "Lower",
    "Higher",
  ]);
  expect(rows().map((row) => row.lastElementChild?.textContent)).toEqual(["$2.50", "$1.25"]);
  expect(rows().map((row) => row.lastElementChild?.getAttribute("title"))).toEqual([null, null]);
});

it.each(["unknown", "observed-inactivity"] as const)(
  "preserves %s subtotal and exact-title policy",
  async (state) => {
    render(
      <MachineReportPanel
        now={now}
        prepare={prepare}
        read={async ({ query }) => reportFixture(calendarEmptySnapshot(query, state))}
      />,
    );
    await screen.findByRole("table", { name: "Daily recorded usage" });
    const subtotal = screen.getByLabelText("Recorded token subtotal");
    expect(subtotal.textContent).toBe(state === "unknown" ? "Unknown" : "0");
    expect(subtotal.getAttribute("title")).toBe(state === "unknown" ? null : "0 tokens");
  },
);

it.each(["loading", "unavailable"] as const)(
  "does not give %s history a numeric title",
  async (state) => {
    render(
      <MachineReportPanel
        now={now}
        prepare={prepare}
        read={async () =>
          state === "loading"
            ? new Promise(() => {})
            : {
                machines: [
                  {
                    machine: { id: "host_a", name: "Host A", status: "connected" },
                    cached: false,
                    preparation: { state: "settled", progress: "ready" },
                    report: { state: "unavailable", reason: "host-offline" },
                  },
                ],
                truncated: false,
                cache: "saved",
              }
        }
      />,
    );
    if (state === "unavailable")
      await screen.findByText(/No usable recorded history for this range/);
    else
      expect(screen.getByText("Loading recorded usage…").textContent).toBe(
        "Loading recorded usage…",
      );
    const subtotal = screen.getByLabelText("Recorded token subtotal");
    expect(subtotal.textContent).toBe("—");
    expect(subtotal.getAttribute("title")).toBeNull();
  },
);

it("uses full token units for each tooltip row and keeps the daily facts exact", () => {
  const view = calendarSnapshot(query),
    day = view.days[14];
  day.totalTokens = 5_880_000_001;
  day.classes = {
    state: "available",
    input: 301_550_001,
    output: 745_920_001,
    cacheRead: 1_200_000_000,
    cacheWrite: 1_200,
    reasoning: 301_550_001,
  };
  day.uncertain = { totalTokens: 745_920_001, records: 1 };
  day.excludedTokens = 301_550_001;
  render(
    <>
      <CalendarValues view={view} metric="tokens" />
      <UsageTooltip day={day} metric="tokens" />
    </>,
  );
  const definitions = Array.from(
    screen.getByRole("tooltip").querySelectorAll("dl > div"),
    (row) => [
      row.querySelector("dt")?.textContent,
      row.querySelector("dd")?.textContent,
      row.querySelector("dd")?.getAttribute("title"),
    ],
  );
  expect(definitions).toEqual([
    ["Recorded tokens", "5.88 billion", "5,880,000,001 tokens"],
    ["Input (uncached) tokens", "301.55 million", "301,550,001 tokens"],
    ["Output tokens", "745.92 million", "745,920,001 tokens"],
    ["Cache read tokens", "1.2 billion", "1,200,000,000 tokens"],
    ["Cache write tokens", "1.2 thousand", "1,200 tokens"],
    ["Reasoning tokens (in output)", "301.55 million", "301,550,001 tokens"],
    ["Unclassified tokens", "3.63 billion", "3,632,528,799 tokens"],
    ["Uncertain estimate", "745.92 million tokens", "745,920,001 tokens"],
    ["Excluded tokens", "301.55 million", "301,550,001 tokens"],
  ]);
  const row = screen
    .getByRole("table", { name: "Daily recorded usage" })
    .querySelectorAll("tbody tr")[14];
  expect(Array.from(row.children, (cell) => cell.textContent).slice(1, 9)).toEqual([
    "5,880,000,001",
    "301,550,001",
    "745,920,001",
    "1,200,000,000",
    "1,200",
    "301,550,001",
    "3,632,528,799",
    "745,920,001",
  ]);
  expect(row.children[10].textContent).toBe("301,550,001 excluded tokens");
});

it("formats excluded tokens in cost tooltips without changing money", () => {
  const day = calendarSnapshot(query).days[14];
  day.excludedTokens = 745_920_001;
  day.money = {
    state: "available",
    capturedCost: 0.39813160000000003,
    records: 1,
    pricedRecords: 1,
    pricedEntities: 1,
    reason: "ok",
  };
  render(<UsageTooltip day={day} metric="cost" />);
  expect(
    Array.from(screen.getByRole("tooltip").querySelectorAll("dd"), (cell) => [
      cell.textContent,
      cell.getAttribute("title"),
    ]),
  ).toEqual([
    ["$0.40", "USD 0.39813160000000003"],
    ["745.92 million", "745,920,001 tokens"],
  ]);
});

it.each(["unknown", "observed-inactivity"] as const)(
  "preserves %s token tooltip values",
  (state) => {
    render(<UsageTooltip day={calendarEmptySnapshot(query, state).days[0]} metric="tokens" />);
    const value = screen.getByRole("tooltip").querySelector("dd")!;
    expect(value.textContent).toBe(state === "unknown" ? "Unavailable" : "0");
    expect(value.getAttribute("title")).toBe(state === "unknown" ? null : "0 tokens");
  },
);

it("leaves tooltip averages on the exact general number policy", () => {
  const day = calendarSnapshot(query).days[14];
  day.totalTokens = 1_000_000;
  day.activeEntities = 3;
  render(<UsageTooltip day={day} metric="per-entity" />);
  expect(within(screen.getByRole("tooltip")).getByText("333,333").getAttribute("title")).toBeNull();
});
