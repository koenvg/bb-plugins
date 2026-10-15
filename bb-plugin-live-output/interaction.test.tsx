// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent } from "@testing-library/react";
import { loadPluginApp, renderSlot, type RenderedSlot } from "@get-bb/plugin-sdk/testing/app";
import app from "./app";
import type { OutputSnapshot } from "./contract";
import { readout, queryReadout, move, leave } from "./chart-test-support";

let page: RenderedSlot | undefined;
afterEach(() => {
  page?.lifecycle.unmount();
  page = undefined;
  vi.restoreAllMocks();
});
const snapshot = (): OutputSnapshot => ({
  at: Date.now(),
  startedAt: 0,
  coverage: "live",
  threadsDiscovered: 1,
  streamingThreads: 1,
  totalBytes: 800,
  deltas: 2,
  failures: 0,
  backlog: 0,
  capacityLimited: false,
  rawBytesPerSecond: 80,
  smoothBytesPerSecond: 40,
  samples: Array.from({ length: 600 }, (_, second) => ({
    second,
    rawBytesPerSecond: 80,
    smoothBytesPerSecond: 40,
  })),
  contributors: [],
});
async function mount() {
  const captured = await loadPluginApp(app);
  page = renderSlot(
    captured.navPanels[0]!,
    { subPath: "" },
    {
      rpc: { snapshot },
      realtimeConnectionState: "connected",
    },
  );
  await act(async () => {});
  const chart = page.getByRole("img");
  vi.spyOn(chart, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 960,
    height: 230,
  } as DOMRect);
  return { view: page, chart };
}
it.each(["body", "control", "chart"] as const)(
  "dismisses hover with %s focused without consuming the host Escape",
  async (focusTarget) => {
    const { view, chart } = await mount();
    const target =
      focusTarget === "body"
        ? document.body
        : focusTarget === "control"
          ? view.getByRole("button", { name: "Bytes/s" })
          : chart;
    if (focusTarget !== "body") act(() => target.focus());
    expect(document.activeElement).toBe(target);
    const host = vi.fn();
    window.addEventListener("keydown", host);
    try {
      const escape = () =>
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      const inactiveEscape = escape();
      fireEvent(target, inactiveEscape);
      expect(queryReadout()).toBeNull();
      expect(inactiveEscape.defaultPrevented).toBe(false);

      move(chart, { clientX: (960 * 300) / 599 });
      const tooltip = readout();
      expect(tooltip.querySelector("time")?.dateTime).toBe("1970-01-01T00:05:00.000Z");
      const enter = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      });
      fireEvent(target, enter);
      expect(readout()).toBe(tooltip);
      expect(enter.defaultPrevented).toBe(focusTarget === "chart");

      const activeEscape = escape();
      fireEvent(target, activeEscape);
      expect(queryReadout()).toBeNull();
      expect(activeEscape.defaultPrevented).toBe(false);
      await act(async () => {});
      expect(queryReadout()).toBeNull();
      expect(document.activeElement).toBe(target);

      const repeatedEscape = escape();
      fireEvent(target, repeatedEscape);
      expect(queryReadout()).toBeNull();
      expect(repeatedEscape.defaultPrevented).toBe(false);
      expect(host.mock.calls).toEqual([
        [inactiveEscape],
        [enter],
        [activeEscape],
        [repeatedEscape],
      ]);
    } finally {
      window.removeEventListener("keydown", host);
    }
  },
);
it.each(["Enter", " "])(
  "adopts native %s default prevention only for an inspected chart point",
  async (key) => {
    const { chart } = await mount();
    const host = vi.fn();
    window.addEventListener("keydown", host);
    try {
      act(() => chart.focus());
      const inspected = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      fireEvent(chart, inspected);
      expect(inspected.defaultPrevented).toBe(true);
      expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:09:59.000Z");
      fireEvent.keyDown(document.body, { key: "Escape" });
      const inactive = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      fireEvent(chart, inactive);
      expect(inactive.defaultPrevented).toBe(false);
      expect(queryReadout()).toBeNull();
      expect(host.mock.calls.some(([event]) => event === inspected)).toBe(true);
      expect(host.mock.calls.some(([event]) => event === inactive)).toBe(true);
    } finally {
      window.removeEventListener("keydown", host);
    }
  },
);
it("uses native lower-neighbor midpoint ties without shifting nearby samples", async () => {
  const { chart } = await mount();
  for (const [clientX, expected] of [
    [479.9, "1970-01-01T00:04:59.000Z"],
    [480, "1970-01-01T00:04:59.000Z"],
    [480.1, "1970-01-01T00:05:00.000Z"],
  ] as const) {
    move(chart, { clientX });
    expect(readout().querySelector("time")?.dateTime).toBe(expected);
    expect(readout().textContent).toContain("10 est. tokens/s");
  }
});
it.each(["Enter", " "])(
  "leaves unavailable-chart %s default and host delivery untouched",
  async (key) => {
    const { view, chart } = await mount();
    await view.behavior.setRealtimeConnectionState("reconnecting");
    act(() => chart.focus());
    const host = vi.fn();
    window.addEventListener("keydown", host);
    try {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      fireEvent(chart, event);
      expect(event.defaultPrevented).toBe(false);
      expect(host.mock.calls).toEqual([[event]]);
      expect(queryReadout()).toBeNull();
    } finally {
      window.removeEventListener("keydown", host);
    }
    await view.behavior.setRealtimeConnectionState("connected");
    expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:09:59.000Z");
  },
);
it("limits the outside Escape listener to a visible tooltip and removes it on dismissal, leave and unmount", async () => {
  const add = vi.spyOn(document, "addEventListener");
  const remove = vi.spyOn(document, "removeEventListener");
  const { view, chart } = await mount();
  const keyListeners = () => add.mock.calls.filter(([type]) => type === "keydown");
  expect(keyListeners()).toHaveLength(0);
  move(chart, { clientX: 480 });
  expect(keyListeners()).toHaveLength(1);
  const first = keyListeners()[0]![1];
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(queryReadout()).toBeNull();
  expect(
    remove.mock.calls.some(([type, listener]) => type === "keydown" && listener === first),
  ).toBe(true);
  move(chart, { clientX: 480 });
  const second = keyListeners().at(-1)![1];
  leave(chart);
  expect(
    remove.mock.calls.some(([type, listener]) => type === "keydown" && listener === second),
  ).toBe(true);
  move(chart, { clientX: 480 });
  const last = keyListeners().at(-1)![1];
  view.lifecycle.unmount();
  page = undefined;
  expect(
    remove.mock.calls.some(([type, listener]) => type === "keydown" && listener === last),
  ).toBe(true);
});

