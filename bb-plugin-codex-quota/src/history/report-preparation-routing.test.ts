import { afterEach, expect, it, vi } from "vitest";
import {
  createFakePluginHost,
  makeHostResponse,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin from "../plugin/server.js";
import { initializeHistory } from "./storage/history-projection.js";
import {
  initializeIdentityStorage,
  acceptIdentityBatch,
  reconcileIdentity,
  identityView,
} from "./identity/identity-storage.js";
import { openHistoryDatabase } from "./storage/history-storage.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
it("settles a large catalog over bounded RPC batches without management, account or transcript calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "bbp143-routing-"));
  roots.push(root);
  const usage = (await openHistoryDatabase(join(root, "usage.sqlite")))!;
  initializeHistory(usage, "2026-10-01T00:00:00Z");
  initializeIdentityStorage(usage);
  let hardUnknown = false;
  const threads = Array.from({ length: 685 }, (_, n) =>
    makeThreadResponse({ id: `thr_${n}`, environmentId: "env_a", providerId: "pi" }),
  );
  const { bb, harness } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
      environments: { list: async () => [{ id: "env_a", hostId: "host_a" }] },
      threads: {
        list: async ({
          archived,
          offset = 0,
          limit = 50,
        }: { archived?: boolean; offset?: number; limit?: number } = {}) =>
          archived ? [] : threads.slice(offset, offset + limit),
        events: { list: async () => [] },
      },
    },
    experimental_callHostRpc: async ({ method, input }) => {
      expect(method).toBe("reportPreparation");
      const batch = (input as { identities: Parameters<typeof acceptIdentityBatch>[1] }).identities;
      if (!hardUnknown) {
        acceptIdentityBatch(usage, batch);
        reconcileIdentity(usage, new AbortController().signal);
      }
      return {
        state: "available",
        attribution: hardUnknown
          ? { ...identityView(usage), discovery: "unknown" }
          : batch.total === null
            ? { ...identityView(usage), discovery: "partial" }
            : identityView(usage),
        progress: "host",
        ingestionPending: false,
      };
    },
  });
  const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  try {
    plugin(bb);
    const selection = (await harness.behavior.callRpc("selectHost", { hostId: "host_a" })) as {
      generation: number;
    };
    let result: import("./report-preparation-contract.js").Preparation;
    let calls = 0;
    let previousProgress = "";
    do {
      clock.mockReturnValue(1_000_000 + calls * 10_000);
      const before = harness.inspection.sdk.calls.length;
      result = (await harness.behavior.callRpc("reportPreparation", {
        hostId: "host_a",
        generation: selection.generation,
        refresh: calls++ === 0,
      })) as import("./report-preparation-contract.js").Preparation;
      const metadata = harness.inspection.sdk.calls
        .slice(before)
        .filter((call) => call.path !== "hosts.get");
      expect(metadata.length).toBeLessThanOrEqual(4);
      if (result.state === "pending") {
        expect(result.progress).not.toBe(previousProgress);
        previousProgress = result.progress;
      }
    } while (result.state === "pending" && calls < 512);
    expect(result.state).toBe("settled");
    expect(calls).toBeGreaterThan(158);
    expect(identityView(usage).discovery).toBe("complete");
    expect(
      harness.experimental_hostRpcCalls.every((call) => call.method === "reportPreparation"),
    ).toBe(true);
    expect(
      harness.inspection.sdk.calls.every((call) =>
        ["hosts.get", "environments.list", "threads.list", "threads.events.list"].includes(
          call.path,
        ),
      ),
    ).toBe(true);
    hardUnknown = true;
    expect(
      await harness.behavior.callRpc("reportPreparation", {
        hostId: "host_a",
        generation: selection.generation,
        refresh: false,
      }),
    ).toMatchObject({ state: "unavailable", reason: "identity-unavailable" });
    hardUnknown = false;
    clock.mockReturnValue(1_000_000 + calls * 10_000 + 60_000);
    expect(
      await harness.behavior.callRpc("reportPreparation", {
        hostId: "host_a",
        generation: selection.generation,
        refresh: true,
      }),
    ).toMatchObject({ state: "pending" });
    await harness.behavior.callRpc("selectHost", { hostId: "host_b" });
    const dispatched = harness.experimental_hostRpcCalls.length;
    expect(
      await harness.behavior.callRpc("reportPreparation", {
        hostId: "host_a",
        generation: selection.generation,
        refresh: false,
      }),
    ).toMatchObject({ state: "unavailable" });
    expect(harness.experimental_hostRpcCalls.length).toBe(dispatched);
  } finally {
    await harness.lifecycle.dispose();
    clock.mockRestore();
    usage.close();
  }
});

