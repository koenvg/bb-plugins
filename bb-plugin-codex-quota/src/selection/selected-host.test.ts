import { describe, expect, it } from "vitest";
import { createFakePluginHost, makeHostResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "../plugin/server.js";

const feeds = [
  {
    method: "read",
    extra: {},
    result: { state: "unavailable", reason: "unsupported", snapshot: null },
  },
  {
    method: "activity",
    extra: {},
    result: { state: "unavailable", reason: "unsupported", snapshot: null },
  },
  {
    method: "historyReadiness",
    extra: {},
    result: {
      state: "not-configured",
      reason: "not-configured",
      storage: "unconfigured",
      collector: "missing",
      writer: "unconfirmed",
    },
  },
  {
    method: "collectorControl",
    extra: { action: "pause" },
    result: {
      state: "not-configured",
      reason: "not-configured",
      storage: "unconfigured",
      collector: "missing",
      writer: "unconfirmed",
    },
  },
  {
    method: "calendarReport",
    extra: {
      query: {
        startDate: "2026-09-01",
        timezone: "UTC",
        group: "workspace",
        scope: { kind: "host" },
      },
    },
    result: { state: "unavailable", reason: "not-configured" },
  },
  {
    method: "historicalImport",
    extra: { command: { action: "status" } },
    result: { state: "unavailable", reason: "not-configured" },
  },
];

describe("selected-host RPC lifetime", () => {
  it.each(feeds)(
    "settles $method on disposal even if the host ignores cancellation",
    async ({ method, extra, result }) => {
      let release!: (value: unknown) => void;
      let entered!: () => void;
      const held = new Promise<unknown>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const { bb, harness } = createFakePluginHost({
        pluginId: "codex-quota",
        sdk: {
          hosts: {
            get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }),
          },
        },
        experimental_callHostRpc: async () => {
          entered();
          return held;
        },
      });
      await plugin(bb);
      const selection = (await harness.behavior.callRpc("selectHost", { hostId: "host_a" })) as {
        generation: number;
      };
      const pending = harness.behavior.callRpc(method, {
        hostId: "host_a",
        generation: selection.generation,
        ...extra,
      });
      await started;
      await harness.lifecycle.dispose();
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        const observed = await Promise.race([
          pending,
          new Promise((resolve) => {
            deadline = setTimeout(() => resolve("still waiting for host"), 50);
          }),
        ]);
        expect(observed).toMatchObject({ reason: "selection-changed" });
        expect(harness.experimental_hostRpcCalls[0]?.signal?.aborted).toBe(true);
      } finally {
        clearTimeout(deadline);
        release(result);
        await pending;
      }
    },
  );
});
