import { act } from "react";
import { loadPluginApp, renderSlot, type RenderedSlot } from "@get-bb/plugin-sdk/testing/app";
import app from "../../app";
import type { OutputSnapshot } from "../../contract";

type Config = { offset: number; revision: boolean; zero: boolean; startedAt: number };
let config: Config = { offset: 0, revision: false, zero: false, startedAt: 1500 };
let release: ((value: OutputSnapshot) => void) | undefined;
let calls = 0;
const data = (): OutputSnapshot => ({
  at: Date.now(),
  startedAt: config.startedAt,
  coverage: "live",
  threadsDiscovered: 42,
  streamingThreads: config.zero ? 0 : 1,
  totalBytes: 800,
  deltas: 2,
  failures: 0,
  backlog: 0,
  capacityLimited: false,
  rawBytesPerSecond: config.zero ? 0 : 80,
  smoothBytesPerSecond: config.zero ? 0 : 40,
  samples: Array.from({ length: 600 }, (_, index) => {
    const second = config.offset + index;
    return {
      second,
      rawBytesPerSecond:
        config.zero || second === 1 ? 0 : second === 300 ? (config.revision ? 160 : 120) : 80,
      smoothBytesPerSecond:
        config.zero || second === 1 ? 0 : second === 300 ? (config.revision ? 80 : 60) : 40,
    };
  }),
  contributors: [
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
});
const captured = await loadPluginApp(app);
let page: RenderedSlot | undefined;
let footer: RenderedSlot | undefined;
let waiting = new URLSearchParams(location.search).has("waiting");
const rpc = () => {
  calls++;
  return waiting
    ? new Promise<OutputSnapshot>((resolve) => {
        release = resolve;
      })
    : data();
};
await act(async () => {
  page = renderSlot(
    captured.navPanels[0]!,
    { subPath: "" },
    { rpc: { snapshot: rpc }, realtimeConnectionState: "connected" },
  );
  footer = renderSlot(
    captured.appOverlays[0]!,
    {},
    { rpc: { snapshot: rpc }, realtimeConnectionState: "connected" },
  );
});
window.outputFixture = {
  async update(patch) {
    config = { ...config, ...patch };
    const previous = calls;
    await act(async () => {
      if (waiting) {
        waiting = false;
        release?.(data());
      } else
        await new Promise<void>((resolve, reject) => {
          const deadline = Date.now() + 3000;
          const check = () => {
            if (calls > previous) resolve();
            else if (Date.now() > deadline) reject(new Error("snapshot did not poll"));
            else setTimeout(check, 20);
          };
          check();
        });
    });
  },
  async connection(state) {
    await page?.behavior.setRealtimeConnectionState(state);
    await footer?.behavior.setRealtimeConnectionState(state);
  },
  async unmount(kind) {
    await act(async () => {
      if (kind !== "footer") {
        page?.lifecycle.unmount();
        page = undefined;
      }
      if (kind !== "page") {
        footer?.lifecycle.unmount();
        footer = undefined;
      }
    });
  },
  facts: () => ({ calls, navigation: page?.inspection.navigateCalls ?? [] }),
};

declare global {
  interface Window {
    outputFixture: {
      update: (patch: Partial<Config>) => Promise<void>;
      connection: (state: "connected" | "reconnecting") => Promise<void>;
      unmount: (kind: "page" | "footer" | "all") => Promise<void>;
      facts: () => { calls: number; navigation: readonly unknown[] };
    };
  }
}
