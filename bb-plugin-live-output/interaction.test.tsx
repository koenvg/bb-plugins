// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent } from "@testing-library/react";
import { loadPluginApp, renderSlot, type RenderedSlot } from "@get-bb/plugin-sdk/testing/app";
import app from "./app";
import type { OutputSnapshot } from "./contract";

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
      expect(view.queryByRole("tooltip")).toBeNull();
      expect(inactiveEscape.defaultPrevented).toBe(false);

      fireEvent.mouseMove(chart, { clientX: 480 });
      const tooltip = view.getByRole("tooltip");
      expect(tooltip.querySelector("time")?.dateTime).toBe("1970-01-01T00:05:00.000Z");
      const enter = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      });
      fireEvent(target, enter);
      expect(view.getByRole("tooltip")).toBe(tooltip);
      expect(enter.defaultPrevented).toBe(false);

      const activeEscape = escape();
      fireEvent(target, activeEscape);
      expect(view.queryByRole("tooltip")).toBeNull();
      expect(activeEscape.defaultPrevented).toBe(false);
      await act(async () => {});
      expect(view.queryByRole("tooltip")).toBeNull();
      expect(document.activeElement).toBe(target);

      const repeatedEscape = escape();
      fireEvent(target, repeatedEscape);
      expect(view.queryByRole("tooltip")).toBeNull();
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
it("limits the outside Escape listener to a visible tooltip and removes it on dismissal, leave and unmount", async () => {
  const add = vi.spyOn(document, "addEventListener");
  const remove = vi.spyOn(document, "removeEventListener");
  const { view, chart } = await mount();
  const keyListeners = () => add.mock.calls.filter(([type]) => type === "keydown");
  expect(keyListeners()).toHaveLength(0);
  fireEvent.mouseMove(chart, { clientX: 480 });
  expect(keyListeners()).toHaveLength(1);
  const first = keyListeners()[0]![1];
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(view.queryByRole("tooltip")).toBeNull();
  expect(
    remove.mock.calls.some(([type, listener]) => type === "keydown" && listener === first),
  ).toBe(true);
  fireEvent.mouseMove(chart, { clientX: 480 });
  const second = keyListeners().at(-1)![1];
  fireEvent.mouseLeave(chart);
  expect(
    remove.mock.calls.some(([type, listener]) => type === "keydown" && listener === second),
  ).toBe(true);
  fireEvent.mouseMove(chart, { clientX: 480 });
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
    expect(chart.getAttribute("preserveAspectRatio")).toBe("none");
    fireEvent.mouseMove(chart, { clientX: width / 4 });
    expect(view.getByRole("tooltip").querySelector("time")?.dateTime).toBe(
      "1970-01-01T00:02:30.000Z",
    );
    const marker = chart.querySelector("circle")!;
    expect(Number(marker.getAttribute("cx"))).toBeCloseTo(240.4007, 3);
    expect(Number(marker.getAttribute("cy"))).toBe(110);
    expect(view.getByRole("tooltip").style.top).toBe("122px");
    const tooltipLeft = Number.parseFloat(view.getByRole("tooltip").style.left);
    expect(tooltipLeft).toBeGreaterThanOrEqual(8);
    expect(tooltipLeft + 240).toBeLessThanOrEqual(width - 8);
  },
);

it("observes Escape even when a host control stops bubbling, without changing that control's action", async () => {
  const { view, chart } = await mount();
  const control = view.getByRole("button", { name: "Bytes/s" });
  const hostAction = vi.fn((event: KeyboardEvent) => event.stopPropagation());
  control.addEventListener("keydown", hostAction);
  try {
    act(() => control.focus());
    fireEvent.mouseMove(chart, { clientX: 480 });
    fireEvent.keyDown(control, { key: "Escape" });
    expect(hostAction).toHaveBeenCalledOnce();
    expect(view.queryByRole("tooltip")).toBeNull();
  } finally {
    control.removeEventListener("keydown", hostAction);
  }
});