it.each([283, 403, 960, 1920])(
  "keeps readable HTML axes and aligned samples at chart width %ipx",
  async (width) => {
    const { view, chart } = await mount();
    vi.mocked(chart.getBoundingClientRect).mockReturnValue({
      left: 0,
      top: 0,
      width,
      height: 230,
    } as DOMRect);
    const timeLabel = view.getByText("Last complete second");
    expect(timeLabel.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    const axes = timeLabel.closest("[data-output-axes]") as HTMLElement;
    expect(axes.style.fontSize).toBe("0.875rem");
    expect(axes.textContent).toContain("10 minutes ago");
    for (const value of ["0", "10", "20"]) {
      expect(
        Array.from(axes.querySelectorAll("span")).some((label) => label.textContent === value),
      ).toBe(true);
    }
    expect(chart.querySelector("text")).toBeNull();
    expect(chart.getAttribute("viewBox")).toBe("0 0 960 240");
    move(chart, { clientX: width / 4 });
    expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:02:30.000Z");
    const marker = chart.querySelector("circle")!;
    expect(Number(marker.getAttribute("cx"))).toBe(240.4);
    expect(Number(marker.getAttribute("cy"))).toBe(110);
    expect(readout().style.pointerEvents).toBe("none");
    expect(readout().getAttribute("role")).toBe("status");
  },
);

it("observes Escape even when a host control stops bubbling, without changing that control's action", async () => {
  const { view, chart } = await mount();
  const control = view.getByRole("button", { name: "Bytes/s" });
  const hostAction = vi.fn((event: KeyboardEvent) => event.stopPropagation());
  control.addEventListener("keydown", hostAction);
  try {
    act(() => control.focus());
    move(chart, { clientX: 480 });
    fireEvent.keyDown(control, { key: "Escape" });
    expect(hostAction).toHaveBeenCalledOnce();
    expect(queryReadout()).toBeNull();
  } finally {
    control.removeEventListener("keydown", hostAction);
  }
});
