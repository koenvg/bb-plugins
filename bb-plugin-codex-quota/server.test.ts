import { describe, expect, it } from "vitest";
import { createFakePluginHost, makeHostResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";

describe("Codex Quota scaffold", () => {
  it("only calls the selected enrolled host through the typed host RPC", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "codex-quota",
      sdk: { hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) } },
      experimental_callHostRpc: async ({ hostId, method }) => {
        expect(hostId).toBe("host_selected");
        expect(method).toBe("ping");
        return { reachable: true };
      },
    });
    await plugin(bb);
    expect(await harness.behavior.callRpc("ping", { hostId: "host_selected" })).toEqual({ reachable: true });
    expect(harness.experimental_hostRpcCalls).toHaveLength(1);
    await harness.lifecycle.dispose();
  });

  it("does not call the host when the selected ID cannot be verified", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "codex-quota" });
    await plugin(bb);
    expect(await harness.behavior.callRpc("ping", { hostId: "missing" })).toEqual({ reachable: false });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
    await harness.lifecycle.dispose();
  });

  it("does not publish the one-off feasibility probe as a production RPC", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "codex-quota" });
    await plugin(bb);
    expect(harness.registrations.rpcMethods).not.toContain("probe");
    await harness.lifecycle.dispose();
  });

  it("rejects a late host result after a selection generation change", async () => {
    let complete!: (value: unknown) => void;
    let started!: () => void;
    const inFlight = new Promise<unknown>((done) => { complete = done; });
    const called = new Promise<void>((done) => { started = done; });
    const { bb, harness } = createFakePluginHost({
      pluginId: "codex-quota",
      sdk: { hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) } },
      experimental_callHostRpc: async () => { started(); return inFlight; },
    });
    await plugin(bb);
    const selection = await harness.behavior.callRpc("selectHost", { hostId: "host_a" }) as { generation: number };
    const pending = harness.behavior.callRpc("read", { hostId: "host_a", generation: selection.generation });
    await called;
    await harness.behavior.callRpc("selectHost", { hostId: "host_b" });
    complete({ state: "fresh", reason: "ok", snapshot: {
      observedAt: "2026-04-23T12:00:00.000Z", plan: null, bankedResets: 0,
      general: [{ id: "primary_window", name: "Primary", remainingPercent: 42, resetAt: null }],
      additional: [], bindingWindowId: "primary_window", bindingRemainingPercent: 42,
    } });
    expect(await pending).toEqual({ state: "unavailable", reason: "selection-changed", snapshot: null });
    expect(harness.experimental_hostRpcCalls).toHaveLength(1);
    expect(harness.experimental_hostRpcCalls[0]?.signal?.aborted).toBe(true);
    await harness.lifecycle.dispose();
  });

  it("keeps the newest selection when an older enrollment finishes last", async () => {
    let release!: () => void;
    let started!: () => void;
    const held = new Promise<void>((done) => { release = done; });
    const entered = new Promise<void>((done) => { started = done; });
    const { bb, harness } = createFakePluginHost({
      pluginId: "codex-quota",
      sdk: { hosts: { get: async ({ hostId }: { hostId: string }) => {
        if (hostId === "host_a") { started(); await held; }
        return makeHostResponse({ id: hostId });
      } } },
    });
    await plugin(bb);
    const first = harness.behavior.callRpc("selectHost", { hostId: "host_a" });
    await entered;
    const second = await harness.behavior.callRpc("selectHost", { hostId: "host_b" });
    release();
    await first;
    expect(await harness.behavior.callRpc("selection", null)).toEqual(second);
    await harness.lifecycle.dispose();
  });
  it("requires an explicit enrolled selection, rejects foreign IDs, and reports offline hosts without a host call", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "codex-quota",
      sdk: { hosts: { get: async ({ hostId }: { hostId: string }) =>
        makeHostResponse({ id: hostId, status: "disconnected" }) } },
    });
    await plugin(bb);
    expect(await harness.behavior.callRpc("read", { hostId: "host_a", generation: 0 })).toEqual({
      state: "unavailable", reason: "no-selection", snapshot: null,
    });
    const selection = await harness.behavior.callRpc("selectHost", { hostId: "host_a" }) as { generation: number };
    expect(await harness.behavior.callRpc("read", { hostId: "host_foreign", generation: selection.generation })).toEqual({
      state: "unavailable", reason: "foreign-host", snapshot: null,
    });
    expect(await harness.behavior.callRpc("read", { hostId: "host_a", generation: selection.generation })).toEqual({
      state: "unavailable", reason: "host-offline", snapshot: null,
    });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
    expect(JSON.stringify(harness.inspection.sdk.calls)).not.toContain("usageLimits");
    await harness.lifecycle.dispose();
  });
  it("never forwards an accidental credential or raw upstream response in the quota snapshot", async () => {
    const secret = "sentinel-secret-never-cross-rpc";
    const { bb, harness } = createFakePluginHost({
      pluginId: "codex-quota",
      sdk: { hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) } },
      experimental_callHostRpc: async () => ({ state: "fresh", reason: "ok", snapshot: {
        observedAt: "2026-04-23T12:00:00.000Z", plan: null, bankedResets: 0,
        general: [{ id: "primary_window", name: "Primary", remainingPercent: 42, resetAt: null }],
        additional: [], bindingWindowId: "primary_window", bindingRemainingPercent: 42, rawResponse: secret,
      } }),
    });
    await plugin(bb);
    const selection = await harness.behavior.callRpc("selectHost", { hostId: "host_a" }) as { generation: number };
    const result = await harness.behavior.callRpc("read", { hostId: "host_a", generation: selection.generation });
    expect(result).toEqual({ state: "unavailable", reason: "host-offline", snapshot: null });
    expect(JSON.stringify(result) + JSON.stringify(harness.logEntries)).not.toContain(secret);
    await harness.lifecycle.dispose();
  });
});
