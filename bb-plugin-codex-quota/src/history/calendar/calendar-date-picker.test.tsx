// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CalendarValues } from "./calendar-view.js";
import { CalendarReportPanel } from "./calendar-panel.js";
import { calendarSnapshot } from "./calendar-test-support.js";

const query = {
  startDate: "2026-09-01",
  timezone: "UTC",
  group: "workspace" as const,
  scope: { kind: "host" as const },
};
afterEach(cleanup);

it("offers all 30 dates as native buttons beside the unchanged overview", () => {
  render(<CalendarValues view={calendarSnapshot(query)} metric="tokens" />);
  const picker = screen.getByRole("group", { name: "Choose a recorded date" });
  const buttons = within(picker).getAllByRole("button");
  expect(buttons).toHaveLength(30);
  expect(buttons[0].getAttribute("aria-label")).toBe("Inspect 2026-09-01");
  expect(buttons[29].getAttribute("aria-label")).toBe("Inspect 2026-09-30");
  for (const button of buttons) {
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.classList.contains("min-h-9")).toBe(true);
  }
  expect(screen.getByRole("application")).toBeTruthy();
  expect(
    screen.getByRole("table", { name: "Daily recorded usage" }).querySelectorAll("tbody tr"),
  ).toHaveLength(30);
  fireEvent.click(buttons[14]);
  expect(buttons[14].getAttribute("aria-pressed")).toBe("true");
  const detail = screen.getByRole("region", { name: "Selected date" });
  expect(detail.querySelector("time")?.getAttribute("datetime")).toBe("2026-09-15");
  expect(within(detail).getByText("Recorded tokens").nextElementSibling?.textContent).toBe("600");
  expect(detail.textContent).not.toContain("Partial, recorded usage");
  expect(within(detail).getByText("Excluded tokens").nextElementSibling?.textContent).toBe("2");
});

it("keeps unknown days distinct from recorded inactivity", () => {
  const view = calendarSnapshot(query);
  view.days[1].coverage = { ...view.days[1].coverage, zero: true, state: "observed-inactivity" };
  render(<CalendarValues view={view} metric="tokens" />);
  fireEvent.click(screen.getByRole("button", { name: "Inspect 2026-09-01" }));
  let detail = screen.getByRole("region", { name: "Selected date" });
  expect(within(detail).getByText("Recorded tokens").nextElementSibling?.textContent).toBe(
    "Unavailable",
  );
  expect(detail.textContent).not.toContain("Unknown, uncovered gap");
  const table = screen.getByRole("table", { name: "Daily recorded usage" });
  expect(table.querySelectorAll("tbody tr")[0].textContent).toContain("Unknown, uncovered gap");
  fireEvent.click(screen.getByRole("button", { name: "Inspect 2026-09-02" }));
  detail = screen.getByRole("region", { name: "Selected date" });
  expect(within(detail).getByText("Recorded tokens").nextElementSibling?.textContent).toBe("0");
  expect(detail.textContent).not.toContain("Observed inactivity");
  expect(table.querySelectorAll("tbody tr")[1].textContent).toContain("Observed inactivity");
});

it("updates selected facts with the metric and discards dates outside a new range", () => {
  const view = calendarSnapshot(query);
  view.days[14].money = {
    state: "partial",
    capturedCost: 0.39813160000000003,
    pricedRecords: 1,
    records: 60,
    pricedEntities: 1,
    reason: "missing-prices",
  };
  const page = render(<CalendarValues view={view} metric="tokens" />);
  fireEvent.click(screen.getByRole("button", { name: "Inspect 2026-09-15" }));
  page.rerender(<CalendarValues view={view} metric="cost" />);
  const detail = screen.getByRole("region", { name: "Selected date" });
  expect(within(detail).getByText("USD estimate").nextElementSibling?.textContent).toBe(
    "$0.39813160000000003",
  );
  expect(detail.textContent).not.toContain("1 of 60 accepted records priced");
  expect(detail.textContent).not.toContain("Captured estimate, not billed charges.");
  const table = screen.getByRole("table", { name: "Daily recorded usage" });
  expect(table.textContent).toContain("1 of 60 accepted records priced");
  expect(table.querySelector("caption")?.textContent).toContain(
    "Captured estimate, not billed charges.",
  );
  page.rerender(
    <CalendarValues view={calendarSnapshot({ ...query, startDate: "2026-08-02" })} metric="cost" />,
  );
  expect(screen.queryByRole("region", { name: "Selected date" })).toBeNull();
});
it("preserves main's uncertain estimate without adding it to recorded facts", () => {
  const view = calendarSnapshot({ ...query, includeUncertain: true });
  view.days[14].uncertain = { totalTokens: 350, records: 1 };
  render(<CalendarValues view={view} metric="tokens" />);
  expect(screen.getByText("Recorded", { exact: true })).toBeTruthy();
  expect(screen.getByText("Uncertain estimate", { exact: true })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Inspect 2026-09-15" }));
  const detail = screen.getByRole("region", { name: "Selected date" });
  expect(within(detail).getByText("Recorded tokens").nextElementSibling?.textContent).toBe("600");
  expect(within(detail).getByText("Uncertain estimate").nextElementSibling?.textContent).toBe(
    "350 tokens",
  );
  expect(within(detail).queryByText("Duplicate checks are approximate.")).toBeNull();
  expect(screen.getByRole("columnheader", { name: "Uncertain token estimate" })).toBeTruthy();
});

it("selects dates locally without changing report queries", async () => {
  const read = vi.fn(async ({ query }) => calendarSnapshot(query));
  render(
    <CalendarReportPanel
      selection={{ hostId: "host_a", generation: 1 }}
      now={Date.parse("2026-10-01T12:00:00Z")}
      read={read}
    />,
  );
  await screen.findByRole("group", { name: "Daily recorded values" });
  fireEvent.click(screen.getByRole("button", { name: "Inspect 2026-09-15" }));
  fireEvent.click(screen.getByRole("button", { name: "Inspect 2026-09-16" }));
  expect(read).toHaveBeenCalledTimes(1);
});
