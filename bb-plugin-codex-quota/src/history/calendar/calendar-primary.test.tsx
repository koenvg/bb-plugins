// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CalendarReportPanel } from "./calendar-panel.js";
import { calendarSnapshot } from "./calendar-test-support.js";
import type { CalendarQuery } from "./calendar-contract.js";
import { QuotaDashboard } from "../../quota/quota-view.js";

const now = Date.parse("2026-10-01T12:00:00Z");
afterEach(cleanup);
it("puts the remaining allowance before the chart", () => {
  render(
    <QuotaDashboard
      view={{
        state: "fresh",
        reason: "ok",
        snapshot: {
          observedAt: new Date(now).toISOString(),
          plan: null,
          bankedResets: 0,
          additional: [],
          general: [{ id: "primary_window", name: "7 days", remainingPercent: 31, resetAt: null }],
          bindingWindowId: "primary_window",
          bindingRemainingPercent: 31,
        },
      }}
      hosts={[]}
      selectedHostId="host_a"
      now={now}
      onHostChange={vi.fn()}
      onRefresh={vi.fn()}
    >
      <div data-testid="chart">Chart</div>
    </QuotaDashboard>,
  );
  const allowance = screen.getByRole("region", { name: "Codex allowance summary" });
  expect(
    allowance.compareDocumentPosition(screen.getByTestId("chart")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getByRole("heading", { name: "31% remaining" }).className).toContain("text-3xl");
});
it("removes secondary reports and instruction text from the primary view", async () => {
  render(
    <CalendarReportPanel
      selection={{ hostId: "host_a", generation: 1 }}
      now={now}
      read={async ({ query }) => calendarSnapshot(query)}
    />,
  );
  await screen.findByRole("group", { name: "Daily recorded values" });
  for (const label of [
    "Breakdown",
    "Report limits",
    "Report options",
    "Select a day. Dashed bars mean missing data.",
  ])
    expect(screen.queryByText(label)).toBeNull();
  expect(screen.queryByRole("combobox", { name: "Report grouping" })).toBeNull();
  expect(screen.queryByRole("combobox", { name: "Report comparison" })).toBeNull();
  expect(screen.queryByLabelText("Range summary")).toBeNull();
});
it("gives both allowance actions the same centred control frame", () => {
  render(
    <QuotaDashboard
      view={{ state: "unavailable", reason: "auth-required", snapshot: null }}
      hosts={[]}
      selectedHostId="host_a"
      now={now}
      onHostChange={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );
  for (const action of [
    screen.getByRole("button", { name: "Refresh allowance" }),
    screen.getByRole("link", { name: "Open Codex Usage" }),
  ]) {
    for (const token of ["h-9", "inline-flex", "items-center", "leading-none"])
      expect(action.classList.contains(token)).toBe(true);
  }
});

it("gives both native dropdowns inset, centred decorative arrows without changing selection", async () => {
  const onHostChange = vi.fn(),
    read = vi.fn(async ({ query }: { query: CalendarQuery }) => calendarSnapshot(query));
  render(
    <>
      <QuotaDashboard
        view={{ state: "unavailable", reason: "auth-required", snapshot: null }}
        hosts={[
          { id: "host_a", name: "Host A", status: "connected" },
          { id: "host_b", name: "Host B", status: "disconnected" },
        ]}
        selectedHostId="host_a"
        now={now}
        onHostChange={onHostChange}
        onRefresh={vi.fn()}
      />
      <CalendarReportPanel selection={{ hostId: "host_a", generation: 1 }} now={now} read={read} />
    </>,
  );
  await screen.findByRole("group", { name: "Daily recorded values" });
  const host = screen.getByRole("combobox", { name: "Codex host" }),
    metric = screen.getByRole("combobox", { name: "Report metric" });
  for (const select of [host, metric]) {
    expect(select.tagName).toBe("SELECT");
    for (const token of ["appearance-none", "h-9", "pr-8", "py-0"])
      expect(select.classList.contains(token)).toBe(true);
    const arrow = select.parentElement!.querySelector('svg[aria-hidden="true"]')!;
    expect(arrow).not.toBeNull();
    for (const token of [
      "pointer-events-none",
      "absolute",
      "right-3",
      "top-1/2",
      "-translate-y-1/2",
      "h-4",
      "w-4",
    ])
      expect(arrow.classList.contains(token)).toBe(true);
    expect(arrow.getAttribute("focusable")).toBe("false");
  }
  expect(host.parentElement!.classList.contains("w-44")).toBe(true);
  fireEvent.change(host, { target: { value: "host_b" } });
  expect(onHostChange).toHaveBeenCalledWith("host_b");
  fireEvent.change(metric, { target: { value: "cost" } });
  expect((metric as HTMLSelectElement).value).toBe("cost");
  expect(read).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Host B (offline)")).toBeTruthy();
});
