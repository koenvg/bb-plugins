// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CalendarValues } from "./calendar-view.js";
import { CalendarReportPanel } from "./calendar-panel.js";
import { calendarEmptySnapshot, calendarSnapshot } from "./calendar-test-support.js";
import type { CalendarQuery } from "./calendar-contract.js";

const query: CalendarQuery = {
  startDate: "2026-09-01",
  timezone: "UTC",
  group: "workspace",
  scope: { kind: "host" },
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function snapshot(nextQuery = query) {
  const view = calendarSnapshot(nextQuery);
  view.days[14].models = {
    named: [
      { model: "gpt-6.1", totalTokens: 100 },
      {
        model: "gpt-6.1-sol",
        totalTokens: 500,
      },
    ],
    otherTokens: 0,
  };
  return view;
}
const button = (name: string) => screen.getByRole("button", { name });
const table = () => screen.getByRole("table", { name: "Daily recorded usage" });
it("toggles one exact model locally and restores complete recorded facts", () => {
  const view = snapshot();
  render(<CalendarValues view={view} metric="tokens" />);
  const original = table().textContent;
  const fast = button("gpt-6.1-sol");
  expect(fast.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(fast);
  expect(fast.getAttribute("aria-pressed")).toBe("false");
  expect(button("gpt-6.1").getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("status").textContent).toBe("1 model series hidden.");
  expect(table().textContent).toBe(original);
  fireEvent.click(button("gpt-6.1"));
  expect(screen.getByRole("status").textContent).toBe(
    "All model series hidden. Recorded usage is not zero.",
  );
  fireEvent.click(button("Restore all series"));
  expect(
    within(screen.getByRole("group", { name: "Models" }))
      .getAllByRole("button")
      .map((node) => node.getAttribute("aria-pressed")),
  ).toEqual(["true", "true"]);
  expect(table().textContent).toBe(original);
});
it("filters captured models independently of token model identities and retains complete currency facts", () => {
  const view = snapshot();
  const day = view.days[14];
  day.money = {
    state: "partial",
    capturedCost: 10,
    records: 3,
    pricedRecords: 2,
    pricedEntities: 2,
    reason: "missing-prices",
  };
  const empty = {
    state: "unavailable" as const,
    capturedCost: null,
    records: 0,
    pricedRecords: 0,
    reason: "missing-prices" as const,
  };
  day.modelCosts = {
    named: [
      {
        model: "gpt-6.1",
        money: {
          state: "partial",
          capturedCost: 4,
          records: 2,
          pricedRecords: 1,
          reason: "missing-prices",
        },
      },
      {
        model: "gpt-6.1-sol",
        money: {
          state: "available",
          capturedCost: 6,
          records: 1,
          pricedRecords: 1,
          reason: "ok",
        },
      },
    ],
    other: empty,
    unknown: empty,
  };
  const page = render(<CalendarValues view={view} metric="cost" />);
  const original = table().textContent;
  expect(within(table()).getAllByRole("row")[15].textContent).toContain("$10.00");
  expect(original).toContain("$4.00 · 1 of 2 records priced · pricing partial");
  fireEvent.click(button("gpt-6.1"));
  expect(button("gpt-6.1").getAttribute("aria-pressed")).toBe("false");
  expect(table().textContent).toBe(original);
  page.rerender(<CalendarValues view={view} metric="tokens" />);
  expect(button("gpt-6.1").getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(button("gpt-6.1"));
  page.rerender(<CalendarValues view={view} metric="cost" />);
  expect(button("gpt-6.1").getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(button("Restore all series"));
  expect(button("gpt-6.1").getAttribute("aria-pressed")).toBe("true");
  page.rerender(<CalendarValues view={view} metric="tokens" />);
  expect(button("gpt-6.1").getAttribute("aria-pressed")).toBe("false");
});
it("retains semantic selection through changed drawing keys, metrics and absent identities", () => {
  const view = snapshot();
  const page = render(<CalendarValues view={view} metric="tokens" />);
  fireEvent.click(button("gpt-6.1-sol"));
  page.rerender(<CalendarValues view={view} metric="cost" />);
  page.rerender(<CalendarValues view={{ ...view, query: { ...query } }} metric="tokens" />);
  expect(button("gpt-6.1-sol").getAttribute("aria-pressed")).toBe("false");
  const refreshed = snapshot();
  refreshed.days[14].models!.named.push({
    model: "a.new[model]",
    totalTokens: 1,
  });
  refreshed.days[14].totalTokens = 601;
  page.rerender(<CalendarValues view={refreshed} metric="tokens" />);
  expect(button("a.new[model]").getAttribute("aria-pressed")).toBe("true");
  expect(button("gpt-6.1-sol").getAttribute("aria-pressed")).toBe("false");
  const absent = calendarEmptySnapshot(query, "unknown");
  page.rerender(<CalendarValues view={absent} metric="tokens" />);
  expect(screen.getByRole("status").textContent).toBe("No recorded model series.");
  page.rerender(<CalendarValues view={view} metric="tokens" />);
  expect(button("gpt-6.1-sol").getAttribute("aria-pressed")).toBe("false");
  page.rerender(<CalendarValues view={absent} metric="tokens" />);
  fireEvent.click(button("Restore all series"));
  page.rerender(<CalendarValues view={view} metric="tokens" />);
  expect(button("gpt-6.1-sol").getAttribute("aria-pressed")).toBe("true");
  act(() => {
    button("gpt-6.1-sol").click();
    button("gpt-6.1-sol").click();
  });
  expect(button("gpt-6.1-sol").getAttribute("aria-pressed")).toBe("true");
});
it.each([
  { ...query, startDate: "2026-08-01" },
  { ...query, timezone: "Europe/Brussels" },
  { ...query, group: "thread" as const },
  { ...query, scope: { kind: "workspace" as const, workspace: "/synthetic" } },
  { ...query, comparison: true },
  { ...query, includeUncertain: true },
])("resets when query changes and does not revive old filters: %j", (nextQuery) => {
  const view = snapshot();
  const page = render(<CalendarValues view={view} metric="tokens" />);
  fireEvent.click(button("gpt-6.1-sol"));
  page.rerender(<CalendarValues view={{ ...view, query: nextQuery }} metric="tokens" />);
  expect(button("gpt-6.1-sol").getAttribute("aria-pressed")).toBe("true");
  page.rerender(<CalendarValues view={view} metric="tokens" />);
  expect(button("gpt-6.1-sol").getAttribute("aria-pressed")).toBe("true");
});
it("distinguishes reserved display names, unknown buckets, and punctuation without changing table names", () => {
  const view = calendarSnapshot(query);
  view.days[14].models = {
    named: [
      { model: "Unknown model", totalTokens: 100 },
      { model: "Other models", totalTokens: 100 },
      { model: "unknown", totalTokens: 100 },
      { model: "m0.[fast]", totalTokens: 100 },
    ],
    otherTokens: 100,
  };
  render(<CalendarValues view={view} metric="tokens" />);
  const names = [
    "Unknown model named model",
    "Other models named model",
    "unknown",
    "m0.[fast]",
    "Other models",
    "Unknown model",
  ];
  for (const name of names) {
    const control = button(name);
    fireEvent.click(control);
    expect(control.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(control);
    expect(control.getAttribute("aria-pressed")).toBe("true");
  }
  expect(
    Array.from(table().querySelectorAll("tbody tr")[14].children)
      .slice(-6)
      .map((cell) => cell.textContent),
  ).toEqual(["100", "100", "100", "100", "100", "100"]);
});
it.each(["unknown", "observed-inactivity"] as const)(
  "keeps %s distinct from all-hidden and permits restoration",
  (state) => {
    render(<CalendarValues view={calendarEmptySnapshot(query, state)} metric="tokens" />);
    expect(screen.getByRole("status").textContent).toBe("No recorded model series.");
    expect(screen.queryByRole("button", { name: "Restore all series" })).toBeNull();
    expect(table().querySelector("tbody tr td")!.textContent).toBe(
      state === "unknown" ? "Unavailable" : "0",
    );
  },
);

it("filters the projected overflow bucket without changing its constituents or facts", () => {
  const view = calendarSnapshot(query);
  view.days[14].totalTokens = 800;
  view.days[14].models = {
    named: Array.from({ length: 8 }, (_, index) => ({ model: `model-${index}`, totalTokens: 100 })),
    otherTokens: 0,
  };
  view.days[15] = {
    ...view.days[14],
    date: view.days[15].date,
    totalTokens: 100,
    models: { named: [{ model: "zzz-overflow", totalTokens: 100 }], otherTokens: 0 },
  };
  render(<CalendarValues view={view} metric="tokens" />);
  const original = table().textContent;
  expect(
    within(screen.getByRole("group", { name: "Models" }))
      .getAllByRole("button")
      .map((node) => node.textContent),
  ).toEqual([
    "model-0",
    "model-1",
    "model-2",
    "model-3",
    "model-4",
    "model-5",
    "model-6",
    "model-7",
    "Other models",
  ]);
  fireEvent.click(button("Other models"));
  expect(button("model-7").getAttribute("aria-pressed")).toBe("true");
  expect(table().textContent).toBe(original);
  expect(
    Array.from(table().querySelectorAll("tbody tr")[15].children)
      .slice(-9)
      .map((node) => node.textContent),
  ).toEqual(["0", "0", "0", "0", "0", "0", "0", "0", "100"]);
});
it("discards selection on unmount", () => {
  const view = snapshot();
  const page = render(<CalendarValues view={view} metric="tokens" />);
  fireEvent.click(button("gpt-6.1-sol"));
  page.unmount();
  render(<CalendarValues view={view} metric="tokens" />);
  expect(button("gpt-6.1-sol").getAttribute("aria-pressed")).toBe("true");
});

it("keeps the host report request, money and facts unchanged by local filters", async () => {
  const options = Intl.DateTimeFormat().resolvedOptions();
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    ...options,
    timeZone: "UTC",
  });
  const read = vi.fn(async (input: { query: CalendarQuery }) => {
    const view = snapshot(input.query);
    view.days[14].money = view.summary.money = {
      state: "available",
      capturedCost: 1.25,
      records: 60,
      pricedRecords: 60,
      pricedEntities: 60,
      reason: "ok",
    };
    return view;
  });
  render(
    <CalendarReportPanel
      selection={{ hostId: "host_a", generation: 1 }}
      now={Date.parse("2026-10-01T12:00:00Z")}
      read={read}
    />,
  );
  await screen.findByRole("group", { name: "Models" });
  const original = table().textContent;
  fireEvent.click(button("gpt-6.1-sol"));
  fireEvent.click(button("Restore all series"));
  expect(table().textContent).toBe(original);
  fireEvent.change(screen.getByRole("combobox", { name: "Report metric" }), {
    target: { value: "cost" },
  });
  expect(table().querySelectorAll("tbody tr")[14].children[1].textContent).toBe("$1.25");
  expect(read.mock.calls).toEqual([
    [
      {
        hostId: "host_a",
        generation: 1,
        query: {
          startDate: "2026-09-02",
          timezone: "UTC",
          group: "workspace",
          scope: { kind: "host" },
          includeUncertain: true,
        },
      },
    ],
  ]);
});

it("keeps the default legend compact and exposes selection status without routine clutter", () => {
  render(<CalendarValues view={snapshot()} metric="tokens" />);
  expect(screen.queryByRole("button", { name: "Restore all series" })).toBeNull();
  expect(screen.getByRole("status").className).toBe("sr-only");
  const fast = button("gpt-6.1-sol");
  expect(fast.textContent).toBe("gpt-6.1-sol");
  fireEvent.click(fast);
  expect(fast.textContent).toBe("gpt-6.1-sol");
  expect(fast.querySelector("span:last-child")!.className).toContain("line-through");
  expect(screen.getByRole("status").className).toBe("sr-only");
  fast.focus();
  fireEvent.click(fast);
  expect(document.activeElement).toBe(fast);
  expect(screen.queryByRole("button", { name: "Restore all series" })).toBeNull();
});
it("restores focus before the trailing restore disappears", () => {
  const view = snapshot();
  const page = render(<CalendarValues view={view} metric="tokens" />);
  const fast = button("gpt-6.1-sol");
  fireEvent.click(fast);
  button("Restore all series").focus();
  fireEvent.click(button("Restore all series"));
  expect(document.activeElement).toBe(fast);
  fireEvent.click(fast);
  page.rerender(<CalendarValues view={calendarEmptySnapshot(query, "unknown")} metric="tokens" />);
  button("Restore all series").focus();
  fireEvent.click(button("Restore all series"));
  expect(document.activeElement).toBe(screen.getByRole("group", { name: "Daily recorded values" }));
  expect(document.activeElement!.getAttribute("tabindex")).toBe("-1");
  page.rerender(<CalendarValues view={view} metric="tokens" />);
  expect(button("gpt-6.1-sol").getAttribute("aria-pressed")).toBe("true");
});
it("recovers from a focused restore removed by query reset without stealing surviving focus", () => {
  const view = snapshot();
  const next = { ...view, query: { ...query, startDate: "2026-08-01" } };
  const page = render(<CalendarValues view={view} metric="tokens" />);
  fireEvent.click(button("gpt-6.1-sol"));
  button("Restore all series").focus();
  page.rerender(<CalendarValues view={next} metric="tokens" />);
  expect(document.activeElement).toBe(button("gpt-6.1-sol"));
  fireEvent.click(button("gpt-6.1-sol"));
  button("gpt-6.1").focus();
  page.rerender(<CalendarValues view={view} metric="tokens" />);
  expect(document.activeElement).toBe(button("gpt-6.1"));
});
it("falls back to the first current series if the last toggled identity is absent", () => {
  const view = snapshot();
  const page = render(<CalendarValues view={view} metric="tokens" />);
  fireEvent.click(button("gpt-6.1-sol"));
  const refreshed = snapshot();
  refreshed.days[14].models!.named = refreshed.days[14].models!.named.slice(0, 1);
  page.rerender(<CalendarValues view={refreshed} metric="tokens" />);
  expect(screen.getByRole("status").textContent).toBe("0 model series hidden.");
  button("Restore all series").focus();
  fireEvent.click(button("Restore all series"));
  expect(document.activeElement).toBe(button("gpt-6.1"));
  page.rerender(<CalendarValues view={view} metric="tokens" />);
  expect(button("gpt-6.1-sol").getAttribute("aria-pressed")).toBe("true");
});

it("keeps focus on a surviving metric control and uses the stable group for an empty query reset", () => {
  const view = snapshot();
  const metricControl = <button type="button">Change metric</button>;
  const page = render(
    <>
      {metricControl}
      <CalendarValues view={view} metric="tokens" />
    </>,
  );
  fireEvent.click(button("gpt-6.1-sol"));
  button("Change metric").focus();
  page.rerender(
    <>
      {metricControl}
      <CalendarValues view={view} metric="cost" />
    </>,
  );
  expect(document.activeElement).toBe(button("Change metric"));
  page.rerender(
    <>
      {metricControl}
      <CalendarValues view={view} metric="tokens" />
    </>,
  );
  button("Restore all series").focus();
  page.rerender(
    <>
      {metricControl}
      <CalendarValues
        view={calendarEmptySnapshot({ ...query, startDate: "2026-08-01" }, "unknown")}
        metric="tokens"
      />
    </>,
  );
  expect(document.activeElement).toBe(screen.getByRole("group", { name: "Daily recorded values" }));
  expect(screen.queryByRole("button", { name: "Restore all series" })).toBeNull();
});
