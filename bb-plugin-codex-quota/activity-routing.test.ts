import { describe, expect, it } from "vitest";
import { createFakePluginHost, makeHostResponse } from "@get-bb/plugin-sdk/testing";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import { createQuotaHostEntry } from "./host.js";
import plugin from "./server.js";
import { normalizeActivity } from "./activity.js";
const time = Date.UTC(2026, 3, 23, 12);
const snapshot = normalizeActivity({ stats: { lifetime_tokens: 12 } }, time)!;
const fresh = { state: "fresh", reason: "ok", snapshot };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
describe("activity host and server boundaries", () => {
  it("keeps failed activity separate from quota, and cached auth checks remain host-private", async () => {
    const harness = experimental_createHostEntryHarness(createQuotaHostEntry({
      auth: async () => ({ status: "ok", token: "private-token", identity: "private-identity" }), now: () => time,
      read: async () => ({ status: "ok", snapshot: { observedAt: new Date(time).toISOString(), plan: null, general: [], additional: [], bindingWindowId: null, bindingRemainingPercent: null, bankedResets: 0 } }),
      activityRead: async () => { throw new Error("private@example.invalid"); },
    }));
    expect((await harness.experimental_call("quota", {})).state).toBe("fresh");
    const activity = await harness.experimental_call("activity", {});
    expect(activity.snapshot).toBeNull(); expect(activity.reason).toBe("network");
    expect((await harness.experimental_call("quota", {})).state).toBe("fresh");
    expect(JSON.stringify(activity)).not.toContain("private"); await harness.experimental_dispose();
  });
  it("rechecks account before cached and late results", async () => {
    let identity = "a"; let now = time; let calls = 0; const held = deferred<void>(); const started = deferred<void>();
    const harness = experimental_createHostEntryHarness(createQuotaHostEntry({
      auth: async () => ({ status: "ok", token: "private-token", identity }), now: () => now,
      read: async () => ({ status: "service", snapshot: null }),
      activityRead: async () => { if (++calls === 2) { started.resolve(); await held.promise; } return { status: "ok", snapshot }; },
    }));
    expect((await harness.experimental_call("activity", {})).state).toBe("fresh");
    now += 30_000; const pending = harness.experimental_call("activity", { refresh: true }); await started.promise;
    identity = "b"; held.resolve(); expect((await pending).reason).toBe("identity-changed");
    now += 30_000; expect((await harness.experimental_call("activity", {})).state).toBe("fresh");
    await harness.experimental_dispose();
  });
  it("has no sign-in/collector fallback", async () => {
    let called = false;
    const harness = experimental_createHostEntryHarness(createQuotaHostEntry({ auth: async () => ({ status: "auth-required" }),
      read: async () => ({ status: "network", snapshot: null }), activityRead: async () => { called = true; return { status: "ok", snapshot }; } }));
    expect((await harness.experimental_call("activity", {})).reason).toBe("auth-required"); expect(called).toBe(false);
    await harness.experimental_dispose();
  });
  it("rejects invalid/foreign/offline inputs and only routes to the selected enrolled host", async () => {
    let connected = true;
    const { bb, harness } = createFakePluginHost({ pluginId: "codex-quota", sdk: { hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId, status: connected ? "connected" : "disconnected" }) } },
      experimental_callHostRpc: async ({ method }) => { expect(method).toBe("activity"); return fresh; } });
    await plugin(bb);
    expect((await harness.behavior.callRpc("activity", { hostId: "a", generation: 0 }) as any).reason).toBe("no-selection");
    const selected = await harness.behavior.callRpc("selectHost", { hostId: "a" }) as { generation: number };
    expect((await harness.behavior.callRpc("activity", { hostId: "b", generation: selected.generation }) as any).reason).toBe("foreign-host");
    expect(await harness.behavior.callRpc("activity", { hostId: "a", generation: selected.generation })).toEqual(fresh);
    connected = false; expect((await harness.behavior.callRpc("activity", { hostId: "a", generation: selected.generation }) as any).reason).toBe("host-offline");
    await expect(harness.behavior.callRpc("activity", { hostId: "a", generation: selected.generation, arbitrary: true })).rejects.toThrow();
    expect(harness.experimental_hostRpcCalls).toHaveLength(1);
    expect(harness.inspection.sdk.calls.every(call => call.path.startsWith("hosts."))).toBe(true);
    await harness.lifecycle.dispose();
  });
  it("drops old-host output and cancels the RPC on selection change", async () => {
    const started = deferred<void>(); const held = deferred<unknown>();
    const { bb, harness } = createFakePluginHost({ pluginId: "codex-quota", sdk: { hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) } },
      experimental_callHostRpc: async () => { started.resolve(); return held.promise; } });
    await plugin(bb); const selected = await harness.behavior.callRpc("selectHost", { hostId: "a" }) as { generation: number };
    const pending = harness.behavior.callRpc("activity", { hostId: "a", generation: selected.generation }); await started.promise;
    await harness.behavior.callRpc("selectHost", { hostId: "b" }); held.resolve(fresh);
    expect((await pending as any).reason).toBe("selection-changed");
    expect(harness.experimental_hostRpcCalls[0]!.signal!.aborted).toBe(true); await harness.lifecycle.dispose();
  });
  it("rejects extra raw output fields without logs", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "codex-quota", sdk: { hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) } },
      experimental_callHostRpc: async () => ({ ...fresh, snapshot: { ...snapshot, email: "private@example.invalid" } }) });
    await plugin(bb); const selected = await harness.behavior.callRpc("selectHost", { hostId: "a" }) as { generation: number };
    const result = await harness.behavior.callRpc("activity", { hostId: "a", generation: selected.generation });
    expect((result as any).snapshot).toBeNull(); expect(JSON.stringify(result) + JSON.stringify(harness.logEntries)).not.toContain("private");
    await harness.lifecycle.dispose();
  });
  it("disposes the host while an activity read is held and rejects its late result", async () => {
    const started = deferred<void>(); const held = deferred<void>();
    let readSignal: AbortSignal | undefined;
    const harness = experimental_createHostEntryHarness(createQuotaHostEntry({
      auth: async () => ({ status: "ok", token: "private-token", identity: "a" }), now: () => time,
      read: async () => ({ status: "network", snapshot: null }),
      activityRead: async (_token, signal) => { readSignal = signal; started.resolve(); await held.promise; return { status: "ok", snapshot }; },
    }));
    const pending = harness.experimental_call("activity", {}); await started.promise;
    await harness.experimental_dispose();
    expect(readSignal?.aborted).toBe(true);
    expect(await pending).toEqual({ state: "unavailable", reason: "selection-changed", snapshot: null });
    held.resolve(); await Promise.resolve();
    await expect(harness.experimental_call("activity", {})).rejects.toThrow();
  });
  it("disposes the server while a host RPC is held and rejects its late result", async () => {
    const started = deferred<void>(); const held = deferred<unknown>();
    const { bb, harness } = createFakePluginHost({ pluginId: "codex-quota", sdk: { hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) } },
      experimental_callHostRpc: async () => { started.resolve(); return held.promise; } });
    await plugin(bb); const selected = await harness.behavior.callRpc("selectHost", { hostId: "a" }) as { generation: number };
    const pending = harness.behavior.callRpc("activity", { hostId: "a", generation: selected.generation }); await started.promise;
    await harness.lifecycle.dispose();
    expect(harness.experimental_hostRpcCalls[0]!.signal!.aborted).toBe(true);
    expect(await pending).toEqual({ state: "unavailable", reason: "selection-changed", snapshot: null });
    held.resolve(fresh); await Promise.resolve();
    expect(await harness.behavior.callRpc("activity", { hostId: "a", generation: selected.generation })).toMatchObject({ state: "unavailable", snapshot: null });
  });
});
