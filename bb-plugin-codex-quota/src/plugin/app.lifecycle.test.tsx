// @vitest-environment jsdom
import { act, cleanup, configure, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { metadataFixture } from "../machines/app.test-support.js";

const installed = await loadPluginApp(() => import("./app.js"));
afterEach(() => {
  cleanup();
  configure({ reactStrictMode: false });
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function options() {
  const read = vi.fn(async () => ({
    state: "fresh" as const,
    reason: "ok" as const,
    snapshot: {
      observedAt: new Date(Date.now()).toISOString(),
      plan: null,
      bankedResets: null,
      general: [{ id: "primary_window", name: "Primary", remainingPercent: 42, resetAt: null }],
      additional: [],
      bindingWindowId: "primary_window",
      bindingRemainingPercent: 42,
    },
  }));
  return {
    read,
    rpc: {
      selection: async () => ({ hostId: "host_a", generation: 1 }),
      machineAccounts: async () => metadataFixture(["host_a"], await read()),
      read,
    },
  };
}

describe("app-wide quota ownership", () => {
  it("releases timers and exact focus/visibility callbacks during effect replay and reload", async () => {
    vi.useFakeTimers();
    configure({ reactStrictMode: true });
    const focusAdds = vi.spyOn(window, "addEventListener");
    const focusRemoves = vi.spyOn(window, "removeEventListener");
    const visibilityAdds = vi.spyOn(document, "addEventListener");
    const visibilityRemoves = vi.spyOn(document, "removeEventListener");
    const input = options();
    const slot = installed.appOverlays.find((item) => item.id === "quota-refresh")!;
    const first = renderSlot(slot, {}, input);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(input.read).toHaveBeenCalledTimes(1);
    expect(focusAdds.mock.calls.filter(([name]) => name === "focus")).toHaveLength(2);
    first.lifecycle.unmount();
    // SDK 0.5.29's composer-owner guard skips helper unmount after StrictMode replay.
    // RTL cleanup performs the actual React unmount; do not patch SDK internals.
    cleanup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(vi.getTimerCount()).toBe(0);
    const reloaded = renderSlot(slot, {}, input);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(input.read).toHaveBeenCalledTimes(2);
    reloaded.lifecycle.unmount();
    cleanup();
    for (const [name, handler] of focusAdds.mock.calls.filter(([name]) => name === "focus")) {
      expect(focusRemoves).toHaveBeenCalledWith(name, handler);
    }
    for (const [name, handler] of visibilityAdds.mock.calls.filter(
      ([name]) => name === "visibilitychange",
    )) {
      expect(visibilityRemoves).toHaveBeenCalledWith(name, handler);
    }
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(input.read).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps fresh footer text and battery fill during an automatic update, then ages both while the read hangs", async () => {
    vi.useFakeTimers();
    const input = options();
    const config = { ...input, sdk: { hosts: { list: async () => [] } } };
    const owner = renderSlot(
      installed.appOverlays.find((item) => item.id === "quota-refresh")!,
      {},
      config,
    );
    const panel = installed.navPanels[0]!;
    const page = renderSlot(panel, { subPath: "" }, config);
    const badge = renderSlot({ component: panel.experimental_sidebarAccessory! }, {}, config);
    const Battery = installed.icons[0]!.component;
    const battery = render(<Battery />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(badge.container.textContent).toBe("42%");
    const observation = badge.container
      .querySelector("[title]")!
      .getAttribute("title")!
      .split("; observed ")[1];
    let finish!: () => void;
    input.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              state: "fresh",
              reason: "ok",
              snapshot: {
                observedAt: new Date(Date.now()).toISOString(),
                plan: null,
                bankedResets: null,
                general: [
                  { id: "primary_window", name: "Primary", remainingPercent: 42, resetAt: null },
                ],
                additional: [],
                bindingWindowId: "primary_window",
                bindingRemainingPercent: 42,
              },
            });
        }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(input.read).toHaveBeenCalledTimes(2);
    expect(badge.container.textContent).toBe("42%");
    expect(
      battery.container.querySelector("[data-battery-fill]")?.getAttribute("data-battery-fill"),
    ).toBe("42");
    expect(
      within(page.getByRole("region", { name: "Account allowance" })).getByRole("status")
        .textContent,
    ).toMatch(/^Fresh · updating/);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(240_000);
    });
    expect(input.read).toHaveBeenCalledTimes(2);
    expect(badge.container.textContent).toBe("—");
    expect(badge.container.querySelector("[title]")!.getAttribute("title")).toContain(
      `observed ${observation}`,
    );
    expect(battery.container.querySelector("[data-battery-fill]")).toBeNull();
    expect(
      within(page.getByRole("region", { name: "Account allowance" })).getByRole("status")
        .textContent,
    ).toMatch(/^Stale · updating/);
    await act(async () => {
      finish();
    });
    expect(badge.container.textContent).toBe("42%");
    page.lifecycle.unmount();
    badge.lifecycle.unmount();
    battery.unmount();
    owner.lifecycle.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("refreshes with neither dashboard nor accessory mounted and releases its timers on unmount", async () => {
    vi.useFakeTimers();
    const input = options();
    expect(installed.appOverlays.some((slot) => slot.id === "quota-refresh")).toBe(true);
    const owner = renderSlot(
      installed.appOverlays.find((slot) => slot.id === "quota-refresh")!,
      {},
      input,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(owner.container.textContent).toBe("");
    expect(input.read).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(input.read).toHaveBeenCalledTimes(2);
    owner.lifecycle.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(input.read).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("checks focus and visibility deadlines without bypassing backoff or replaying missed intervals", async () => {
    vi.useFakeTimers();
    const input = options();
    input.read.mockRejectedValue(new Error("transport failure"));
    const owner = renderSlot(
      installed.appOverlays.find((slot) => slot.id === "quota-refresh")!,
      {},
      input,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });
    expect(input.read).toHaveBeenCalledTimes(2);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(input.read).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + 600_000);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(input.read).toHaveBeenCalledTimes(3);
    owner.lifecycle.unmount();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(input.read).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
});
