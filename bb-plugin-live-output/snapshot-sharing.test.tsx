// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent } from "@testing-library/react";
import { loadPluginApp, renderSlot, type RenderedSlot } from "@get-bb/plugin-sdk/testing/app";
import app from "./app";
import type { OutputSnapshot } from "./contract";

let slots: RenderedSlot[] = [];
let fixture: HTMLElement;
beforeEach(() => {
  vi.useFakeTimers();
  fixture = document.createElement("div");
  fixture.innerHTML =
    '<div data-footer-item="plugin:live-output/rate"><button data-sidebar="menu-button">Gauge</button></div>';
  document.body.append(fixture);
});
afterEach(() => {
  for (const slot of slots) slot.lifecycle.unmount();
  slots = [];
  fixture.remove();
  vi.useRealTimers();
});
const snapshot = (smoothBytesPerSecond = 40): OutputSnapshot => ({
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
  smoothBytesPerSecond,
  samples: Array.from({ length: 600 }, (_, second) => ({
    second,
    rawBytesPerSecond: 80,
    smoothBytesPerSecond,
  })),
  contributors: [],
});
const flush = async () => {
  await act(async () => {});
};
const tick = async (ms = 1000) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
async function setup(handler: () => OutputSnapshot | Promise<OutputSnapshot>) {
  const captured = await loadPluginApp(app);
  function mount(kind: "page" | "footer") {
    const options = { rpc: { snapshot: handler }, realtimeConnectionState: "connected" as const };
    const slot =
      kind === "page"
        ? renderSlot(captured.navPanels[0]!, { subPath: "" }, options)
        : renderSlot(captured.appOverlays[0]!, {}, options);
    slots.push(slot);
    return slot;
  }
  return mount;
}
function unmount(slot: RenderedSlot) {
  slot.lifecycle.unmount();
  slots = slots.filter((candidate) => candidate !== slot);
}
it("shares one initial request and one poll for the page and attached footer with independent display modes", async () => {
  const handler = vi.fn(() => snapshot());
  const mount = await setup(handler);
  const page = mount("page");
  mount("footer");
  await flush();
  expect(handler).toHaveBeenCalledTimes(1);
  expect(page.getByLabelText("Current rate").textContent).toBe("10est. tokens/s");
  expect(fixture.textContent).toContain("10 tok/s");
  fireEvent.click(page.getByRole("button", { name: "Raw · 1 second" }));
  fireEvent.click(page.getByRole("button", { name: "Bytes/s" }));
  expect(page.getByLabelText("Current rate").textContent).toBe("80bytes/s");
  expect(fixture.textContent).toContain("10 tok/s");
  await tick(1150);
  expect(handler).toHaveBeenCalledTimes(2);
});

