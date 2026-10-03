import { describe, expect, it } from "vitest";
import { createFakePluginHost, makeHostResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";
import { historyReadinessSchema, historyRequestSchema } from "./history-contract.js";
const readiness = { state: "not-configured", reason: "not-configured", storage: "unconfigured", collector: "missing", writer: "unconfirmed" } as const;

async function setup(call = async (_args: { hostId: string; method: string; signal?: AbortSignal }): Promise<unknown> => readiness) {
  const host = createFakePluginHost({ pluginId: "codex-quota",
    sdk: { hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) } },
    experimental_callHostRpc: call });
  await plugin(host.bb); return host.harness;
}

describe("bounded selected-host history routing", () => {
  it("rejects malformed inputs and arbitrary public fields", () => {
    for (const input of [{ hostId: "", generation: 0 }, { hostId: "../host", generation: 0 }, { hostId: "h".repeat(129), generation: 0 },
      { hostId: "host_a", generation: -1 }, { hostId: "host_a", generation: 1.5 }, { hostId: "host_a", generation: 1_000_000_001 },
      { hostId: "host_a", generation: 0, filename: "/secret" }]) expect(historyRequestSchema.safeParse(input).success).toBe(false);
    expect(historyReadinessSchema.safeParse({ ...readiness, raw: "credential" }).success).toBe(false);
    expect(historyReadinessSchema.safeParse({ ...readiness, state: "available", reason: "ok" }).success).toBe(false);
  });
  it("requires selection and excludes foreign/offline hosts before a host call", async () => {
    const harness = await setup();
    expect(await harness.behavior.callRpc("historyReadiness", { hostId: "host_a", generation: 0 })).toMatchObject({ reason: "no-selection" });
    const selection = await harness.behavior.callRpc("selectHost", { hostId: "host_a" }) as { generation: number };
    expect(await harness.behavior.callRpc("historyReadiness", { hostId: "host_b", generation: selection.generation })).toMatchObject({ reason: "foreign-host" });
    harness.inspection.sdk.stub("hosts.get", async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId, status: "disconnected" }));
    expect(await harness.behavior.callRpc("historyReadiness", { hostId: "host_a", generation: selection.generation })).toMatchObject({ reason: "host-offline" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
    await harness.lifecycle.dispose();
  });
  it("routes only to the selected host and returns a small scalar result", async () => {
    const harness = await setup(async ({ hostId, method }) => { expect(hostId).toBe("host_a"); expect(method).toBe("historyReadiness"); return readiness; });
    const selection = await harness.behavior.callRpc("selectHost", { hostId: "host_a" }) as { generation: number };
    const result = await harness.behavior.callRpc("historyReadiness", { hostId: "host_a", generation: selection.generation });
    expect(result).toEqual(readiness); expect(JSON.stringify(result).length).toBeLessThan(512);
    await harness.lifecycle.dispose();
  });
  it("aborts and excludes an old host result after a generation change", async () => {
    let finish!: (result: unknown) => void; let started!: () => void;
    const delayed = new Promise<unknown>((resolve) => { finish = resolve; });
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const harness = await setup(async () => { started(); return delayed; });
    const a = await harness.behavior.callRpc("selectHost", { hostId: "host_a" }) as { generation: number };
    const pending = harness.behavior.callRpc("historyReadiness", { hostId: "host_a", generation: a.generation }); await entered;
    await harness.behavior.callRpc("selectHost", { hostId: "host_b" }); finish(readiness);
    expect(await pending).toMatchObject({ reason: "selection-changed" });
    expect(harness.experimental_hostRpcCalls[0]?.signal?.aborted).toBe(true);
    await harness.lifecycle.dispose();
  });
  it("does not return a host result after disposal", async () => {
    let finish!: () => void; let started!: () => void;
    const delayed = new Promise<void>((resolve) => { finish = resolve; });
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const harness = await setup(async () => { started(); await delayed; return readiness; });
    const a = await harness.behavior.callRpc("selectHost", { hostId: "host_a" }) as { generation: number };
    const pending = harness.behavior.callRpc("historyReadiness", { hostId: "host_a", generation: a.generation }); await entered;
    await harness.lifecycle.dispose(); finish();
    expect(await pending).toMatchObject({ reason: "selection-changed" });
    expect(harness.experimental_hostRpcCalls[0]?.signal?.aborted).toBe(true);
  });
  it("cannot return a raw body, error or credential from a failed host", async () => {
    const secret = "private-error-and-credential";
    const harness = await setup(async () => { throw Error(secret); });
    const a = await harness.behavior.callRpc("selectHost", { hostId: "host_a" }) as { generation: number };
    const result = await harness.behavior.callRpc("historyReadiness", { hostId: "host_a", generation: a.generation });
    expect(result).toMatchObject({ reason: "unsupported" });
    expect(JSON.stringify(result) + JSON.stringify(harness.logEntries)).not.toContain(secret);
    await harness.lifecycle.dispose();
  });
  it("rechecks enrollment and connection after receiving readiness", async () => {
    const harness = await setup(async () => {
      harness.inspection.sdk.stub("hosts.get", async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId, status: "disconnected" }));
      return readiness;
    });
    const selected = await harness.behavior.callRpc("selectHost", { hostId: "host_a" }) as { generation: number };
    expect(await harness.behavior.callRpc("historyReadiness", { hostId: "host_a", generation: selected.generation })).toMatchObject({ reason: "host-offline" });
    await harness.lifecycle.dispose();
  });
  it("enforces malformed-input rejection through the registered RPC boundary", async () => {
    const harness = await setup();
    for (const input of [{ hostId: "../host", generation: 0 }, { hostId: "host_a", generation: -1 }, { hostId: "host_a", generation: 0, source: "/private" }]) {
      await expect(harness.behavior.callRpc("historyReadiness", input)).rejects.toThrow();
    }
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
    await harness.lifecycle.dispose();
  });
});
