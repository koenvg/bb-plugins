// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { loadPluginApp, renderSlot, type RenderedSlot } from "@get-bb/plugin-sdk/testing/app";
import app from "./app";
import type { OutputSnapshot } from "./contract";

let slot: RenderedSlot | undefined;
let fixture: HTMLElement | undefined;
afterEach(() => {
  slot?.lifecycle.unmount();
  slot = undefined;
  fixture?.remove();
  fixture = undefined;
  vi.useRealTimers();
});
const snapshot = (): OutputSnapshot => ({
  at: Date.now(),
  startedAt: Date.now() - 1000,
  coverage: "live",
  threadsDiscovered: 850,
  streamingThreads: 2,
  totalBytes: 2400,
  deltas: 100,
  failures: 0,
  backlog: 0,
  capacityLimited: false,
  rawBytesPerSecond: 800,
  smoothBytesPerSecond: 60,
  samples: Array.from({ length: 600 }, (_, second) => ({
    second,
    rawBytesPerSecond: 0,
    smoothBytesPerSecond: 0,
  })),
  contributors: [],
});
const flush = async () => {
  await act(async () => {});
};
it("adds the gauge footer beside Codex, displays the thirty-second estimate, opens the page and cleans up", async () => {
  vi.useFakeTimers();
  const captured = await loadPluginApp(app);
  expect(captured.navPanels[0]!.icon).toBe("live-output/gauge");
  expect(captured.experimentalSidebarFooterItems).toHaveLength(1);
  const registration = captured.experimentalSidebarFooterItems[0]!;
  expect(registration).toMatchObject({ id: "rate", kind: "action", icon: "live-output/gauge" });
  fixture = document.createElement("div");
  fixture.innerHTML =
    '<div data-sidebar="footer"><div data-footer-item="plugin:codex-quota/quota"><button data-sidebar="menu-button">Codex</button></div><div data-footer-item="plugin:live-output/rate"><button data-sidebar="menu-button" aria-describedby="host-description">Gauge</button></div></div>';
  document.body.append(fixture);
  let next = snapshot();
  slot = renderSlot(
    captured.appOverlays[0]!,
    {},
    {
      rpc: { snapshot: () => ({ ...next, at: Date.now() }) },
      realtimeConnectionState: "connected",
    },
  );
  await flush();
  const button = fixture.querySelector<HTMLButtonElement>(
    '[data-footer-item="plugin:live-output/rate"] button',
  )!;
  expect(button.textContent).toContain("15 tok/s");
  expect(
    window.getComputedStyle(button.querySelector("[data-live-output-rate]")!).pointerEvents,
  ).toBe("none");
  expect(button.textContent).not.toContain("200 tok/s");
  expect(button.getAttribute("aria-describedby")).toContain("host-description");
  expect(
    fixture.querySelector('[data-footer-item="plugin:codex-quota/quota"] button')!.textContent,
  ).toBe("Codex");
  if (registration.kind !== "action") throw new Error("Expected an action");
  await act(async () => {
    await registration.onActivate({ openPluginDetails() {} });
  });
  expect(slot.inspection.navigateCalls).toEqual([{ method: "toPluginPanel", path: "live-output" }]);
  next = { ...snapshot(), smoothBytesPerSecond: 120 };
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(button.textContent).toContain("30 tok/s");
  next = { ...snapshot(), coverage: "starting" };
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(button.textContent).toContain("— tok/s");
  next = { ...snapshot(), coverage: "degraded", smoothBytesPerSecond: 0 };
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(button.textContent).toContain("0 tok/s");
  expect(button.textContent).toContain("incomplete coverage");
  await slot.behavior.setRealtimeConnectionState("reconnecting");
  expect(button.textContent).toContain("— tok/s");
  slot.lifecycle.unmount();
  slot = undefined;
  expect(button.textContent).toBe("Gauge");
  expect(button.getAttribute("aria-describedby")).toBe("host-description");
  expect(vi.getTimerCount()).toBe(0);
});

it("starts polling only when its footer exists and follows host button replacement", async () => {
  vi.useFakeTimers();
  const captured = await loadPluginApp(app);
  let calls = 0;
  slot = renderSlot(
    captured.appOverlays[0]!,
    {},
    {
      rpc: {
        snapshot: () => {
          calls++;
          return snapshot();
        },
      },
      realtimeConnectionState: "connected",
    },
  );
  await flush();
  expect(calls).toBe(0);
  fixture = document.createElement("div");
  fixture.innerHTML =
    '<div data-sidebar="footer"><div data-footer-item="plugin:live-output/rate"><button data-sidebar="menu-button">Gauge</button></div></div>';
  await act(async () => {
    document.body.append(fixture!);
  });
  expect(fixture.textContent).toContain("15 tok/s");
  expect(calls).toBe(1);
  const old = fixture.querySelector("button")!;
  await act(async () => {
    old.replaceWith(
      Object.assign(document.createElement("button"), { textContent: "Replacement" }),
    );
    fixture!.querySelector("button")!.setAttribute("data-sidebar", "menu-button");
  });
  expect(old.textContent).toBe("Gauge");
  expect(fixture.textContent).toContain("15 tok/s");
  await act(async () => {
    fixture!.remove();
  });
  expect(vi.getTimerCount()).toBe(0);
});
