// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent } from "@testing-library/react";
import { loadPluginApp, renderSlot, type RenderedSlot } from "@get-bb/plugin-sdk/testing/app";
import app from "./app";
import type { OutputSnapshot } from "./contract";

let slot: RenderedSlot | undefined;
afterEach(() => {
  slot?.lifecycle.unmount();
  slot = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function snapshot(overrides: Partial<OutputSnapshot> = {}): OutputSnapshot {
  return {
    at: Date.now(),
    startedAt: Date.now() - 1000,
    coverage: "live",
    threadsDiscovered: 42,
    streamingThreads: 1,
    totalBytes: 800,
    deltas: 2,
    failures: 0,
    backlog: 0,
    capacityLimited: false,
    rawBytesPerSecond: 80,
    smoothBytesPerSecond: 40,
    samples: Array.from({ length: 600 }, (_, i) => ({
      second: i,
      rawBytesPerSecond: 80,
      smoothBytesPerSecond: 40,
    })),
    contributors: [
      {
        id: "thr_main",
        title: "Main work",
        providerId: "pi-subagents",
        parentThreadId: null,
        hidden: false,
        archived: false,
        rawBytesPerSecond: 60,
        smoothBytesPerSecond: 30,
        lastAt: Date.now(),
      },
      {
        id: "thr_child",
        title: "Child work",
        providerId: "codex",
        parentThreadId: "thr_main",
        hidden: true,
        archived: true,
        rawBytesPerSecond: 20,
        smoothBytesPerSecond: 10,
        lastAt: Date.now(),
      },
    ],
    ...overrides,
  };
}
async function mount(handler: () => OutputSnapshot | Promise<OutputSnapshot>) {
  const captured = await loadPluginApp(app);
  expect(captured.navPanels).toHaveLength(1);
  expect(captured.contentScripts).toEqual([]);
  expect(captured.appOverlays).toHaveLength(1);
  slot = renderSlot(
    captured.navPanels[0]!,
    { subPath: "" },
    { rpc: { snapshot: handler }, realtimeConnectionState: "connected" },
  );
  await act(async () => {});
  return slot;
}
async function tick(ms = 1000) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("native Live Output page", () => {
  it("defaults to smoothing and estimates, supports controls and public thread navigation", async () => {
    const view = await mount(() => snapshot());
    expect(
      view.getByRole("button", { name: "Smooth · 30 seconds" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(view.getByRole("status").textContent).toBe("Live");
    expect(view.getByLabelText("Current rate").textContent).toBe("10est. tokens/s");
    expect(view.getByText("42")).toBeDefined();
    expect(view.getByText("Main BB thread")).toBeDefined();
    expect(view.getByText("Child BB thread · parent thr_main · hidden · archived")).toBeDefined();
    expect(view.getByText("pi-subagents")).toBeDefined();
    const smoothPath = view.getByRole("img").querySelectorAll("path")[1]!.getAttribute("d");
    expect(view.getByRole("img").getAttribute("aria-label")).toBe(
      "Observed output over the last ten minutes in est. tokens/s",
    );
    expect(view.getByText("10 minutes ago")).toBeDefined();
    expect(view.getByText("Peak est. tokens/s · last 10m")).toBeDefined();
    expect(smoothPath?.split(" ")).toHaveLength(600);
    expect(smoothPath).toContain("L960,");
    fireEvent.click(view.getByRole("button", { name: "Raw · 1 second" }));
    expect(view.getByLabelText("Current rate").textContent).toBe("20est. tokens/s");
    expect(view.getByRole("img").querySelectorAll("path")[1]!.getAttribute("d")).not.toBe(
      smoothPath,
    );
    fireEvent.click(view.getByRole("button", { name: "Bytes/s" }));
    expect(view.getByLabelText("Current rate").textContent).toBe("80bytes/s");
    fireEvent.click(view.getByRole("button", { name: "Child work" }));
    expect(view.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "thr_child" }]);
    expect(view.getByText(/not billing data/)).toBeDefined();
    expect(view.getByText(/tool-call generation are excluded/)).toBeDefined();
  });

  it("shows the hovered sample's time and rate in the selected mode and unit", async () => {
    const data = snapshot({ startedAt: 0 });
    data.samples[300] = { second: 300, rawBytesPerSecond: 120, smoothBytesPerSecond: 60 };
    const view = await mount(() => data);
    const chart = view.getByRole("img");
    vi.spyOn(chart, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 50,
      width: 1920,
      height: 230,
      right: 2020,
      bottom: 280,
      x: 100,
      y: 50,
      toJSON() {},
    });
    fireEvent.mouseMove(chart, { clientX: 1060 });
    const tooltip = view.getByRole("tooltip");
    expect(tooltip.classList.contains("absolute")).toBe(true);
    expect(tooltip.classList.contains("pointer-events-none")).toBe(true);
    expect(tooltip.parentElement).toBe(chart.parentElement);
    // The plot now fills the SVG width rather than using centered aspect-ratio padding.
    // Sample 300 is 300/599 of 1920px, plus the 12px tooltip offset.
    expect(tooltip.style.left).toBe("974px");
    expect(tooltip.style.maxWidth).toBe("calc(100% - 16px)");
    expect(view.queryByText(/Hover or focus chart/)).toBeNull();
    expect(view.getByRole("tooltip").textContent).toContain("15 est. tokens/s");
    expect(view.getByRole("tooltip").textContent).toContain("30-second average");
    expect(view.getByRole("tooltip").querySelector("time")?.dateTime).toBe(
      "1970-01-01T00:05:00.000Z",
    );
    fireEvent.click(view.getByRole("button", { name: "Raw · 1 second" }));
    expect(view.getByRole("tooltip").textContent).toContain("30 est. tokens/s");
    fireEvent.click(view.getByRole("button", { name: "Bytes/s" }));
    expect(view.getByRole("tooltip").textContent).toContain("120 bytes/s");
    expect(view.getByRole("tooltip").textContent).toContain("Raw 1-second bucket");
    fireEvent.mouseLeave(chart);
    expect(view.queryByRole("tooltip")).toBeNull();
  });

  it("supports keyboard inspection at the edges and keeps the readout while the chart has focus", async () => {
    const view = await mount(() => snapshot({ startedAt: 0 }));
    const chart = view.getByRole("img");
    expect(chart.getAttribute("tabindex")).toBe("0");
    act(() => chart.focus());
    expect(view.getByRole("tooltip").querySelector("time")?.dateTime).toBe(
      "1970-01-01T00:09:59.000Z",
    );
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(view.getByRole("tooltip").querySelector("time")?.dateTime).toBe(
      "1970-01-01T00:09:58.000Z",
    );
    fireEvent.keyDown(chart, { key: "Home" });
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(view.getByRole("tooltip").querySelector("time")?.dateTime).toBe(
      "1970-01-01T00:00:00.000Z",
    );
    fireEvent.keyDown(chart, { key: "End" });
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    fireEvent.mouseLeave(chart);
    expect(view.getByRole("tooltip").querySelector("time")?.dateTime).toBe(
      "1970-01-01T00:09:59.000Z",
    );
    fireEvent.keyDown(chart, { key: "Escape" });
    expect(view.queryByRole("tooltip")).toBeNull();
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(view.getByRole("tooltip")).toBeDefined();
    fireEvent.blur(chart);
    expect(view.queryByRole("tooltip")).toBeNull();
  });

  it("keeps the selected time as snapshots roll, hides stale readings, and expires old points", async () => {
    vi.useFakeTimers();
    let next = snapshot({ startedAt: 0 });
    next.samples[300] = { second: 300, rawBytesPerSecond: 120, smoothBytesPerSecond: 60 };
    const view = await mount(() => ({ ...next, at: Date.now() }));
    const chart = view.getByRole("img");
    vi.spyOn(chart, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 600,
      height: 230,
      right: 600,
      bottom: 230,
      x: 0,
      y: 0,
      toJSON() {},
    });
    fireEvent.mouseMove(chart, { clientX: 300 });
    next = snapshot({
      startedAt: 0,
      samples: next.samples.map((sample) => ({ ...sample, second: sample.second + 1 })),
    });
    next.samples[299] = { second: 300, rawBytesPerSecond: 160, smoothBytesPerSecond: 80 };
    await tick();
    expect(view.getByRole("tooltip").querySelector("time")?.dateTime).toBe(
      "1970-01-01T00:05:00.000Z",
    );
    expect(view.getByRole("tooltip").textContent).toContain("20 est. tokens/s");
    await view.behavior.setRealtimeConnectionState("reconnecting");
    expect(view.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseMove(chart, { clientX: 0 });
    expect(view.queryByRole("tooltip")).toBeNull();
    await view.behavior.setRealtimeConnectionState("connected");
    expect(view.getByRole("tooltip").querySelector("time")?.dateTime).toBe(
      "1970-01-01T00:05:00.000Z",
    );
    next = snapshot({
      startedAt: 0,
      samples: next.samples.map((sample) => ({ ...sample, second: sample.second + 600 })),
    });
    await tick();
    expect(view.queryByRole("tooltip")).toBeNull();
  });

  it("does not report startup padding as measured zero and clamps hover to chart endpoints", async () => {
    const data = snapshot({ startedAt: 1500 });
    const view = await mount(() => data);
    const chart = view.getByRole("img");
    vi.spyOn(chart, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 300,
      height: 230,
      right: 300,
      bottom: 230,
      x: 0,
      y: 0,
      toJSON() {},
    });
    fireEvent.mouseMove(chart, { clientX: -100 });
    expect(view.getByRole("tooltip").textContent).toContain("Before collection started");
    expect(view.getByRole("tooltip").textContent).not.toContain("est. tokens/s");
    fireEvent.mouseMove(chart, { clientX: 300 / 599 });
    expect(view.getByRole("tooltip").textContent).toContain("10 est. tokens/s");
    fireEvent.mouseMove(chart, { clientX: 400 });
    expect(view.getByRole("tooltip").querySelector("time")?.dateTime).toBe(
      "1970-01-01T00:09:59.000Z",
    );
  });

  it("opens keyboard inspection when data arrives after the chart receives focus", async () => {
    vi.useFakeTimers();
    let release!: (value: OutputSnapshot) => void;
    let pending = true;
    const view = await mount(() =>
      pending
        ? new Promise<OutputSnapshot>((resolve) => {
            release = resolve;
          })
        : snapshot({ startedAt: 0 }),
    );
    const chart = view.getByRole("img");
    act(() => chart.focus());
    expect(view.queryByRole("tooltip")).toBeNull();
    await act(async () => {
      pending = false;
      release(snapshot({ startedAt: 0 }));
    });
    expect(view.getByRole("tooltip").querySelector("time")?.dateTime).toBe(
      "1970-01-01T00:09:59.000Z",
    );
    fireEvent.keyDown(chart, { key: "Escape" });
    await tick();
    expect(view.queryByRole("tooltip")).toBeNull();
  });

  it("opens keyboard inspection after reconnect without changing an existing selected time", async () => {
    const view = await mount(() => snapshot({ startedAt: 0 }));
    const chart = view.getByRole("img");
    await view.behavior.setRealtimeConnectionState("reconnecting");
    act(() => chart.focus());
    expect(view.queryByRole("tooltip")).toBeNull();
    await view.behavior.setRealtimeConnectionState("connected");
    expect(view.getByRole("tooltip").querySelector("time")?.dateTime).toBe(
      "1970-01-01T00:09:59.000Z",
    );
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    await view.behavior.setRealtimeConnectionState("reconnecting");
    await view.behavior.setRealtimeConnectionState("connected");
    expect(view.getByRole("tooltip").querySelector("time")?.dateTime).toBe(
      "1970-01-01T00:09:58.000Z",
    );
  });

  it("keeps controls mounted through starting, degraded, idle, disconnect and reconnect", async () => {
    vi.useFakeTimers();
    let next = snapshot({ coverage: "starting", contributors: [] });
    const view = await mount(() => ({ ...next, at: Date.now() }));
    const raw = view.getByRole("button", { name: "Raw · 1 second" });
    expect(view.getByRole("status").textContent).toBe("Starting");
    fireEvent.click(raw);
    next = snapshot({ coverage: "degraded", backlog: 2 });
    await tick();
    expect(view.getByRole("status").textContent).toBe("Degraded");
    expect(view.getByText(/Coverage is incomplete/)).toBeDefined();
    next = snapshot({
      streamingThreads: 0,
      rawBytesPerSecond: 0,
      smoothBytesPerSecond: 0,
      contributors: [],
    });
    await tick();
    expect(view.getByRole("status").textContent).toBe("Idle");
    expect(view.getByLabelText("Current rate").textContent).toBe("0est. tokens/s");
    await view.behavior.setRealtimeConnectionState("reconnecting");
    expect(view.getByRole("status").textContent).toBe("Disconnected");
    expect(view.getByLabelText("Current rate").textContent).toBe("—est. tokens/s");
    await view.behavior.setRealtimeConnectionState("connected");
    next = snapshot();
    await tick();
    expect(view.getByRole("status").textContent).toBe("Live");
    expect(view.getByRole("button", { name: "Raw · 1 second" })).toBe(raw);
    expect(raw.getAttribute("aria-pressed")).toBe("true");
  });

  it("reports RPC failure and stale snapshots, prevents overlapping polls, and cleans up on unmount", async () => {
    vi.useFakeTimers();
    let fail = false;
    let hang = false;
    let release!: (value: OutputSnapshot) => void;
    const view = await mount(() => {
      if (fail) throw new Error("offline");
      if (hang)
        return new Promise((resolve) => {
          release = resolve;
        });
      return snapshot();
    });
    fail = true;
    await tick();
    expect(view.getByRole("status").textContent).toBe("Disconnected");
    fail = false;
    await tick();
    expect(view.getByRole("status").textContent).toBe("Live");
    hang = true;
    await tick(6000);
    expect(view.getByRole("status").textContent).toBe("Disconnected");
    expect(view.inspection.rpcCalls).toHaveLength(4);
    view.lifecycle.unmount();
    slot = undefined;
    await act(async () => {
      release(snapshot());
    });
    await tick(20_000);
    expect(view.inspection.rpcCalls).toHaveLength(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("lets users select controls while the first snapshot is pending", async () => {
    let release!: (value: OutputSnapshot) => void;
    const view = await mount(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    fireEvent.click(view.getByRole("button", { name: "Bytes/s" }));
    fireEvent.click(view.getByRole("button", { name: "Raw · 1 second" }));
    expect(view.getByRole("status").textContent).toBe("Starting");
    await act(async () => {
      release(snapshot());
    });
    expect(view.getByLabelText("Current rate").textContent).toBe("80bytes/s");
  });

  it("reports a hung first snapshot as disconnected after five seconds", async () => {
    vi.useFakeTimers();
    const view = await mount(() => new Promise<OutputSnapshot>(() => {}));
    await tick(6000);
    expect(view.getByRole("status").textContent).toBe("Disconnected");
    expect(view.inspection.rpcCalls).toHaveLength(1);
  });
  it("keeps the floating keyboard tooltip inside a narrow chart after resize", async () => {
    vi.useFakeTimers();
    let resize = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const view = await mount(() => snapshot());
    const chart = view.getByRole("img");
    const geometry = vi.spyOn(chart, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 960,
      height: 230,
    } as DOMRect);
    act(() => resize());
    fireEvent.focus(chart);
    expect(view.getByRole("tooltip").style.left).toBe("712px");
    geometry.mockReturnValue({ left: 0, top: 0, width: 200, height: 230 } as DOMRect);
    act(() => resize());
    expect(view.getByRole("tooltip").style.left).toBe("8px");
    expect(view.getByRole("tooltip").style.maxWidth).toBe("calc(100% - 16px)");
    fireEvent.keyDown(chart, { key: "Home" });
    expect(view.getByRole("tooltip").style.left).toBe("8px");
    slot!.lifecycle.unmount();
    slot = undefined;
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