it.each(["page", "footer"] as const)(
  "gives late consumers current data, transfers the %s owner's RPC, and stops after the last consumer",
  async (firstKind) => {
    const handler = vi.fn(() => snapshot());
    const mount = await setup(handler);
    const first = mount(firstKind);
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    await tick(700);
    const second = mount(firstKind === "page" ? "footer" : "page");
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    expect(fixture.textContent).toContain("10 tok/s");
    unmount(first);
    await tick(300);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(second.inspection.rpcCalls).toHaveLength(1);
    unmount(second);
    expect(vi.getTimerCount()).toBe(0);
    await tick(20_000);
    expect(handler).toHaveBeenCalledTimes(2);
  },
);
it("shares a pending request and its stale state, then publishes its result to the remaining consumer", async () => {
  let release!: (value: OutputSnapshot) => void;
  const handler = vi.fn(
    () =>
      new Promise<OutputSnapshot>((resolve) => {
        release = resolve;
      }),
  );
  const mount = await setup(handler);
  const page = mount("page");
  mount("footer");
  await flush();
  expect(page.getByRole("status").textContent).toBe("Starting");
  await tick(6000);
  expect(handler).toHaveBeenCalledTimes(1);
  expect(page.getByRole("status").textContent).toBe("Disconnected");
  expect(fixture.textContent).toContain("— tok/s");
  unmount(page);
  await act(async () => {
    release(snapshot());
  });
  expect(fixture.textContent).toContain("10 tok/s");
  await tick();
  expect(handler).toHaveBeenCalledTimes(2);
});
it("shares failures and recovery while preserving per-slot connection state and stale plot data", async () => {
  let fail = false;
  const handler = vi.fn(() => {
    if (fail) throw new Error("offline");
    return snapshot();
  });
  const mount = await setup(handler);
  const page = mount("page");
  let footer = mount("footer");
  await flush();
  const path = page.getByRole("img").querySelector("path")!.getAttribute("d");
  fail = true;
  await tick();
  expect(handler).toHaveBeenCalledTimes(2);
  expect(page.getByRole("status").textContent).toBe("Disconnected");
  expect(page.getByRole("img").querySelector("path")!.getAttribute("d")).toBe(path);
  expect(fixture.textContent).toContain("— tok/s");
  unmount(footer);
  footer = mount("footer");
  await flush();
  expect(handler).toHaveBeenCalledTimes(2);
  expect(fixture.textContent).toContain("— tok/s");
  fail = false;
  await tick();
  expect(page.getByRole("status").textContent).toBe("Live");
  expect(fixture.textContent).toContain("10 tok/s");
  await page.behavior.setRealtimeConnectionState("reconnecting");
  expect(page.getByRole("status").textContent).toBe("Disconnected");
  expect(fixture.textContent).toContain("10 tok/s");
  await footer.behavior.setRealtimeConnectionState("reconnecting");
  expect(fixture.textContent).toContain("— tok/s");
  await page.behavior.setRealtimeConnectionState("connected");
  await footer.behavior.setRealtimeConnectionState("connected");
  expect(page.getByRole("status").textContent).toBe("Live");
  expect(fixture.textContent).toContain("10 tok/s");
});
it("discards old in-flight results and cached data after last-consumer teardown and remount", async () => {
  const releases: ((value: OutputSnapshot) => void)[] = [];
  const handler = vi.fn(
    () =>
      new Promise<OutputSnapshot>((resolve) => {
        releases.push(resolve);
      }),
  );
  const mount = await setup(handler);
  const first = mount("page");
  const footer = mount("footer");
  await flush();
  unmount(first);
  unmount(footer);
  expect(vi.getTimerCount()).toBe(0);
  const next = mount("page");
  await flush();
  expect(handler).toHaveBeenCalledTimes(2);
  expect(next.getByRole("status").textContent).toBe("Starting");
  await act(async () => {
    releases[0]!(snapshot(400));
  });
  expect(next.getByRole("status").textContent).toBe("Starting");
  await act(async () => {
    releases[1]!(snapshot(40));
  });
  expect(next.getByLabelText("Current rate").textContent).toBe("10est. tokens/s");
  unmount(next);
  const fresh = mount("page");
  await flush();
  expect(fresh.getByRole("status").textContent).toBe("Starting");
  expect(fresh.getByLabelText("Current rate").textContent).toBe("—est. tokens/s");
  expect(handler).toHaveBeenCalledTimes(3);
});
it.each(["page", "footer"] as const)(
  "gives a delayed %s remount its own five-second grace period without resetting it for a late consumer",
  async (kind) => {
    vi.setSystemTime(100_000);
    const handler = vi
      .fn<() => OutputSnapshot | Promise<OutputSnapshot>>()
      .mockReturnValueOnce(snapshot())
      .mockReturnValue(new Promise<OutputSnapshot>(() => {}));
    const mount = await setup(handler);
    const first = mount(kind);
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    unmount(first);
    expect(vi.getTimerCount()).toBe(0);
    await tick(60_000);
    expect(handler).toHaveBeenCalledTimes(1);

    const remounted = mount(kind);
    await flush();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(fixture.textContent).not.toContain("10 tok/s");
    await tick(1000);
    const late = mount(kind === "page" ? "footer" : "page");
    await flush();
    const page = kind === "page" ? remounted : late;
    expect(page.getByRole("status").textContent).toBe("Starting");
    expect(fixture.textContent).toContain("— tok/s");
    expect(handler).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    await tick(4000);
    expect(page.getByRole("status").textContent).toBe("Starting");
    await tick(1000);
    expect(page.getByRole("status").textContent).toBe("Disconnected");
    expect(handler).toHaveBeenCalledTimes(2);
  },
);
it("keeps unrelated app registrations and their RPC data isolated", async () => {
  const firstHandler = vi.fn(() => snapshot(400));
  const secondHandler = vi.fn(() => new Promise<OutputSnapshot>(() => {}));
  const firstMount = await setup(firstHandler);
  const first = firstMount("page");
  await flush();
  expect(first.getByLabelText("Current rate").textContent).toBe("100est. tokens/s");
  const secondMount = await setup(secondHandler);
  secondMount("footer");
  await flush();
  expect(secondHandler).toHaveBeenCalledTimes(1);
  expect(fixture.textContent).toContain("— tok/s");
  expect(fixture.textContent).not.toContain("100 tok/s");
  expect(vi.getTimerCount()).toBe(2);
});

it("keeps the page poll alive when the host footer disappears and reuses it when the footer returns", async () => {
  const handler = vi.fn(() => snapshot());
  const mount = await setup(handler);
  const page = mount("page");
  mount("footer");
  await flush();
  const button = fixture.querySelector("button")!;
  await act(async () => {
    button.remove();
  });
  expect(vi.getTimerCount()).toBe(1);
  await tick();
  expect(handler).toHaveBeenCalledTimes(2);
  expect(page.getByRole("status").textContent).toBe("Live");
  await act(async () => {
    fixture.firstElementChild!.append(button);
  });
  expect(handler).toHaveBeenCalledTimes(2);
  expect(fixture.textContent).toContain("10 tok/s");
});
