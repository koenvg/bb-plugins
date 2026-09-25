// @vitest-environment jsdom
import { act, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeHostResponse } from "@get-bb/plugin-sdk/testing";

const installed = await loadPluginApp(() => import("./app.js"));
const panel = installed.navPanels[0]!;
const host = makeHostResponse({ id: "host_1", name: "My Mac", status: "connected" });
const snapshot = { observedAt: new Date(Date.now() - 1000).toISOString(), plan: "plus" as const, bankedResets: 0,
  general: [{ id: "primary_window", name: "5 hours", remainingPercent: 42, resetAt: null }],
  additional: [], bindingWindowId: "primary_window", bindingRemainingPercent: 42 };

afterEach(() => vi.restoreAllMocks());

describe("BB Codex quota slots", () => {
  it("shares selected host and one request between dashboard and accessory, then cleans timers", async () => {
    expect(panel.path).toBe("quota");
    expect(panel.experimental_sidebarAccessory).toBeTruthy();
    const setTimer = vi.spyOn(window, "setInterval");
    const clearTimer = vi.spyOn(window, "clearInterval");
    let selected: string | null = null;
    let generation = 0;
    let reads = 0;
    const options = {
      sdk: { hosts: { list: async () => [host] } },
      rpc: {
        selection: async () => ({ hostId: selected, generation }),
        selectHost: async (input: unknown) => { const { hostId } = input as { hostId: string | null }; return { hostId: selected = hostId, generation: ++generation }; },
        read: async () => { reads++; return { state: "fresh" as const, reason: "ok" as const, snapshot }; },
      },
    };
    snapshot.observedAt = new Date(Date.now() - 299_000).toISOString();
    const page = renderSlot(panel, { subPath: "" }, options);
    const badge = renderSlot({ component: panel.experimental_sidebarAccessory! }, {}, options);
    await page.findByRole("combobox", { name: /Codex host/i });
    await act(async () => { fireEvent.change(page.getByRole("combobox", { name: /Codex host/i }), { target: { value: "host_1" } }); });
    await waitFor(() => { expect(page.getByText("42% remaining")).toBeTruthy(); });
    await waitFor(() => { expect(badge.getByLabelText(/My Mac.*5 hours.*fresh/i)).toBeTruthy(); });
    expect(badge.container.textContent).toBe("42%");
    expect(reads).toBe(1);
    const future = Date.now() + 3_000;
    page.lifecycle.unmount();
    const returned = renderSlot(panel, { subPath: "" }, options);
    await waitFor(() => expect(returned.getByRole("status").textContent).toMatch(/^Updated /));
    expect(returned.getByText("42% remaining")).toBeTruthy();
    expect(badge.container.textContent).toBe("42%");
    expect(reads).toBe(2); // The second host RPC revalidates identity; the host cache avoids a quota GET.
    vi.spyOn(Date, "now").mockReturnValue(future);
    act(() => { for (const [tick] of setTimer.mock.calls) (tick as () => void)(); });
    expect(returned.getByRole("status").textContent).toMatch(/^Stale · updated /);
    expect(badge.container.textContent).toContain("Stale");
    expect(reads).toBe(2);
    expect(returned.getByRole("link", { name: /Open Codex Usage/i }).getAttribute("href")).toBe("https://chatgpt.com/codex/settings/usage");
    const ids = setTimer.mock.results.map(({ value }) => value);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    returned.lifecycle.unmount();
    badge.lifecycle.unmount();
    for (const id of ids) expect(clearTimer.mock.calls.some(([value]) => value === id)).toBe(true);
  });
});
