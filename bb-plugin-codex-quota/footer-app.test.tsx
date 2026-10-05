// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadPluginApp,
  mountPluginContentScripts,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import { footerFixture } from "./footer-fixture.test-support.js";
import { makeHostResponse } from "@get-bb/plugin-sdk/testing";

const app = await loadPluginApp(() => import("./app.js"));
const disposers: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  cleanup();
  for (const dispose of disposers.splice(0).reverse()) await act(dispose);
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
const options = {
  sdk: { hosts: { list: async () => [] } },
  rpc: { selection: async () => ({ hostId: null, generation: 0 }) },
};
function mountRefresh(config: Parameters<typeof renderSlot>[2]) {
  const owner = renderSlot(
    app.appOverlays.find((slot) => slot.id === "quota-refresh")!,
    {},
    config,
  );
  disposers.push(() => owner.lifecycle.unmount());
  return owner;
}
const footerSlot = app.appOverlays.find((slot) => slot.id === "quota-footer")!;
let generation = 0;
const host = makeHostResponse({ id: "host_1", name: "My Mac", status: "connected" });
const fresh = (remainingPercent: number) => ({
  state: "fresh" as const,
  reason: "ok" as const,
  snapshot: {
    observedAt: new Date(Date.now() - 1000).toISOString(),
    plan: "plus" as const,
    bankedResets: 0,
    general: [{ id: "primary", name: "5 hours", remainingPercent, resetAt: null }],
    additional: [],
    bindingWindowId: "primary",
    bindingRemainingPercent: remainingPercent,
  },
});