it("does not deliver a late metadata page after the selected host changes", async () => {
  let finish!: (value: unknown[]) => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const { bb, harness } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
      environments: {
        list: async () => {
          started();
          return new Promise((resolve) => {
            finish = resolve;
          });
        },
      },
    },
  });
  try {
    plugin(bb);
    const selection = (await harness.behavior.callRpc("selectHost", { hostId: "host_a" })) as {
      generation: number;
    };
    const held = harness.behavior.callRpc("reportPreparation", {
      hostId: "host_a",
      generation: selection.generation,
      refresh: true,
    });
    await entered;
    await harness.behavior.callRpc("selectHost", { hostId: "host_b" });
    expect(await held).toMatchObject({ state: "unavailable", reason: "selection-changed" });
    finish([]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  } finally {
    await harness.lifecycle.dispose();
  }
});

it("stops an unexpected metadata failure without dispatching host or management work", async () => {
  const { bb, harness } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
      environments: {
        list: async () => {
          throw Error("Unexpected metadata");
        },
      },
    },
  });
  try {
    plugin(bb);
    const selection = (await harness.behavior.callRpc("selectHost", { hostId: "host_a" })) as {
      generation: number;
    };
    expect(
      await harness.behavior.callRpc("reportPreparation", {
        hostId: "host_a",
        generation: selection.generation,
        refresh: true,
      }),
    ).toMatchObject({ state: "unavailable", reason: "discovery-unavailable" });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
    expect(harness.logEntries).toMatchObject([
      { level: "warn", message: "Identity discovery unavailable" },
    ]);
  } finally {
    await harness.lifecycle.dispose();
  }
});

it.each([
  [true, "pending"],
  [false, "settled"],
  [undefined, "unavailable"],
  ["false", "unavailable"],
] as const)(
  "includes ingestion backlog in settlement and rejects incompatible status: %s",
  async (ingestionPending, expected) => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "codex-quota",
      sdk: {
        hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
        environments: { list: async () => [] },
        threads: { list: async () => [], events: { list: async () => [] } },
      },
      experimental_callHostRpc: async () => ({
        state: "available",
        attribution: {
          discovery: "complete",
          backlog: false,
          grades: [],
          threads: [],
          truncated: false,
        },
        progress: "same-host",
        ...(ingestionPending === undefined ? {} : { ingestionPending }),
      }),
    });
    try {
      plugin(bb);
      const selection = (await harness.behavior.callRpc("selectHost", { hostId: "host_a" })) as {
        generation: number;
      };
      let result: import("./report-preparation-contract.js").Preparation | undefined;
      for (let batch = 0; batch < 10; batch++) {
        result = (await harness.behavior.callRpc("reportPreparation", {
          hostId: "host_a",
          generation: selection.generation,
          refresh: batch === 0,
        })) as import("./report-preparation-contract.js").Preparation;
        if (result.state !== "pending") break;
      }
      expect(result?.state).toBe(expected);
      if (expected === "unavailable") expect(result).toMatchObject({ reason: "unsupported" });
      expect(harness.experimental_hostRpcCalls.every((c) => c.method === "reportPreparation")).toBe(
        true,
      );
    } finally {
      await harness.lifecycle.dispose();
    }
  },
);
