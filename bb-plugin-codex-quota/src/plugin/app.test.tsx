// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { accountsFixture, reportsFixture } from "../machines/machines.test-support.js";
import type { CalendarQuery } from "../history/calendar/calendar-contract.js";
import { emptyActivity } from "../activity/activity-contract.js";

const installed = await loadPluginApp(() => import("./app.js"));
const panel = installed.navPanels[0]!;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function fixture(multiple = false) {
  const now = Date.now();
  const data = accountsFixture(now, multiple);
  const machineAccounts = vi.fn(async () => data);
  const machineReports = vi.fn(async (input: unknown) =>
    reportsFixture((input as { query: CalendarQuery }).query, now),
  );
  const selectHost = vi.fn(async (input: unknown) => ({
    hostId: (input as { hostId: string }).hostId,
    generation: 1,
  }));
  const options = {
    rpc: {
      machineAccounts,
      machineReports,
      machinePreparation: async () => ({ state: "settled", progress: "ready" }),
      selectHost,
    },
  };
  const dashboard = () => {
    const slot = renderSlot(panel, { subPath: "" }, options);
    return { ...slot, ...within(slot.container) };
  };
  const accessory = () =>
    renderSlot({ component: panel.experimental_sidebarAccessory! }, {}, options);
  return { now, data, machineAccounts, machineReports, selectHost, options, dashboard, accessory };
}
describe("all-machine Codex slots", () => {
  it("shares one refresh owner across panes and passive accessories, without a machine picker", async () => {
    const f = fixture(),
      timers = vi.spyOn(globalThis, "setInterval"),
      stop = vi.spyOn(globalThis, "clearInterval");
    expect(panel.path).toBe("quota");
    const owner = renderSlot(
      installed.appOverlays.find((slot) => slot.id === "quota-refresh")!,
      {},
      f.options,
    );
    const page = f.dashboard(),
      split = f.dashboard(),
      badge = f.accessory();
    await waitFor(() => expect(badge.container.textContent).toBe("63%"));
    expect(page.queryByRole("combobox")).toBeNull();
    expect(page.getByLabelText("Account allowance")).toBeTruthy();
    expect(split.getByLabelText("Account allowance")).toBeTruthy();
    expect(f.machineAccounts).toHaveBeenCalledTimes(1);
    expect(f.selectHost).not.toHaveBeenCalled();
    expect(page.getByRole("link", { name: /Open Codex Usage/ }).getAttribute("href")).toBe(
      "https://chatgpt.com/codex/settings/usage",
    );
    const ids = timers.mock.calls.flatMap((args, index) =>
      args[1] === 1000 ? [timers.mock.results[index]!.value] : [],
    );
    expect(ids).toHaveLength(1);
    page.unmount();
    split.unmount();
    owner.unmount();
    expect(stop).toHaveBeenCalledWith(ids[0]);
    expect(badge.container.textContent).toBe("—");
  });
  it("shows combined recorded totals, changes chart metrics without preparing or selecting machines", async () => {
    const f = fixture(true),
      page = f.dashboard();
    await waitFor(() =>
      expect(page.getByLabelText("Recorded token subtotal").textContent).toBe("1.2K"),
    );
    expect(page.getByLabelText("Captured cost subtotal").textContent).toMatch(/^\$6/);
    const metric = page.getByRole("button", { name: "Estimated cost" });
    const before = f.machineReports.mock.calls.length;
    await act(async () => {
      fireEvent.click(metric);
    });
    expect(f.machineReports).toHaveBeenCalledTimes(before);
    expect(page.queryByText("Daily values")).toBeNull();
    expect(page.getAllByRole("heading", { name: /Account [12]/ })).toHaveLength(2);
    await act(async () => {
      fireEvent.click(page.getByRole("button", { name: "Threads" }));
    });
    await waitFor(() =>
      expect((f.machineReports.mock.lastCall![0] as { query: CalendarQuery }).query.group).toBe(
        "thread",
      ),
    );
    expect(f.selectHost).not.toHaveBeenCalled();
  });
  it("shows a known qualifier when some account quota is unavailable, without a min label", async () => {
    const f = fixture(true);
    f.data.accounts[1]!.quota = { state: "unavailable", reason: "auth-required", snapshot: null };
    f.data.accounts[1]!.activity = emptyActivity("auth-required");
    const page = f.dashboard(),
      badge = f.accessory();
    await waitFor(() => expect(badge.container.textContent).toBe("63%known"));
    expect(badge.queryByText("min")).toBeNull();
    expect(
      page.getByText(
        "Account activity is counted once per account and is not added to the recorded usage chart.",
      ),
    ).toBeTruthy();
  });
  it("keeps combined recorded totals when showing verified-thread rankings", async () => {
    const f = fixture();
    f.machineReports.mockImplementation(async (input) => {
      const query = (input as { query: CalendarQuery }).query;
      const data = reportsFixture(query, f.now);
      if (query.group === "thread")
        for (const row of data.machines) {
          if (row.report.state !== "unavailable") row.report.ranking = [];
        }
      return data;
    });
    const page = f.dashboard();
    await waitFor(() =>
      expect(page.getByLabelText("Recorded token subtotal").textContent).toBe("1.2K"),
    );
    const baseReads = f.machineReports.mock.calls.filter(
      ([input]) => (input as { query: CalendarQuery }).query.group === "workspace",
    ).length;
    fireEvent.click(page.getByRole("button", { name: "Threads" }));
    await waitFor(() =>
      expect((f.machineReports.mock.lastCall![0] as { query: CalendarQuery }).query.group).toBe(
        "thread",
      ),
    );
    expect(page.getByLabelText("Recorded token subtotal").textContent).toBe("1.2K");
    expect(
      f.machineReports.mock.calls.filter(
        ([input]) => (input as { query: CalendarQuery }).query.group === "workspace",
      ),
    ).toHaveLength(baseReads);
  });
});
