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
import { accountsFixture } from "../machines/machines.test-support.js";

const app = await loadPluginApp(() => import("../plugin/app.js"));
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
const host = makeHostResponse({ id: "host_1", name: "My Mac", status: "connected" });
const fresh = (remainingPercent: number) => ({
  state: "fresh" as const,
  reason: "ok" as const,
  snapshot: {
    observedAt: new Date(Date.now() - 1000).toISOString(),
    plan: "plus" as const,
    bankedResets: 0,
    general: [{ id: "primary_window", name: "5 hours", remainingPercent, resetAt: null }],
    additional: [],
    bindingWindowId: "primary_window",
    bindingRemainingPercent: remainingPercent,
  },
});

function accountResult(quota: ReturnType<typeof fresh>) {
  const data = accountsFixture(Date.now());
  data.machines = [{ id: host.id, name: host.name, status: "connected" }];
  data.accounts[0]!.machines = [host.id];
  data.accounts[0]!.quota = quota;
  return data;
}
describe("Codex quota footer integration", () => {
  it("uses the registered battery for branding, footer, and navigation without starting quota work", () => {
    const branding = JSON.parse(readFileSync(`${import.meta.dirname}/../../package.json`, "utf8"))
      .bb.branding;
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
    "shows %i percent with account scope before opening the dashboard",
    async (percentage) => {
      const { button, sidebar } = footerFixture();
      const scripts = await mountPluginContentScripts(app, { pluginId: "codex-quota" });
      disposers.push(() => scripts.lifecycle.dispose());
      const config = { rpc: { machineAccounts: async () => accountResult(fresh(percentage)) } };
      mountRefresh(config);
      renderSlot(footerSlot, {}, config);
      await waitFor(() =>
        expect(button.querySelector("[data-codex-quota-badge] > [title]")?.textContent).toBe(
          `${percentage}%`,
        ),
      );
      const value = button.querySelector<HTMLElement>("[data-codex-quota-badge] > [title]")!;
      expect(getComputedStyle(value).minWidth).toBe("4ch");
      expect(getComputedStyle(value).width).toBe("auto");
      expect(getComputedStyle(value).whiteSpace).toBe("nowrap");
      expect(
        within(sidebar).getByRole("button", {
          name: "Codex quota",
          description: new RegExp(`My Mac.*fresh.*${percentage}% remaining.*5 hours.*observed`),
        }),
      ).toBe(button);
      await act(async () => {
        button.focus();
      });
      expect(within(document.body).getByRole("tooltip").textContent).toMatch(/My Mac/);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(within(document.body).queryByRole("tooltip")).toBeNull();
    },
  );
  it("shares pending reads and freshness clock across footer, icon, and dashboard", async () => {
    const { button } = footerFixture();
    const scripts = await mountPluginContentScripts(app, { pluginId: "codex-quota" });
    disposers.push(() => scripts.lifecycle.dispose());
    const initial = Date.now(),
      clock = vi.spyOn(Date, "now").mockReturnValue(initial);
    const timers = vi.spyOn(globalThis, "setInterval");
    let resolve!: (value: ReturnType<typeof accountResult>) => void;
    const api = vi.fn(
      () =>
        new Promise<ReturnType<typeof accountResult>>((done) => {
          resolve = done;
        }),
    );
    const config = { rpc: { machineAccounts: api } };
    mountRefresh(config);
    renderSlot(footerSlot, {}, config);
    const Battery = app.icons[0]!.component,
      icon = render(<Battery />);
    renderSlot(app.navPanels[0]!, { subPath: "" }, config);
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolve(accountResult(fresh(72)));
    });
    expect(button.querySelector("[data-codex-quota-badge] > [title]")?.textContent).toBe("72%");
    expect(
      icon.container.querySelector("[data-battery-fill]")?.getAttribute("data-battery-fill"),
    ).toBe("72");
    const clocks = timers.mock.calls.filter((args) => args[1] === 1000);
    expect(clocks).toHaveLength(1);
    clock.mockReturnValue(initial + 6 * 60_000);
    act(() => {
      (clocks[0]![0] as () => void)();
    });
    expect(button.querySelector("[data-codex-quota-badge] > [title]")?.textContent).toBe("—");
    expect(icon.container.querySelector("[data-battery-fill]")).toBeNull();
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("ignores an old owner's late account result after a new owner starts", async () => {
    const { button } = footerFixture();
    const scripts = await mountPluginContentScripts(app, { pluginId: "codex-quota" });
    disposers.push(() => scripts.lifecycle.dispose());
    let resolve!: (value: ReturnType<typeof accountResult>) => void;
    const old = vi.fn(
      () =>
        new Promise<ReturnType<typeof accountResult>>((done) => {
          resolve = done;
        }),
    );
    const owner = mountRefresh({ rpc: { machineAccounts: old } });
    renderSlot(footerSlot, {}, options);
    await waitFor(() => expect(old).toHaveBeenCalledTimes(1));
    owner.lifecycle.unmount();
    mountRefresh({ rpc: { machineAccounts: async () => accountResult(fresh(25)) } });
    await waitFor(() =>
      expect(button.querySelector("[data-codex-quota-badge] > [title]")?.textContent).toBe("25%"),
    );
    await act(async () => {
      resolve(accountResult(fresh(88)));
    });
    expect(button.querySelector("[data-codex-quota-badge] > [title]")?.textContent).toBe("25%");
  });
  it.each([6 * 60_000, 86_400_001])(
    "keeps icons neutral after owner disposal and %i ms",
    async (elapsed) => {
      const initial = Date.now(),
        clock = vi.spyOn(Date, "now").mockReturnValue(initial);
      const owner = mountRefresh({
        rpc: { machineAccounts: async () => accountResult(fresh(72)) },
      });
      const Battery = app.icons[0]!.component,
        icon = render(<Battery />);
      await waitFor(() => expect(icon.container.querySelector("[data-battery-fill]")).toBeTruthy());
      owner.lifecycle.unmount();
      clock.mockReturnValue(initial + elapsed);
      const later = render(<Battery />);
      expect(icon.container.querySelector("[data-battery-fill]")).toBeNull();
      expect(later.container.querySelector("[data-battery-fill]")).toBeNull();
    },
  );
});
