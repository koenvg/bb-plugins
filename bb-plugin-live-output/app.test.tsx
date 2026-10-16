// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent } from "@testing-library/react";
import { loadPluginApp, renderSlot, type RenderedSlot } from "@get-bb/plugin-sdk/testing/app";
import app from "./app";
import type { OutputSnapshot } from "./contract";
import { readout, queryReadout, move, leave } from "./chart-test-support";

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
    expect(smoothPath?.match(/[ML]/g)).toHaveLength(600);
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
    move(chart, { clientX: 100 + (1920 * 300) / 599 });
    const tooltip = readout();
    expect(tooltip.getAttribute("role")).toBe("status");
    expect(tooltip.style.pointerEvents).toBe("none");
    expect(tooltip.querySelector('[data-bb-plugin="live-output"]')).not.toBeNull();
    expect(view.queryByText(/Hover or focus chart/)).toBeNull();
    expect(readout().textContent).toContain("15 est. tokens/s");
    expect(readout().textContent).toContain("30-second average");
    expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:05:00.000Z");
    fireEvent.click(view.getByRole("button", { name: "Raw · 1 second" }));
    expect(readout().textContent).toContain("30 est. tokens/s");
    fireEvent.click(view.getByRole("button", { name: "Bytes/s" }));
    expect(readout().textContent).toContain("120 bytes/s");
    expect(readout().textContent).toContain("Raw 1-second bucket");
    leave(chart);
    expect(queryReadout()).toBeNull();
  });

  it("supports keyboard inspection at the edges and keeps the readout while the chart has focus", async () => {
    const view = await mount(() => snapshot({ startedAt: 0 }));
    const chart = view.getByRole("img");
    expect(chart.getAttribute("tabindex")).toBe("0");
    act(() => chart.focus());
    expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:09:59.000Z");
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:09:58.000Z");
    fireEvent.keyDown(chart, { key: "Home" });
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:00:00.000Z");
    fireEvent.keyDown(chart, { key: "End" });
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    leave(chart);
    expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:09:59.000Z");
    fireEvent.keyDown(chart, { key: "Escape" });
    expect(queryReadout()).toBeNull();
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(readout()).toBeDefined();
    fireEvent.blur(chart);
    expect(queryReadout()).toBeNull();
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
    move(chart, { clientX: (600 * 300) / 599 });
    next = snapshot({
      startedAt: 0,
      samples: next.samples.map((sample) => ({ ...sample, second: sample.second + 1 })),
    });
    next.samples[299] = { second: 300, rawBytesPerSecond: 160, smoothBytesPerSecond: 80 };
    await tick();
    expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:05:00.000Z");
    expect(readout().textContent).toContain("20 est. tokens/s");
    await view.behavior.setRealtimeConnectionState("reconnecting");
    expect(queryReadout()).toBeNull();
    move(chart, { clientX: 0 });
    expect(queryReadout()).toBeNull();
    await view.behavior.setRealtimeConnectionState("connected");
    expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:05:00.000Z");
    next = snapshot({
      startedAt: 0,
      samples: next.samples.map((sample) => ({ ...sample, second: sample.second + 600 })),
    });
    await tick();
    expect(queryReadout()).toBeNull();
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
    move(chart, { clientX: -100 });
    expect(readout().textContent).toContain("Before collection started");
    expect(readout().textContent).not.toContain("est. tokens/s");
    move(chart, { clientX: 300 / 599 });
    expect(readout().textContent).toContain("10 est. tokens/s");
    move(chart, { clientX: 400 });
    expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:09:59.000Z");
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
    expect(queryReadout()).toBeNull();
    await act(async () => {
      pending = false;
      release(snapshot({ startedAt: 0 }));
    });
    expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:09:59.000Z");
    fireEvent.keyDown(chart, { key: "Escape" });
    await tick();
    expect(queryReadout()).toBeNull();
  });

  it("opens keyboard inspection after reconnect without changing an existing selected time", async () => {
    const view = await mount(() => snapshot({ startedAt: 0 }));
    const chart = view.getByRole("img");
    await view.behavior.setRealtimeConnectionState("reconnecting");
    act(() => chart.focus());
    expect(queryReadout()).toBeNull();
    await view.behavior.setRealtimeConnectionState("connected");
    expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:09:59.000Z");
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    await view.behavior.setRealtimeConnectionState("reconnecting");
    await view.behavior.setRealtimeConnectionState("connected");
    expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:09:58.000Z");
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
  it("keeps native resize ownership and the keyboard readout across a narrow resize, then cleans observers", async () => {
    const callbacks: ResizeObserverCallback[] = [];
    const observers: ResizeObserver[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        disconnect = vi.fn();
        observe = vi.fn();
        unobserve = vi.fn();
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(callback);
          observers.push(this);
        }
      },
    );
    const view = await mount(() => snapshot({ startedAt: 0 }));
    const chart = view.getByRole("img");
    act(() => chart.focus());
    expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:09:59.000Z");
    act(() =>
      callbacks[0]!(
        [
          {
            target: chart.parentElement!,
            contentRect: new DOMRect(0, 0, 200, 240),
            borderBoxSize: [{ inlineSize: 200, blockSize: 240 }],
            contentBoxSize: [{ inlineSize: 200, blockSize: 240 }],
            devicePixelContentBoxSize: [{ inlineSize: 200, blockSize: 240 }],
          },
        ],
        observers[0]!,
      ),
    );
    expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:09:59.000Z");
    fireEvent.keyDown(chart, { key: "Home" });
    expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:00:00.000Z");
    slot!.lifecycle.unmount();
    slot = undefined;
    expect(observers.length).toBeGreaterThanOrEqual(2);
    for (const observer of observers) expect(observer.disconnect).toHaveBeenCalledOnce();
  });
});
