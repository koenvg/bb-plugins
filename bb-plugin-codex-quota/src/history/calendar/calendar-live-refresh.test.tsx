// @vitest-environment jsdom
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeHostResponse } from "@get-bb/plugin-sdk/testing";
import type { CalendarQuery } from "./calendar-contract.js";
import { calendarSnapshot } from "./calendar-test-support.js";

const app = await loadPluginApp(() => import("../../plugin/app.js"));
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

it("refreshes the open public graph without quota or management and shares no refresh owner with extra views", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  const prepare = vi.fn(async () => ({ state: "settled", progress: "done" }));
  const read = vi.fn(async (input: unknown) => {
    const { query } = input as { query: CalendarQuery };
    return { ...calendarSnapshot(query), observedAt: new Date(Date.now()).toISOString() };
  });
  const forbidden = vi.fn(async () => {
    throw Error("No management or account activity");
  });
  const quota = vi.fn(async () => ({
    state: "unavailable",
    reason: "auth-required",
    snapshot: null,
  }));
  const options = {
    sdk: { hosts: { list: async () => [makeHostResponse({ id: "host_a", name: "Host A" })] } },
    rpc: {
      selection: async () => ({ hostId: "host_a", generation: 1 }),
      read: quota,
      reportPreparation: prepare,
      calendarReport: read,
      historyReadiness: forbidden,
      collectorControl: forbidden,
      historicalImport: forbidden,
      activity: forbidden,
    },
  };
  const owner = renderSlot(
    app.appOverlays.find((o) => o.id === "quota-refresh")!,
    {},
    options,
  );
  const page = renderSlot(app.navPanels[0]!, { subPath: "" }, options);
  const badge = renderSlot(app.settingsSections[0]!, {}, options);
  try {
    await flush();
    const q = within(page.container);
    expect(q.getByRole("group", { name: "Daily recorded values" })).toBeTruthy();
    expect(prepare).toHaveBeenCalledTimes(1);
    const reads = read.mock.calls.length;
    const quotaReads = quota.mock.calls.length;
    fireEvent.change(q.getByRole("combobox", { name: "Report metric" }), {
      target: { value: "cost" },
    });
    expect(read).toHaveBeenCalledTimes(reads);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await flush();
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledTimes(reads + 1);
    const settledReads = read.mock.calls.length;
    const quotaAfterFirstInterval = quota.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await flush();
    // Quota now has a longer retry delay. Graph refresh must keep its own 60-second cadence.
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(read).toHaveBeenCalledTimes(settledReads + 1);
    expect(quota).toHaveBeenCalledTimes(quotaAfterFirstInterval);
    // The account owner may independently retry allowance. The graph must add no owner or explicit refresh.
    expect(quota.mock.calls.length - quotaReads).toBeLessThanOrEqual(1);
    expect(page.inspection.rpcCalls.filter((c) => c.method === "read")).toHaveLength(0);
    expect(
      badge.inspection.rpcCalls.filter((c) =>
        /read|reportPreparation|calendarReport/.test(c.method),
      ),
    ).toHaveLength(0);
    expect(forbidden).not.toHaveBeenCalled();
  } finally {
    page.lifecycle.unmount();
    badge.lifecycle.unmount();
    owner.lifecycle.unmount();
  }
});

it("ages a readable graph without a quota clock and keeps stopped preparation visible after a successful read", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  const prepare = vi.fn(async () => ({
    state: "unavailable",
    reason: "storage-unavailable",
    progress: "",
  }));
  const read = vi.fn(async (input: unknown) => {
    const { query } = input as { query: CalendarQuery };
    return { ...calendarSnapshot(query), observedAt: new Date(Date.now()).toISOString() };
  });
  const options = {
    sdk: { hosts: { list: async () => [makeHostResponse({ id: "host_a" })] } },
    rpc: {
      selection: async () => ({ hostId: "host_a", generation: 1 }),
      read: async () => ({ state: "unavailable", reason: "auth-required", snapshot: null }),
      reportPreparation: prepare,
      calendarReport: read,
    },
  };
  const owner = renderSlot(
    app.appOverlays.find((o) => o.id === "quota-refresh")!,
    {},
    options,
  );
  const page = renderSlot(app.navPanels[0]!, { subPath: "" }, options);
  try {
    await flush();
    owner.lifecycle.unmount();
    const q = within(page.container);
    expect(
      q.getByText("History preparation stopped. Recorded values remain available."),
    ).toBeTruthy();
    expect(q.getByRole("group", { name: "Daily recorded values" })).toBeTruthy();
    expect(q.queryByText("Chart is out of date.")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(301000);
    });
    expect(q.getByText("Chart is out of date.")).toBeTruthy();
    fireEvent.click(q.getByRole("button", { name: "Refresh chart" }));
    await flush();
    expect(q.queryByText("Chart is out of date.")).toBeNull();
    expect(q.getByRole("button", { name: "Retry preparation" })).toBeTruthy();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(2);
    page.lifecycle.unmount();
    const calls = page.inspection.rpcCalls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300000);
    });
    fireEvent(document, new Event("visibilitychange"));
    fireEvent(window, new Event("focus"));
    await flush();
    expect(page.inspection.rpcCalls).toHaveLength(calls);
  } finally {
    page.lifecycle.unmount();
    owner.lifecycle.unmount();
  }
});
