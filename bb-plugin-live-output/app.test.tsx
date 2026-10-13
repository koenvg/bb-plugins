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
    samples: Array.from({ length: 60 }, (_, i) => ({
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
  expect(captured.appOverlays).toEqual([]);
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
      view.getByRole("button", { name: "Smooth · 5 seconds" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(view.getByRole("status").textContent).toBe("Live");
    expect(view.getByLabelText("Current rate").textContent).toBe("10est. tokens/s");
    expect(view.getByText("42")).toBeDefined();
    expect(view.getByText("Main BB thread")).toBeDefined();
    expect(view.getByText("Child BB thread · parent thr_main · hidden · archived")).toBeDefined();
    expect(view.getByText("pi-subagents")).toBeDefined();
    const smoothPath = view.getByRole("img").querySelectorAll("path")[1]!.getAttribute("d");
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
});
