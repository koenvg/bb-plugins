// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, within, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeHostResponse } from "@get-bb/plugin-sdk/testing";
import type { CalendarQuery } from "./calendar-contract.js";
import { CalendarReportPanel } from "./calendar-panel.js";
import { calendarEmptySnapshot, calendarSnapshot } from "./calendar-test-support.js";
const app = await loadPluginApp(() => import("../../plugin/app.js"));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function calendarPage(
  read: (input: {
    hostId: string;
    generation: number;
    query: CalendarQuery;
  }) => unknown | Promise<unknown>,
  selectHost?: (input: {
    hostId: string | null;
  }) => Promise<{ hostId: string | null; generation: number }>,
  prepare?: () => Promise<unknown>,
  fakeTimers = false,
) {
  vi.useFakeTimers(fakeTimers ? {} : { toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  const options = {
    sdk: {
      hosts: {
        list: async () => [
          makeHostResponse({ id: "host_a", name: "Host A" }),
          makeHostResponse({ id: "host_b", name: "Host B" }),
        ],
      },
    },
    rpc: {
      selection: async () => ({ hostId: "host_a", generation: 1 }),
      selectHost: async (input: unknown) => {
        const { hostId } = input as { hostId: string | null };
        return selectHost ? selectHost({ hostId }) : { hostId, generation: 2 };
      },
      read: async () => ({ state: "unavailable", reason: "auth-required", snapshot: null }),
      historyReadiness: () =>
        prepare
          ? prepare()
          : Promise.resolve({
              state: "not-configured",
              reason: "not-configured",
              storage: "unconfigured",
              collector: "missing",
              writer: "unconfirmed",
            }),
      // Chart tests use a terminal preparation result, not a missing-handler retry path.
      reportPreparation: async () => ({
        state: "unavailable",
        reason: "identity-unavailable",
        progress: "",
      }),
      calendarReport: (input: unknown) =>
        read(input as { hostId: string; generation: number; query: CalendarQuery }),
    },
  };
  const owner = renderSlot(
    app.appOverlays.find((item) => item.id === "quota-refresh")!,
    {},
    options,
  );
  const page = renderSlot(app.navPanels[0]!, { subPath: "" }, options);
  return {
    page,
    q: within(page.container),
    prepared: () => within(page.container).findByRole("button", { name: "Retry preparation" }),
    stop: () => {
      page.lifecycle.unmount();
      owner.lifecycle.unmount();
    },
  };
}
it("navigates only the retained chart without mounting management controls", async () => {
  const f = calendarPage(({ query }) => calendarSnapshot(query));
  await f.q.findByRole("group", { name: "Daily recorded values" });
  expect(f.q.getByRole("button", { name: "Next 30 days" })).toHaveProperty("disabled", true);
  await f.prepared();
  const before = f.page.inspection.rpcCalls.length;
  fireEvent.change(f.q.getByRole("combobox", { name: "Report metric" }), {
    target: { value: "cost" },
  });
  expect(f.page.inspection.rpcCalls).toHaveLength(before);
  fireEvent.click(f.q.getByRole("button", { name: "Previous 30 days" }));
  await waitFor(() =>
    expect(f.q.getByRole("table", { name: "Daily recorded usage" }).textContent).toContain(
      "2026-08-02",
    ),
  );
  expect(f.page.inspection.rpcCalls.slice(before).map((call) => call.method)).toEqual([
    "calendarReport",
  ]);
  expect(
    f.page.inspection.rpcCalls.filter((call) => call.method === "historyReadiness"),
  ).toHaveLength(0);
  expect(
    f.page.inspection.rpcCalls.some((call) =>
      /activity|historicalImport|collectorControl/.test(call.method),
    ),
  ).toBe(false);
  expect(f.q.queryByText("Settings")).toBeNull();
  expect(f.q.queryByText("Breakdown")).toBeNull();
  expect(f.q.getByRole("link", { name: "Open Codex Usage" })).toBeTruthy();
  f.stop();
});
it("hides an old range immediately and ignores a delayed response", async () => {
  let finish!: (value: unknown) => void, oldQuery!: CalendarQuery;
  const f = calendarPage(({ query }) =>
    query.startDate === "2026-08-02"
      ? new Promise((resolve) => {
          finish = resolve;
          oldQuery = query;
        })
      : calendarSnapshot(query),
  );
  await f.q.findByRole("group", { name: "Daily recorded values" });
  fireEvent.click(f.q.getByRole("button", { name: "Previous 30 days" }));
  expect(f.q.queryByRole("group", { name: "Daily recorded values" })).toBeNull();
  await waitFor(() => expect(finish).toBeDefined());
  fireEvent.change(f.q.getByRole("combobox", { name: "Codex host" }), {
    target: { value: "host_b" },
  });
  await act(async () => {
    finish(calendarSnapshot(oldQuery));
  });
  expect(f.q.queryByRole("table", { name: "Daily recorded usage" })).toBeNull();
  f.stop();
});
it("invalidates the earlier host before selection completes and suppresses late output", async () => {
  let select!: (value: { hostId: string; generation: number }) => void;
  const f = calendarPage(
    ({ query }) => calendarSnapshot(query),
    () =>
      new Promise((resolve) => {
        select = resolve;
      }),
  );
  await f.q.findByRole("group", { name: "Daily recorded values" });
  fireEvent.change(f.q.getByRole("combobox", { name: "Codex host" }), {
    target: { value: "host_b" },
  });
  expect(f.q.queryByRole("group", { name: "Daily recorded values" })).toBeNull();
  expect(f.q.getByText("Changing host.")).toBeTruthy();
  await act(async () => {
    select({ hostId: "host_b", generation: 2 });
  });
  await f.q.findByRole("group", { name: "Daily recorded values" });
  expect(
    f.page.inspection.rpcCalls.filter((call) => call.method === "calendarReport").at(-1)?.input,
  ).toMatchObject({ hostId: "host_b", generation: 2 });
  f.stop();
});
it("keeps a failed retry stale only for the same frozen key", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const now = Date.parse("2026-10-01T12:00:00Z");
  vi.setSystemTime(now);
  let calls = 0;
  const props = {
    selection: { hostId: "host_a", generation: 1 },
    now,
    read: async ({ query }: { query: CalendarQuery }) =>
      ++calls === 1 ? calendarSnapshot(query) : Promise.reject(Error("synthetic retry")),
  };
  const page = render(<CalendarReportPanel {...props} />);
  await page.findByRole("group", { name: "Daily recorded values" });
  page.rerender(<CalendarReportPanel {...props} now={now + 360_000} />);
  fireEvent.click(page.getByRole("button", { name: "Refresh chart" }));
  await waitFor(() =>
    expect(page.getByRole("button", { name: "Refresh chart" })).toHaveProperty("disabled", false),
  );
  expect(page.getByText("Chart is out of date.")).toBeTruthy();
  expect(page.getByRole("table", { name: "Daily recorded usage" }).textContent).toContain("600");
  page.rerender(
    <CalendarReportPanel
      {...props}
      now={now + 360_000}
      selection={{ hostId: "host_b", generation: 2 }}
    />,
  );
  expect(page.queryByRole("table", { name: "Daily recorded usage" })).toBeNull();
});
it("makes missing viewer timezone explicit and does not send a report request", async () => {
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
    () => ({ resolvedOptions: () => ({ timeZone: "" }) }) as Intl.DateTimeFormat,
  );
  const f = calendarPage(({ query }) => calendarSnapshot(query));
  await f.q.findByText("Viewer timezone is unavailable.");
  expect(f.page.inspection.rpcCalls.some((call) => call.method === "calendarReport")).toBe(false);
  f.stop();
});
it.each(["unknown", "observed-inactivity"] as const)(
  "keeps %s dates separate from invented zero usage",
  async (state) => {
    const f = calendarPage(({ query }) => calendarEmptySnapshot(query, state));
    await f.q.findByRole("table", { name: "Daily recorded usage" });
    const rows = f.q
      .getByRole("table", { name: "Daily recorded usage" })
      .querySelectorAll("tbody tr");
    expect(rows[0].children[1].textContent).toBe(state === "unknown" ? "Unavailable" : "0");
    fireEvent.change(f.q.getByRole("combobox", { name: "Report metric" }), {
      target: { value: "cost" },
    });
    expect(rows[0].children[1].textContent).toBe("Unavailable");
    f.stop();
  },
);
it("does not draw monetary zero when no captured prices exist", async () => {
  const f = calendarPage(({ query }) => {
    const view = calendarSnapshot(query);
    view.days[14].money = {
      state: "unavailable",
      capturedCost: null,
      pricedRecords: 0,
      records: 60,
      pricedEntities: 0,
      reason: "missing-prices",
    };
    return view;
  });
  await f.q.findByRole("table", { name: "Daily recorded usage" });
  expect(f.q.getByRole("table", { name: "Daily recorded usage" }).textContent).toContain("600");
  fireEvent.change(f.q.getByRole("combobox", { name: "Report metric" }), {
    target: { value: "cost" },
  });
  expect(
    f.q.getByRole("table", { name: "Daily recorded usage" }).querySelectorAll("tbody tr")[14]
      .children[1].textContent,
  ).toBe("Unavailable");
  f.stop();
});
it("loads the retained index without waiting for management readiness on either host", async () => {
  const f = calendarPage(
    ({ query }) => calendarSnapshot(query),
    undefined,
    () => new Promise(() => {}),
  );
  await f.q.findByRole("group", { name: "Daily recorded values" });
  fireEvent.change(f.q.getByRole("combobox", { name: "Codex host" }), {
    target: { value: "host_b" },
  });
  await f.q.findByRole("group", { name: "Daily recorded values" });
  expect(f.page.inspection.rpcCalls.filter((call) => call.method === "historyReadiness")).toEqual(
    [],
  );
  expect(
    f.page.inspection.rpcCalls
      .filter((call) => call.method === "calendarReport")
      .map((call) => call.input),
  ).toMatchObject([
    { hostId: "host_a", generation: 1 },
    { hostId: "host_b", generation: 2 },
  ]);
  f.stop();
});
it("retries an unavailable chart without refreshing allowance or maintaining history", async () => {
  let calls = 0;
  const f = calendarPage(({ query }) =>
    ++calls === 1 ? { state: "unavailable", reason: "host-offline" } : calendarSnapshot(query),
  );
  await f.q.findByText("Selected host is offline.");
  await f.prepared();
  const before = f.page.inspection.rpcCalls.length;
  fireEvent.click(f.q.getByRole("button", { name: "Retry chart" }));
  await f.q.findByRole("group", { name: "Daily recorded values" });
  expect(calls).toBe(2);
  expect(f.page.inspection.rpcCalls.slice(before).map((call) => call.method)).toEqual([
    "calendarReport",
  ]);
  f.stop();
});
it("recovers the latest range after the retained older range is rejected by another host", async () => {
  const f = calendarPage(({ hostId, query }) =>
    hostId === "host_b" && query.startDate === "2026-08-02"
      ? { state: "unavailable", reason: "range-unavailable" }
      : calendarSnapshot(query),
  );
  await f.q.findByRole("group", { name: "Daily recorded values" });
  fireEvent.click(f.q.getByRole("button", { name: "Previous 30 days" }));
  await waitFor(() =>
    expect(f.q.getByRole("table", { name: "Daily recorded usage" }).textContent).toContain(
      "2026-08-02",
    ),
  );
  fireEvent.change(f.q.getByRole("combobox", { name: "Codex host" }), {
    target: { value: "host_b" },
  });
  await f.q.findByText(/outside the retained bounds/);
  await f.prepared();
  const before = f.page.inspection.rpcCalls.length;
  fireEvent.click(f.q.getByRole("button", { name: "Latest 30 days" }));
  await f.q.findByRole("group", { name: "Daily recorded values" });
  expect(f.page.inspection.rpcCalls.slice(before).map((call) => call.method)).toEqual([
    "calendarReport",
  ]);
  expect(f.page.inspection.rpcCalls.at(-1)?.input).toMatchObject({
    hostId: "host_b",
    generation: 2,
    query: { startDate: "2026-09-01" },
  });
  f.stop();
});

it("finishes the fixture preparation before navigation and schedules no transport retries", async () => {
  const f = calendarPage(({ query }) => calendarSnapshot(query), undefined, undefined, true);
  await act(async () => {
    await Promise.resolve();
  });
  expect(
    f.q.getByText("History preparation stopped. Recorded values remain available."),
  ).toBeTruthy();
  expect(
    f.page.inspection.rpcCalls.filter((call) => call.method === "reportPreparation"),
  ).toHaveLength(1);
  const before = f.page.inspection.rpcCalls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000);
  });
  expect(f.page.inspection.rpcCalls).toHaveLength(before);
  fireEvent.change(f.q.getByRole("combobox", { name: "Report metric" }), {
    target: { value: "cost" },
  });
  expect(f.page.inspection.rpcCalls).toHaveLength(before);
  f.stop();
});
