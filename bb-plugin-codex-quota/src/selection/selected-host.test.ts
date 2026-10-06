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
    result: { reason: "not-configured", configuration: null, generation: null },
  },
] as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type Failure =
  | "no-selection"
  | "foreign-host"
  | "selection-changed"
  | "host-offline"
  | "unsupported";
function unavailable(method: string, reason: Failure) {
  if (method === "read" || method === "activity")
    return { state: "unavailable", reason, snapshot: null };
  if (method === "historyReadiness" || method === "collectorControl")
    return {
      state: "unavailable",
      reason,
      storage: "unchecked",
      collector: "unchecked",
      writer: "unconfirmed",
    };
  if (method === "historicalImport") return { reason, configuration: null, generation: null };
  return { state: "unavailable", reason };
}

async function setup(result: unknown) {
  let call = async (): Promise<unknown> => result;
  const { bb, harness } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      hosts: {
        get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }),
      },
    },
    experimental_callHostRpc: () => call(),
  });
  await plugin(bb);
  const selection = (await harness.behavior.callRpc("selectHost", { hostId: "host_a" })) as {
    generation: number;
  };
  return {
    harness,
    generation: selection.generation,
    setCall(handler: () => Promise<unknown>) {
      call = handler;
    },
  };
}

// Test the public RPC boundary for every feed, not the guard's implementation.
describe.each(feeds)("selected-host $method guards", ({ method, extra, result }) => {
  it("requires selection and rejects foreign or old-generation requests before dispatch", async () => {
    const { harness, generation } = await setup(result);
    try {
      expect(
        await harness.behavior.callRpc(method, { hostId: "host_b", generation, ...extra }),
      ).toEqual(unavailable(method, "foreign-host"));
      expect(
        await harness.behavior.callRpc(method, {
          hostId: "host_a",
          generation: generation - 1,
          ...extra,
        }),
      ).toEqual(unavailable(method, "selection-changed"));
      await harness.behavior.callRpc("selectHost", { hostId: null });
      expect(
        await harness.behavior.callRpc(method, { hostId: "host_a", generation, ...extra }),
      ).toEqual(unavailable(method, "no-selection"));
      expect(harness.experimental_hostRpcCalls).toHaveLength(0);
    } finally {
      await harness.lifecycle.dispose();
    }
  });

  it("rejects malformed inputs without host or metadata work", async () => {
    const { harness, generation } = await setup(result);
    try {
      const calls = harness.inspection.sdk.calls.length;
      for (const invalid of [
        { hostId: "" },
        { hostId: "h".repeat(129) },
        { generation: -1 },
        { generation: 1.5 },
        { generation: 1_000_000_001 },
        { source: "/private" },
      ]) {
        await expect(
          harness.behavior.callRpc(method, { hostId: "host_a", generation, ...extra, ...invalid }),
        ).rejects.toThrow();
      }
      expect(harness.experimental_hostRpcCalls).toHaveLength(0);
      expect(harness.inspection.sdk.calls).toHaveLength(calls);
    } finally {
      await harness.lifecycle.dispose();
    }
  });

  it("returns the feed result through only its selected-host endpoint", async () => {
    const { harness, generation } = await setup(result);
    try {
      expect(
        await harness.behavior.callRpc(method, { hostId: "host_a", generation, ...extra }),
      ).toEqual(result);
      expect(harness.experimental_hostRpcCalls).toHaveLength(1);
      expect(harness.experimental_hostRpcCalls[0]).toMatchObject({
        hostId: "host_a",
        method: method === "read" ? "quota" : method,
      });
    } finally {
      await harness.lifecycle.dispose();
    }
  });

  const invalidHosts = [
    { name: "offline", host: makeHostResponse({ id: "host_a", status: "disconnected" }) },
    { name: "foreign enrollment", host: makeHostResponse({ id: "host_b" }) },
    {
      name: "inactive enrollment",
      host: makeHostResponse({
        id: "host_a",
        lifecycle: { ...makeHostResponse().lifecycle, phase: "suspended" },
      }),
    },
  ];
  it.each(
    invalidHosts.flatMap((invalid) => [
      { ...invalid, stage: "before" },
      { ...invalid, stage: "after" },
    ]),
  )("checks $name $stage the host call", async ({ host, stage }) => {
    const { harness, generation } = await setup(result);
    try {
      let checks = 0;
      harness.inspection.sdk.stub("hosts.get", async () => {
        checks++;
        return stage === "before" || checks === 2 ? host : makeHostResponse({ id: "host_a" });
      });
      expect(
        await harness.behavior.callRpc(method, { hostId: "host_a", generation, ...extra }),
      ).toEqual(unavailable(method, "host-offline"));
      expect(harness.experimental_hostRpcCalls).toHaveLength(stage === "before" ? 0 : 1);
    } finally {
      await harness.lifecycle.dispose();
    }
  });

  it.each(["malformed result", "transport failure"])(
    "normalizes %s without private output",
    async (failure) => {
      const secret = "private-credential-sentinel";
      const { harness, generation, setCall } = await setup(result);
      setCall(async () => {
        if (failure === "transport failure") throw Error(secret);
        return { ...result, raw: secret };
      });
      try {
        const observed = await harness.behavior.callRpc(method, {
          hostId: "host_a",
          generation,
          ...extra,
        });
        const reason = method === "read" || method === "activity" ? "host-offline" : "unsupported";
        expect(observed).toEqual(unavailable(method, reason));
        expect(JSON.stringify(observed) + JSON.stringify(harness.logEntries)).not.toContain(secret);
      } finally {
        await harness.lifecycle.dispose();
      }
    },
  );

  const stages = ["enrollment", "host call", "publication"] as const;
  const changes = ["switch", "deselect", "switch back", "dispose"] as const;
  it.each(stages.flatMap((stage) => changes.map((change) => ({ stage, change }))))(
    "settles on $change during $stage even if the adapter ignores cancellation",
    async ({ stage, change }) => {
      const held = deferred<void>();
      const entered = deferred<void>();
      const { harness, generation, setCall } = await setup(result);
      let checks = 0;
      harness.inspection.sdk.stub("hosts.get", async ({ hostId }: { hostId: string }) => {
        if (hostId === "host_a") {
          checks++;
          if (
            (stage === "enrollment" && checks === 1) ||
            (stage === "publication" && checks === 2)
          ) {
            entered.resolve();
            await held.promise;
          }
        }
        return makeHostResponse({ id: hostId });
      });
      setCall(async () => {
        if (stage === "host call") {
          entered.resolve();
          await held.promise;
        }
        return result;
      });
      const pending = harness.behavior.callRpc(method, { hostId: "host_a", generation, ...extra });
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        await entered.promise;
        if (change === "dispose") await harness.lifecycle.dispose();
        else {
          await harness.behavior.callRpc("selectHost", {
            hostId: change === "deselect" ? null : "host_b",
          });
          if (change === "switch back")
            await harness.behavior.callRpc("selectHost", { hostId: "host_a" });
        }
        // Do not release the adapter until the caller settles. A late-result-only
        // assertion would miss a guard that waits forever for an ignored signal.
        expect(
          await Promise.race([
            pending,
            new Promise((resolve) => {
              deadline = setTimeout(() => resolve("still waiting for adapter"), 250);
            }),
          ]),
        ).toEqual(unavailable(method, "selection-changed"));
        expect(harness.experimental_hostRpcCalls).toHaveLength(stage === "enrollment" ? 0 : 1);
        if (stage !== "enrollment")
          expect(harness.experimental_hostRpcCalls[0]?.signal?.aborted).toBe(true);
      } finally {
        clearTimeout(deadline);
        held.resolve();
        await pending;
        await harness.lifecycle.dispose();
      }
      expect(harness.experimental_hostRpcCalls).toHaveLength(stage === "enrollment" ? 0 : 1);
    },
  );
});