describe("Codex quota footer integration", () => {
  it("uses the registered battery for branding, footer, and navigation without starting quota work", () => {
    const branding = JSON.parse(readFileSync(`${import.meta.dirname}/package.json`, "utf8")).bb
      .branding;
    expect(branding.icon).toBe("codex-quota-battery");
    expect(app.experimentalSidebarFooterItems[0]?.icon).toBe(branding.icon);
    expect(app.navPanels[0]?.icon).toBe(branding.icon);
    const icon = app.icons.find(({ name }) => name === branding.icon);
    expect(icon).toBeDefined();
    const Battery = icon!.component;
    const timers = vi.spyOn(globalThis, "setInterval");
    const rendered = render(<Battery className="size-4" />);
    expect(rendered.container.querySelector("[data-quota-battery]")?.getAttribute("class")).toBe(
      "size-4",
    );
    expect(timers).not.toHaveBeenCalled();
  });

  it("opens the existing dashboard, coalesces startup activation, and restores navigation on unmount", async () => {
    const { row } = footerFixture();
    const footer = app.experimentalSidebarFooterItems[0];
    expect(footer?.kind).toBe("action");
    if (footer?.kind !== "action") throw new Error("Expected native quota action");
    const scripts = await mountPluginContentScripts(app, { pluginId: "codex-quota" });
    disposers.push(() => scripts.lifecycle.dispose());
    footer.onActivate({ openPluginDetails: vi.fn() });
    footer.onActivate({ openPluginDetails: vi.fn() });
    const overlay = renderSlot(footerSlot, {}, options);
    await waitFor(() => expect(getComputedStyle(row).display).toBe("none"));
    expect(overlay.inspection.navigateCalls).toEqual([{ method: "toPluginPanel", path: "quota" }]);
    act(() => {
      footer.onActivate({ openPluginDetails: vi.fn() });
    });
    expect(overlay.inspection.navigateCalls).toHaveLength(2);
    overlay.lifecycle.unmount();
    expect(getComputedStyle(row).display).not.toBe("none");
    await scripts.lifecycle.dispose();
    footer.onActivate({ openPluginDetails: vi.fn() });
    const next = await mountPluginContentScripts(app, { pluginId: "codex-quota", generation: 2 });
    disposers.push(() => next.lifecycle.dispose());
    const replacement = renderSlot(footerSlot, {}, options);
    await waitFor(() => expect(getComputedStyle(row).display).toBe("none"));
    expect(replacement.inspection.navigateCalls).toEqual([]);
  });

  it.each([0, 72, 100])(
    "shows a remaining percentage of %i with accessible scope before opening the dashboard",
    async (percentage) => {
      const { button, sidebar } = footerFixture();
      const scripts = await mountPluginContentScripts(app, { pluginId: "codex-quota" });
      disposers.push(() => scripts.lifecycle.dispose());
      const selection = { hostId: host.id, generation: ++generation };
      const config = {
        sdk: { hosts: { list: async () => [host] } },
        rpc: { selection: async () => selection, read: async () => fresh(percentage) },
      };
      mountRefresh(config);
      renderSlot(footerSlot, {}, config);
      await waitFor(() =>
        expect(button.querySelector("[data-codex-quota-badge] > [title]")?.textContent).toBe(
          `${percentage}%`,
        ),
      );
      const Battery = app.icons[0]!.component;
      const icon = render(<Battery />);
      expect(
        icon.container.querySelector("[data-battery-fill]")?.getAttribute("data-battery-fill"),
      ).toBe(String(percentage));
      expect(
        within(sidebar).getByRole("button", {
          name: "Codex quota",
          description: new RegExp(`My Mac.*5 hours.*fresh.*${percentage}% remaining.*observed`),
        }),
      ).toBe(button);
      expect(button.querySelector("svg")).toBeTruthy();
    },
  );

  it("shares pending reads and clock ticks across footer and dashboard without view-owned polling", async () => {
    const { button } = footerFixture();
    const badge = () => button.querySelector("[data-codex-quota-badge] > [title]")?.textContent;
    const scripts = await mountPluginContentScripts(app, { pluginId: "codex-quota" });
    disposers.push(() => scripts.lifecycle.dispose());
    const timers = vi.spyOn(globalThis, "setInterval");
    const clearTimer = vi.spyOn(globalThis, "clearInterval");
    const initial = Date.now();
    const result = fresh(72);
    let resolveRead!: (value: ReturnType<typeof fresh>) => void;
    const read = vi.fn(
      () =>
        new Promise<ReturnType<typeof fresh>>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const selection = { hostId: host.id, generation: ++generation };
    const config = {
      sdk: { hosts: { list: async () => [host] } },
      rpc: { selection: async () => selection, read },
    };
    const owner = mountRefresh(config);
    const overlay = renderSlot(footerSlot, {}, config);
    const Battery = app.icons[0]!.component;
    const icon = render(<Battery />);
    const fill = () =>
      icon.container.querySelector("[data-battery-fill]")?.getAttribute("data-battery-fill") ??
      null;
    const page = renderSlot(app.navPanels[0]!, { subPath: "" }, config);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(badge()).not.toMatch(/\d+%/);
    expect(fill()).toBeNull();
    await act(async () => {
      resolveRead(result);
    });
    await waitFor(() => expect(badge()).toBe("72%"));
    expect(fill()).toBe("72");
    expect(page.getByText("72% remaining")).toBeTruthy();
    const clock = vi.spyOn(Date, "now").mockReturnValue(initial + 300_000);
    const ownedTimers = timers.mock.results.filter((_, i) => timers.mock.calls[i]?.[1] === 1000);
    expect(ownedTimers).toHaveLength(1);
    const tick = timers.mock.calls.find(([, delay]) => delay === 1000)![0] as () => void;
    act(tick);
    expect(badge()).toBe("Stale");
    expect(fill()).toBeNull();
    clock.mockReturnValue(initial + 86_400_001);
    act(tick);
    expect(badge()).not.toMatch(/\d+%/);
    expect(read).toHaveBeenCalledTimes(1);
    act(() => {
      fireEvent.focus(window);
    });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(badge()).not.toMatch(/\d+%/);
    await act(async () => {
      resolveRead(fresh(65));
    });
    await waitFor(() => expect(badge()).toBe("65%"));
    expect(fill()).toBe("65");
    expect(page.getByText("65% remaining")).toBeTruthy();
    overlay.lifecycle.unmount();
    page.lifecycle.unmount();
    expect(fill()).toBe("65"); // Views do not own the app lifetime.
    owner.lifecycle.unmount();
    for (const timer of ownedTimers) expect(clearTimer).toHaveBeenCalledWith(timer.value);
    expect(fill()).toBeNull();
    act(() => {
      fireEvent.focus(window);
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("does not publish an old host's delayed result after selecting another host", async () => {
    const { button } = footerFixture();
    const second = makeHostResponse({ id: "host_2", name: "Other Mac", status: "connected" });
    const scripts = await mountPluginContentScripts(app, { pluginId: "codex-quota" });
    disposers.push(() => scripts.lifecycle.dispose());
    let selection = { hostId: host.id, generation: ++generation };
    let resolveOld!: (value: ReturnType<typeof fresh>) => void;
    const read = vi.fn((input: unknown) =>
      (input as { hostId: string }).hostId === host.id
        ? new Promise<ReturnType<typeof fresh>>((resolve) => {
            resolveOld = resolve;
          })
        : fresh(25),
    );
    const config = {
      sdk: { hosts: { list: async () => [host, second] } },
      rpc: {
        selection: async () => selection,
        read,
        selectHost: async (input: unknown) =>
          (selection = { hostId: (input as { hostId: string }).hostId, generation: ++generation }),
      },
    };
    mountRefresh(config);
    renderSlot(footerSlot, {}, config);
    const Battery = app.icons[0]!.component;
    const icon = render(<Battery />);
    const page = renderSlot(app.navPanels[0]!, { subPath: "" }, config);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await act(async () => {
      fireEvent.change(page.getByRole("combobox", { name: "Codex host" }), {
        target: { value: second.id },
      });
    });
    await waitFor(() =>
      expect(button.querySelector("[data-codex-quota-badge] > [title]")?.textContent).toBe("25%"),
    );
    await act(async () => {
      resolveOld(fresh(88));
    });
    expect(button.querySelector("[data-codex-quota-badge] > [title]")?.textContent).toBe("25%");
    expect(
      icon.container.querySelector("[data-battery-fill]")?.getAttribute("data-battery-fill"),
    ).toBe("25");
    expect(page.getByText("25% remaining")).toBeTruthy();
    expect(button.querySelector('[id$="-description"]')?.textContent).toMatch(
      /Other Mac.*25% remaining/,
    );
  });

  it.each([6 * 60_000, 86_400_001])(
    "keeps retained and newly mounted icons neutral after app disposal and %i ms",
    async (elapsed) => {
      footerFixture();
      const scripts = await mountPluginContentScripts(app, { pluginId: "codex-quota" });
      disposers.push(() => scripts.lifecycle.dispose());
      const initial = Date.now();
      const clock = vi.spyOn(Date, "now").mockReturnValue(initial);
      const timers = vi.spyOn(globalThis, "setInterval");
      const clearTimer = vi.spyOn(globalThis, "clearInterval");
      let resolveRead!: (value: ReturnType<typeof fresh>) => void;
      const read = vi.fn(
        () =>
          new Promise<ReturnType<typeof fresh>>((resolve) => {
            resolveRead = resolve;
          }),
      );
      const selection = { hostId: host.id, generation: ++generation };
      const config = {
        sdk: { hosts: { list: async () => [host] } },
        rpc: { selection: async () => selection, read },
      };
      const owner = mountRefresh(config);
      const overlay = renderSlot(footerSlot, {}, config);
      const page = renderSlot(app.navPanels[0]!, { subPath: "" }, config);
      const Battery = app.icons[0]!.component;
      const retained = render(<Battery />);
      const fill = (icon: typeof retained) =>
        icon.container.querySelector("[data-battery-fill]")?.getAttribute("data-battery-fill") ??
        null;
      await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
      await act(async () => {
        resolveRead(fresh(72));
      });
      await waitFor(() => expect(fill(retained)).toBe("72"));
      overlay.lifecycle.unmount();
      page.lifecycle.unmount();
      expect(fill(retained)).toBe("72"); // Closing quota views does not stop background refresh.
      owner.lifecycle.unmount();
      expect(fill(retained)).toBeNull();
      for (const timer of timers.mock.results) expect(clearTimer).toHaveBeenCalledWith(timer.value);
      const previousTimerCount = timers.mock.calls.length;
      clock.mockReturnValue(initial + elapsed);
      expect(fill(retained)).toBeNull();
      const later = render(<Battery />);
      expect(fill(later)).toBeNull();
      act(() => {
        fireEvent.focus(window);
      });
      expect(read).toHaveBeenCalledTimes(1);
      expect(timers).toHaveBeenCalledTimes(previousTimerCount);

      const returning = mountRefresh(config);
      await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
      expect(fill(retained)).toBeNull();
      expect(fill(later)).toBeNull();
      await act(async () => {
        resolveRead(fresh(31));
      });
      await waitFor(() => expect(fill(retained)).toBe("31"));
      expect(fill(later)).toBe("31");
      returning.lifecycle.unmount();
      expect(fill(retained)).toBeNull();
      expect(fill(later)).toBeNull();

      const pending = mountRefresh(config);
      await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
      pending.lifecycle.unmount();
      await act(async () => {
        resolveRead(fresh(99));
      });
      expect(fill(retained)).toBeNull();
      expect(fill(later)).toBeNull();
      for (const timer of timers.mock.results) expect(clearTimer).toHaveBeenCalledWith(timer.value);
    },
  );
});
