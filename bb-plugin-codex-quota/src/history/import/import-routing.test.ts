import { expect, it, vi } from "vitest";
import { createFakePluginHost, makeHostResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "../../plugin/server.js";
import { importRequestSchema, importUnavailable } from "./import-contract.js";

const readiness = {
  state: "not-configured",
  reason: "not-configured",
  storage: "unconfigured",
  collector: "missing",
  writer: "unconfirmed",
};
const request = { hostId: "host-a", generation: 1, command: { action: "start" as const } };
async function setup(call: (method: string, input: unknown) => Promise<unknown>) {
  const { bb, harness } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
    },
    experimental_callHostRpc: ({ method, input }) => call(method, input),
  });
  await plugin(bb);
  await harness.behavior.callRpc("selectHost", { hostId: request.hostId });
  return harness;
}
it("strict browser contract rejects filenames and untrusted evidence", () => {
  expect(importRequestSchema.safeParse({ ...request, file: "/secret" }).success).toBe(false);
  expect(importRequestSchema.safeParse({ ...request, knownWorkspaces: ["/secret"] }).success).toBe(
    false,
  );
  expect(
    importRequestSchema.safeParse({
      ...request,
      command: {
        action: "configure",
        configuration: { bbRoot: "../escape", ordinaryRoots: [], workspaces: ["/work"] },
      },
    }).success,
  ).toBe(false);
});
it("rechecks host changes after queued metadata and never dispatches to an old host", async () => {
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const harness = await setup(async (method) => {
    if (method !== "historyReadiness") throw Error("unexpected host dispatch");
    entered();
    await held;
    return readiness;
  });
  const pending = harness.behavior.callRpc("historicalImport", request);
  await started;
  await harness.behavior.callRpc("selectHost", { hostId: "host-b" });
  release();
  expect(await pending).toMatchObject({ reason: "selection-changed" });
  expect(harness.experimental_hostRpcCalls.map((call) => call.method)).toEqual([
    "historyReadiness",
  ]);
  await harness.lifecycle.dispose();
});
it("status never requests scope metadata; configuration passes only selected-host paths", async () => {
  const harness = await setup(async () => importUnavailable("not-configured"));
  const list = vi.fn(async () => [
    { hostId: "host-b", path: "/foreign" },
    { hostId: "host-a", path: "/known" },
  ]);
  harness.inspection.sdk.stub("environments.list", list);
  await harness.behavior.callRpc("historicalImport", { ...request, command: { action: "status" } });
  expect(list).not.toHaveBeenCalled();
  expect(harness.experimental_hostRpcCalls.map((call) => call.method)).toEqual([
    "historicalImport",
  ]);
  await harness.behavior.callRpc("historicalImport", {
    ...request,
    command: {
      action: "configure",
      configuration: { bbRoot: "/source", ordinaryRoots: [], workspaces: ["/known"] },
    },
  });
  expect(harness.experimental_hostRpcCalls.at(-1)?.input).toMatchObject({
    knownWorkspaces: ["/known"],
  });
  await harness.lifecycle.dispose();
});
it("suppresses committed old-host results without describing rollback", async () => {
  const harness = await setup(async () => {
    await harness.behavior.callRpc("selectHost", { hostId: "host-b" });
    return importUnavailable("not-configured");
  });
  expect(
    await harness.behavior.callRpc("historicalImport", {
      ...request,
      command: { action: "cancel" },
    }),
  ).toMatchObject({ reason: "selection-changed" });
  await harness.lifecycle.dispose();
});
