// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeHostResponse } from "@get-bb/plugin-sdk/testing";

const installed = await loadPluginApp(() => import("./app.js"));
const panel = installed.navPanels[0]!;
const host = makeHostResponse({ id: "host_1", name: "My Mac", status: "connected" });
const snapshot = {
  observedAt: new Date(Date.now() - 1000).toISOString(),
  plan: "plus" as const,
  bankedResets: 0,
  general: [{ id: "primary_window", name: "5 hours", remainingPercent: 42, resetAt: null }],
  additional: [],
  bindingWindowId: "primary_window",
  bindingRemainingPercent: 42,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BB Codex quota slots", () => {
  it("shares selected host and one app owner across dashboard, split view, and accessory", async () => {
    expect(panel.path).toBe("quota");
    const setTimer = vi.spyOn(globalThis, "setInterval");
    const clearTimer = vi.spyOn(globalThis, "clearInterval");
    // SDK queries default to the document; scope concurrent panes to their containers.
    const dashboard = () => {
      const slot = renderSlot(panel, { subPath: "" }, options);
      return { ...slot, ...within(slot.container) };
    };
    let selected: string | null = null;
    let generation = 0;
    let reads = 0;
    const options = {
      sdk: { hosts: { list: async () => [host] } },
      rpc: {
        selection: async () => ({ hostId: selected, generation }),
        selectHost: async (input: unknown) => {
          const { hostId } = input as { hostId: string | null };
          return { hostId: (selected = hostId), generation: ++generation };
        },
        read: async () => {
          reads++;
          return { state: "fresh" as const, reason: "ok" as const, snapshot };
        },
      },
    };
    snapshot.observedAt = new Date(Date.now() - 299_000).toISOString();
    const owner = renderSlot(
      installed.appOverlays.find((slot) => slot.id === "quota-refresh")!,
      {},
      options,
    );
    const page = dashboard();
    const split = dashboard();
    const badge = renderSlot({ component: panel.experimental_sidebarAccessory! }, {}, options);
    await waitFor(() => expect(page.getByRole("option", { name: /My Mac/ })).toBeTruthy());
    await act(async () => {
      fireEvent.change(page.getByRole("combobox", { name: /Codex host/i }), {
        target: { value: "host_1" },
      });
    });
    await waitFor(() => expect(badge.getByLabelText(/My Mac.*5 hours.*fresh/i)).toBeTruthy());
    expect(page.getByText("42% remaining")).toBeTruthy();
    expect(split.getByText("42% remaining")).toBeTruthy();
    expect(reads).toBe(1);
    const future = Date.now() + 3_000;
    page.lifecycle.unmount();
    const returned = dashboard();
    expect(returned.getByText("42% remaining")).toBeTruthy();
    expect(reads).toBe(1);
    vi.spyOn(Date, "now").mockReturnValue(future);
    act(() => {
      for (const [tick] of setTimer.mock.calls.filter(([, delay]) => delay === 1000))
        (tick as () => void)();
    });
    expect(
      within(returned.getByRole("region", { name: "Codex allowance summary" })).getByRole("status")
        .textContent,
    ).toMatch(/^Stale · updated /);
    expect(badge.container.textContent).toBe("Stale");
    expect(reads).toBe(1);
    expect(returned.getByRole("link", { name: /Open Codex Usage/i }).getAttribute("href")).toBe(
      "https://chatgpt.com/codex/settings/usage",
    );
    const ids = setTimer.mock.results
      .filter((_, index) => setTimer.mock.calls[index]?.[1] === 1000)
      .map(({ value }) => value);
    expect(ids).toHaveLength(1);
    returned.lifecycle.unmount();
    split.lifecycle.unmount();
    badge.lifecycle.unmount();
    owner.lifecycle.unmount();
    for (const id of ids) expect(clearTimer).toHaveBeenCalledWith(id);
  });
});
