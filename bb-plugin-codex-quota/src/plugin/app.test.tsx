// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { accountsFixture, reportsFixture } from "../machines/machines.test-support.js";
import type { CalendarQuery } from "../history/calendar/calendar-contract.js";
import { emptyActivity } from "../activity/activity-contract.js";
import { requireFixtureValue } from "../require-fixture-value.test-support.js";

const installed = await loadPluginApp(() => import("./app.js"));
const panel = installed.navPanels[0];
const NavigationBadge = () => {
  const badge = panel.experimental_useBadge?.();
  return badge ? <span title={badge.label}>{badge.text}</span> : null;
};
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
  const machinePreparation = vi.fn(async () => ({ state: "settled", progress: "ready" }));
  const options = {
    rpc: {
      machineAccountsV2: machineAccounts,
      machineReports,
      machinePreparation,
      selectHost,
    },
  };
  const dashboard = () => {
    const slot = renderSlot(panel, { subPath: "" }, options);
    return { ...slot, ...within(slot.container) };
  };
  const accessory = () => renderSlot({ component: NavigationBadge }, {}, options);
  return {
    now,
    data,
    machineAccounts,
    machineReports,
    machinePreparation,
    selectHost,
    options,
    dashboard,
    accessory,
  };
}
describe("all-machine Codex slots", () => {
  it("shares one refresh owner across panes and passive accessories, without a machine picker", async () => {
    const f = fixture();
    const timers = vi.spyOn(globalThis, "setInterval");
    const stop = vi.spyOn(globalThis, "clearInterval");
    expect(panel.path).toBe("quota");
    const owner = renderSlot(
      requireFixtureValue(installed.appOverlays.find((slot) => slot.id === "quota-refresh")),
      {},
      f.options,
    );
    const page = f.dashboard();
    const split = f.dashboard();
    const badge = f.accessory();
    await waitFor(() => expect(badge.container.textContent).toBe("63%"));
    expect(page.queryByRole("combobox")).toBeNull();
    expect(page.getByLabelText("Account allowance")).toBeTruthy();
    expect(split.getByLabelText("Account allowance")).toBeTruthy();
    expect(f.machineAccounts).toHaveBeenCalledTimes(1);
    expect(f.selectHost).not.toHaveBeenCalled();
    expect(page.getByRole("link", { name: /Open Codex Usage/ }).getAttribute("href")).toBe(
      "https://chatgpt.com/settings/usage?tab=overview",
    );
    const ids = timers.mock.calls.flatMap((args, index) =>
      args[1] === 1000 ? [timers.mock.results[index].value] : [],
    );
    expect(ids).toHaveLength(1);
    page.unmount();
    split.unmount();
    owner.unmount();
    expect(stop).toHaveBeenCalledWith(ids[0]);
    expect(badge.container.textContent).toBe("—");
  });
  it("shows combined recorded totals, changes chart metrics without preparing or selecting machines", async () => {
    const f = fixture(true);
    const page = f.dashboard();
    await waitFor(() =>
      expect(page.getByLabelText("Recorded token subtotal").textContent).toBe("1.2 thousand"),
    );
    expect(page.getByLabelText("Captured cost subtotal").textContent).toMatch(/^\$6/);
    const metric = page.getByRole("button", { name: "Estimated cost" });
    const tokens = page.getByRole("button", { name: "Tokens" });
    expect(tokens.getAttribute("aria-pressed")).toBe("true");
    expect(metric.getAttribute("aria-pressed")).toBe("false");
    const before = f.machineReports.mock.calls.length;
    const preparations = f.machinePreparation.mock.calls.length;
    await act(async () => {
      fireEvent.click(metric);
    });
    expect(metric.getAttribute("aria-pressed")).toBe("true");
    expect(tokens.getAttribute("aria-pressed")).toBe("false");
    const costTable = within(page.getByRole("table", { name: "Daily recorded usage" }));
    expect(costTable.getByRole("columnheader", { name: "USD estimate" }).textContent).toBe(
      "USD estimate",
    );
    expect(costTable.getByRole("cell", { name: "$6.00" }).textContent).toBe("$6.00");
    expect(costTable.queryByRole("columnheader", { name: "Tokens" })).toBeNull();
    expect(f.machineReports).toHaveBeenCalledTimes(before);
    expect(f.machinePreparation).toHaveBeenCalledTimes(preparations);
    await act(async () => {
      fireEvent.click(tokens);
    });
    expect(tokens.getAttribute("aria-pressed")).toBe("true");
    expect(metric.getAttribute("aria-pressed")).toBe("false");
    const tokenTable = within(page.getByRole("table", { name: "Daily recorded usage" }));
    expect(tokenTable.getByRole("columnheader", { name: "Tokens" }).textContent).toBe("Tokens");
    expect(within(tokenTable.getAllByRole("row")[15]).getAllByRole("cell")[0].textContent).toBe(
      "1,200",
    );
    expect(tokenTable.queryByRole("columnheader", { name: "USD estimate" })).toBeNull();
    expect(f.machineReports).toHaveBeenCalledTimes(before);
    expect(f.machinePreparation).toHaveBeenCalledTimes(preparations);
    expect(page.queryByText("Daily values")).toBeNull();
    expect(page.getAllByRole("heading", { name: /Account [12]/ })).toHaveLength(2);
    expect(f.selectHost).not.toHaveBeenCalled();
  });
  it("shows a known qualifier when some account quota is unavailable, without a min label", async () => {
    const f = fixture(true);
    f.data.accounts[1].quota = { state: "unavailable", reason: "auth-required", snapshot: null };
    f.data.accounts[1].activity = emptyActivity("auth-required");
    const page = f.dashboard();
    const badge = f.accessory();
    await waitFor(() => expect(badge.container.textContent).toBe("63%"));
    expect(badge.queryByText("min")).toBeNull();
    expect(
      page.getByText("Account-wide limits and balances. Separate from recorded machine usage."),
    ).toBeTruthy();
  });
  it("shows account credits and resets above the chart, without ranking or machine controls", async () => {
    const f = fixture(true);
    const first = requireFixtureValue(requireFixtureValue(f.data.accounts[0]).quota.snapshot);
    Object.assign(first, {
      credits: { kind: "balance", balance: "0.00000000001" },
      bankedResets: 0,
    });
    const page = f.dashboard();
    const allowance = page.getByRole("region", { name: "Account allowance" });
    const chart = page.getByRole("region", { name: "All-machine recorded usage" });
    expect(allowance.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(4);
    await waitFor(() => {
      expect(within(allowance).getByText("<1", { exact: true }).closest("dd")?.textContent).toBe(
        "<1 credits left",
      );
      expect(within(chart).getByLabelText("Recorded token subtotal").textContent).toBe(
        "1.2 thousand",
      );
    });
    const firstAccount = within(page.getByRole("region", { name: "Account 1 allowance" }));
    expect(
      firstAccount.getByText("0", { exact: true, selector: "dd" }).closest("div")?.textContent,
    ).toBe("Banked resets0 available");
    expect(
      firstAccount
        .getByText("5-hour window", { selector: "dt" })
        .closest("div")
        ?.querySelector("time")?.dateTime,
    ).toBe(first.general[0].resetAt);
    expect(
      within(page.getByRole("region", { name: "Account 2 allowance" })).getByText("Unavailable", {
        selector: "dd",
      }).textContent,
    ).toBe("Unavailable");
    expect(
      within(allowance).getByRole("link", { name: "Open Codex Usage" }).getAttribute("target"),
    ).toBe("_blank");
    expect(page.queryByRole("table", { name: "Recorded usage ranking" })).toBeNull();
    expect(page.queryByText("Machine status and collection settings")).toBeNull();
    expect(
      f.machineReports.mock.calls.map(([input]) => (input as { query: CalendarQuery }).query.group),
    ).not.toContain("thread");
  });

  it("labels last-known credits and hides expired credits and resets", async () => {
    const f = fixture(true);
    const [lastKnown, expired] = f.data.accounts;
    const staleSnapshot = requireFixtureValue(requireFixtureValue(lastKnown).quota.snapshot);
    staleSnapshot.observedAt = new Date(f.now - 10 * 60_000).toISOString();
    staleSnapshot.credits = { kind: "unlimited" };
    staleSnapshot.general[0].resetAt = new Date(f.now - 60_000).toISOString();
    const expiredSnapshot = requireFixtureValue(requireFixtureValue(expired).quota.snapshot);
    expiredSnapshot.observedAt = new Date(f.now - 25 * 60 * 60_000).toISOString();
    expiredSnapshot.credits = { kind: "balance", balance: "125" };
    expiredSnapshot.bankedResets = 12;
    const page = f.dashboard();
    const stale = within(await page.findByRole("region", { name: "Account 1 allowance" }));
    expect(stale.getByText("Unlimited").textContent).toBe("Unlimited");
    const staleStatus = stale.getByRole("status");
    expect(staleStatus.textContent).toContain("Account 1: Stale · Observed");
    expect(staleStatus.querySelector("time")?.dateTime).toBe(staleSnapshot.observedAt);
    expect(stale.getByText("Reset due", { exact: false }).querySelector("time")?.dateTime).toBe(
      staleSnapshot.general[0].resetAt,
    );
    const unavailable = within(page.getByRole("region", { name: "Account 2 allowance" }));
    expect(unavailable.getAllByText("Unavailable", { selector: "dd" })).toHaveLength(2);
    const expiredStatus = unavailable.getByRole("status");
    expect(expiredStatus.textContent).toBe("Account 2: Observation expired");
    expect(unavailable.queryByText("Weekly window")).toBeNull();
    await act(async () => {
      requireFixtureValue(expired).quota = requireFixtureValue(
        accountsFixture(f.now, true).accounts[1],
      ).quota;
      fireEvent.click(page.getByRole("button", { name: "Refresh allowance" }));
    });
    expect(unavailable.getByRole("status")).toBe(expiredStatus);
    expect(expiredStatus.textContent).toContain("Account 2: Observed");
    expect(staleStatus.textContent).toContain("Stale");
    const allowance = within(page.getByRole("region", { name: "Account allowance" }));
    const statuses = allowance.getAllByRole("status");
    expect(statuses.filter((status) => status.textContent?.includes("Observed"))).toEqual([
      staleStatus,
      expiredStatus,
    ]);
  });
});
