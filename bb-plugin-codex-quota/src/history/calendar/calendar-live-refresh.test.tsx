// @vitest-environment jsdom
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { dashboardFixture } from "../../machines/app.test-support.js";
import { reportsFixture } from "../../machines/machines.test-support.js";
import type { CalendarQuery } from "./calendar-contract.js";
const flush = async () => {
  await act(async () => {
    for (let n = 0; n < 20; n++) await Promise.resolve();
  });
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("refreshes the visible graph on its own cadence without adding account owners or collection actions", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  const f = await dashboardFixture();
  f.data.accounts[0]!.quota = { state: "unavailable", reason: "auth-required", snapshot: null };
  const page = f.page(),
    settings = f.settings();
  await flush();
  expect(within(page.container).getByRole("group", { name: "Daily recorded values" })).toBeTruthy();
  expect(f.machineAccounts).toHaveBeenCalledTimes(1);
  const reads = (group: CalendarQuery["group"]) =>
    f.machineReports.mock.calls.filter(
      ([input]) => (input as { query: CalendarQuery }).query.group === group,
    ).length;
  const chartReads = reads("workspace"),
    threadReads = reads("thread");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120_000);
  });
  expect(f.machinePreparation).toHaveBeenCalledTimes(3);
  expect(reads("workspace")).toBe(chartReads + 2);
  expect(reads("thread")).toBe(threadReads + 2);
  expect(
    f.machineAccounts.mock.calls.every(([input]) => !(input as { refresh: boolean }).refresh),
  ).toBe(true);
  expect(f.selectHost).not.toHaveBeenCalled();
  expect(f.collectorControl).not.toHaveBeenCalled();
  expect(f.historicalImport).not.toHaveBeenCalled();
  expect(
    settings.inspection.rpcCalls.filter((call) => call.method === "machineReports"),
  ).toHaveLength(0);
  page.lifecycle.unmount();
  settings.lifecycle.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000);
  });
  expect(vi.getTimerCount()).toBe(0);
}, 15_000);
it("ages the last report while preparation is stopped, supports manual reread, and stops on unmount", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  const f = await dashboardFixture();
  f.machinePreparation.mockResolvedValue({
    state: "unavailable",
    reason: "storage-unavailable",
    progress: "",
  });
  f.machineReports.mockImplementation(async (input) =>
    reportsFixture((input as { query: CalendarQuery }).query, Date.now()),
  );
  const page = f.page(),
    q = within(page.container);
  await flush();
  expect(q.getByText(/History preparation stopped/)).toBeTruthy();
  expect(q.getByRole("group", { name: "Daily recorded values" })).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(301_000);
  });
  expect(q.getByText(/Recorded values are out of date/)).toBeTruthy();
  fireEvent.click(q.getByRole("button", { name: "Refresh chart" }));
  await flush();
  expect(q.queryByText(/Recorded values are out of date/)).toBeNull();
  expect(q.getByRole("button", { name: "Retry preparation" })).toBeTruthy();
  expect(f.machinePreparation).toHaveBeenCalledTimes(1);
  expect(
    f.machineReports.mock.calls.filter(
      ([input]) => (input as { query: CalendarQuery }).query.group === "workspace",
    ),
  ).toHaveLength(2);
  expect(
    f.machineReports.mock.calls.filter(
      ([input]) => (input as { query: CalendarQuery }).query.group === "thread",
    ),
  ).toHaveLength(1);
  page.lifecycle.unmount();
  const calls = page.inspection.rpcCalls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300_000);
  });
  fireEvent(document, new Event("visibilitychange"));
  fireEvent(window, new Event("focus"));
  await flush();
  expect(page.inspection.rpcCalls).toHaveLength(calls);
  expect(vi.getTimerCount()).toBe(0);
}, 15_000);
