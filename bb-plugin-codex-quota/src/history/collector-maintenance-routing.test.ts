import { expect, it } from "vitest";
import {
  createFakePluginHost,
  makeHostResponse,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin from "../plugin/server.js";
import { openHistoryDatabase } from "./storage/history-storage.js";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createCollectorMaintenance } from "./collector-maintenance-routing.js";
import { createMachineCoordinator } from "../machines/machines-server.js";

const readiness = {
  state: "not-configured",
  reason: "not-configured",
  storage: "unconfigured",
  collector: "missing",
  writer: "unconfirmed",
} as const;
async function fixture(
  call: (args: {
    hostId: string;
    method: string;
    input: unknown;
    signal?: AbortSignal;
  }) => Promise<unknown> = async () => readiness,
) {
  const { bb, harness } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      environments: { list: async () => [] },
      threads: { list: async () => [] },
      hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
    },
    experimental_callHostRpc: call,
  });
  const database = (await openHistoryDatabase(":memory:"))!;
  const local = {
    ...bb,
    storage: {
      ...bb.storage,
      database: () => ({
        exec: database.exec,
        prepare: database.prepare,
        transaction: (work: () => unknown) => () => database.transaction(work),
      }),
    },
  } as unknown as BbPluginApi;
  bb.onDispose(() => {
    database.close();
  });
  await plugin(local);
  return Object.assign(harness, { identityDatabase: database });
}
it.each([null, "host_other", "host_target"])(
  "maintains an exact host with selection %s unchanged",
  async (selected) => {
    const h = await fixture();
    if (selected) await h.behavior.callRpc("selectHost", { hostId: selected });
    const before = await h.behavior.callRpc("selection", null);
    expect(
      await h.behavior.callRpc("collectorMaintenance", {
        hostId: "host_target",
        operation: "readiness",
      }),
    ).toEqual({ kind: "checked", readiness });
    expect(await h.behavior.callRpc("selection", null)).toEqual(before);
    expect(h.experimental_hostRpcCalls.map(({ hostId, method }) => ({ hostId, method }))).toEqual([
      { hostId: "host_target", method: "historyReadiness" },
    ]);
    expect(h.experimental_hostRpcCalls[0]?.input).toEqual({
      identities: { generation: 1, hostId: "host_target", offset: 0, total: null, rows: [] },
    });
    expect(JSON.stringify(h.inspection.sdk.calls)).not.toContain('"hosts.list"');
    await h.lifecycle.dispose();
  },
);
it("does not cancel maintenance when dashboard selection changes", async () => {
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const h = await fixture(async () => {
    entered();
    await held;
    return { kind: "refused", reason: "collector-missing", readiness };
  });
  const pending = h.behavior.callRpc("collectorMaintenance", {
    hostId: "host_target",
    operation: "repair-existing",
  });
  await started;
  const selection = await h.behavior.callRpc("selectHost", { hostId: "host_other" });
  release();
  expect(await pending).toEqual({ kind: "refused", reason: "collector-missing", readiness });
  expect(await h.behavior.callRpc("selection", null)).toEqual(selection);
  expect(
    h.experimental_hostRpcCalls.map(({ hostId, method, input }) => ({ hostId, method, input })),
  ).toEqual([
    {
      hostId: "host_target",
      method: "collectorMaintenance",
      input: { operation: "repair-existing" },
    },
  ]);
  await h.lifecycle.dispose();
});
it.each(["mismatch", "ephemeral", "inactive", "offline", "throws"])(
  "refuses unauthorized/offline %s targets before host dispatch",
  async (state) => {
    const h = await fixture();
    h.inspection.sdk.stub("hosts.get", async () => {
      if (state === "throws") throw Error("private-sentinel");
      const host = makeHostResponse({
        id: state === "mismatch" ? "host_wrong" : "host_target",
        status: state === "offline" ? "disconnected" : "connected",
      });
      return {
        ...host,
        ...(state === "ephemeral" ? { type: "ephemeral" } : {}),
        ...(state === "inactive" ? { lifecycle: { phase: "deleted" } } : {}),
      };
    });
    expect(
      await h.behavior.callRpc("collectorMaintenance", {
        hostId: "host_target",
        operation: "repair-existing",
      }),
    ).toEqual({
      kind: "unavailable",
      reason: state === "offline" ? "host-offline" : "host-unapproved",
      hostWork: "not-started",
    });
    expect(h.experimental_hostRpcCalls).toHaveLength(0);
    await h.lifecycle.dispose();
  },
);
it.each([
  { hostId: "../bad", operation: "readiness" },
  { hostId: "host_a", operation: "install" },
  { hostId: "host_a", operation: "repair-existing", approved: true },
  { hostId: "host_a", operation: "readiness", generation: 0 },
  { hostId: "host_a", operation: "readiness", path: "/secret" },
])("rejects hostile input %j", async (input) => {
  const h = await fixture();
  await expect(h.behavior.callRpc("collectorMaintenance", input)).rejects.toThrow();
  expect(h.experimental_hostRpcCalls).toHaveLength(0);
  await h.lifecycle.dispose();
});
it.each([
  null,
  { kind: "checked", readiness },
  { kind: "repaired", preserved: { enabled: true }, readiness },
  { kind: "refused", reason: "collector-missing", readiness, raw: "private-sentinel" },
])("hides hostile repair results %j", async (output) => {
  const h = await fixture(async () => output);
  expect(
    await h.behavior.callRpc("collectorMaintenance", {
      hostId: "host_a",
      operation: "repair-existing",
    }),
  ).toEqual({ kind: "unavailable", reason: "unsupported", hostWork: "may-have-run" });
  await h.lifecycle.dispose();
});
it.each(["revoked", "offline"])("suppresses a late result after %s target loss", async (state) => {
  const h = await fixture(async () => {
    h.inspection.sdk.stub("hosts.get", async () => {
      if (state === "revoked") throw Error("private-sentinel");
      return makeHostResponse({ id: "host_a", status: "disconnected" });
    });
    return { kind: "refused", reason: "collector-missing", readiness };
  });
  expect(
    await h.behavior.callRpc("collectorMaintenance", {
      hostId: "host_a",
      operation: "repair-existing",
    }),
  ).toEqual({
    kind: "unavailable",
    reason: state === "revoked" ? "host-unapproved" : "host-offline",
    hostWork: "may-have-run",
  });
  await h.lifecycle.dispose();
});
it("disposal settles an uncooperative host call and suppresses late publication", async () => {
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const h = await fixture(async () => {
    entered();
    await held;
    return readiness;
  });
  const pending = h.behavior.callRpc("collectorMaintenance", {
    hostId: "host_a",
    operation: "readiness",
  });
  await started;
  await h.lifecycle.dispose();
  try {
    expect(await pending).toEqual({
      kind: "unavailable",
      reason: "canceled",
      hostWork: "may-have-run",
    });
    expect(h.experimental_hostRpcCalls[0]?.signal?.aborted).toBe(true);
  } finally {
    release();
  }
});

it.each(["revoked", "offline", "canceled"])(
  "rechecks %s after pending identity discovery, before host dispatch",
  async (state) => {
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const h = await fixture();
    h.inspection.sdk.stub("threads.list", async () => {
      entered();
      await held;
      return [];
    });
    const before = await h.behavior.callRpc("selection", null);
    const pending = h.behavior.callRpc("collectorMaintenance", {
      hostId: "host_target",
      operation: "readiness",
    });
    await started;
    if (state === "canceled") await h.lifecycle.dispose();
    else
      h.inspection.sdk.stub("hosts.get", async () =>
        makeHostResponse({
          id: state === "revoked" ? "wrong" : "host_target",
          status: state === "offline" ? "disconnected" : "connected",
        }),
      );
    release();
    expect(await pending).toEqual({
      kind: "unavailable",
      reason:
        state === "revoked" ? "host-unapproved" : state === "offline" ? "host-offline" : "canceled",
      hostWork: "not-started",
    });
    expect(h.experimental_hostRpcCalls).toHaveLength(0);
    if (state !== "canceled") expect(await h.behavior.callRpc("selection", null)).toEqual(before);
    await h.lifecycle.dispose();
  },
);

it.each(["readiness", "repair-existing"])(
  "invalidates only the target before and finally for %s",
  async (operation) => {
    const { bb, harness: h } = createFakePluginHost({
      pluginId: "codex-quota",
      sdk: {
        hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
      },
      experimental_callHostRpc: async () => {
        expect(await bb.storage.kv.get("machine-summary-v1/host_a/fixture")).toBeUndefined();
        expect(await bb.storage.kv.get("machine-summary-v1/host_b/fixture")).toEqual({
          kept: true,
        });
        await bb.storage.kv.set("machine-summary-v1/host_a/late", { stale: true });
        return operation === "readiness"
          ? readiness
          : { kind: "refused", reason: "collector-missing", readiness };
      },
    });
    await bb.storage.kv.set("machine-summary-v1/host_a/fixture", { stale: true });
    await bb.storage.kv.set("machine-summary-v1/host_b/fixture", { kept: true });
    await plugin(bb);
    expect(
      await h.behavior.callRpc("collectorMaintenance", { hostId: "host_a", operation }),
    ).toEqual(
      operation === "readiness"
        ? { kind: "checked", readiness }
        : { kind: "refused", reason: "collector-missing", readiness },
    );
    expect(await bb.storage.kv.list("machine-summary-v1/host_a/")).toEqual([]);
    expect(await bb.storage.kv.get("machine-summary-v1/host_b/fixture")).toEqual({ kept: true });
    await h.lifecycle.dispose();
  },
);

it.each(
  ["revoked", "offline"].flatMap((state) =>
    ["checked", "unchanged", "repaired", "refused"].map((kind) => ({ state, kind })),
  ),
)("suppresses $kind after $state during final cache invalidation", async ({ state, kind }) => {
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const preserved = { enabled: false, firstObservedAt: "2026-10-01T00:00:00.000Z", pauseCount: 1 };
  const compatible = {
    state: "available",
    reason: "ok",
    storage: "compatible",
    collector: "compatible-v1",
    writer: "unconfirmed",
    collection: {
      ...preserved,
      backlog: false,
      invalidRecords: 0,
      unconfirmedEvents: 0,
      conflictingEntries: 0,
      workspaces: [],
      truncated: false,
    },
  };
  const operation = kind === "checked" ? "readiness" : "repair-existing";
  const { bb, harness: h } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      environments: { list: async () => [] },
      threads: { list: async () => [] },
      hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
    },
    experimental_callHostRpc: async () => {
      expect(await bb.storage.kv.list("machine-summary-v1/host_a/")).toEqual([]);
      await bb.storage.kv.set("machine-summary-v1/host_a/late", { stale: true });
      if (kind === "checked") return readiness;
      if (kind === "refused") return { kind, reason: "collector-missing", readiness };
      return kind === "unchanged"
        ? { kind, reason: "collector-compatible", readiness: compatible }
        : { kind, preserved, readiness: compatible };
    },
  });
  let invalidations = 0;
  await bb.storage.kv.set("machine-summary-v1/host_a/initial", { stale: true });
  await bb.storage.kv.set("machine-summary-v1/host_b/retained", { kept: true });
  await plugin({
    ...bb,
    storage: {
      ...bb.storage,
      kv: {
        ...bb.storage.kv,
        list: async (prefix?: string) => {
          if (prefix === "machine-summary-v1/host_a/" && ++invalidations === 2) {
            entered();
            await held;
          }
          return bb.storage.kv.list(prefix);
        },
      },
    },
  });
  const pending = h.behavior.callRpc("collectorMaintenance", { hostId: "host_a", operation });
  await started;
  h.inspection.sdk.stub("hosts.get", async () =>
    makeHostResponse({
      id: state === "revoked" ? "host_wrong" : "host_a",
      status: state === "offline" ? "disconnected" : "connected",
    }),
  );
  release();
  try {
    expect(await pending).toEqual({
      kind: "unavailable",
      reason: state === "revoked" ? "host-unapproved" : "host-offline",
      hostWork: "may-have-run",
    });
    expect(invalidations).toBe(2);
    expect(h.experimental_hostRpcCalls.map(({ hostId, method }) => ({ hostId, method }))).toEqual([
      {
        hostId: "host_a",
        method: operation === "readiness" ? "historyReadiness" : "collectorMaintenance",
      },
    ]);
    expect(await bb.storage.kv.list("machine-summary-v1/host_a/")).toEqual([]);
    expect(await bb.storage.kv.get("machine-summary-v1/host_b/retained")).toEqual({ kept: true });
  } finally {
    await h.lifecycle.dispose();
  }
});

it("does not dispatch repair when canceled in the awaited guard continuation gap", async () => {
  const controller = new AbortController();
  let checks = 0,
    repairCalls = 0;
  const maintenance = createCollectorMaintenance({
    get: async (hostId) => {
      if (++checks === 2)
        queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => controller.abort())));
      return makeHostResponse({ id: hostId });
    },
    readiness: async () => readiness,
    repair: async () => {
      repairCalls++;
      return { kind: "refused", reason: "collector-missing", readiness };
    },
    mutate: (_hostId, work) => work(),
  });
  try {
    expect(
      await maintenance.run({ hostId: "host_a", operation: "repair-existing" }, controller.signal),
    ).toEqual({ kind: "unavailable", reason: "canceled", hostWork: "may-have-run" });
    expect(checks).toBe(2);
    expect(repairCalls).toBe(0);
  } finally {
    maintenance.dispose();
  }
});

it("delivers and acknowledges public identity metadata through maintenance readiness", async () => {
  const view = {
    ...readiness,
    attribution: {
      discovery: "complete",
      backlog: false,
      grades: [],
      threads: [],
      truncated: false,
    },
  };
  const h = await fixture(async () => view);
  h.inspection.sdk.stub("environments.list", async () => [
    { id: "env_owned", hostId: "host_target" },
  ]);
  h.inspection.sdk.stub("threads.list", async (args: { archived?: boolean }) =>
    args.archived
      ? []
      : [
          makeThreadResponse({
            id: "thr_owned",
            providerId: "pi",
            environmentId: "env_owned",
            title: "Synthetic thread",
          }),
        ],
  );
  h.inspection.sdk.stub("threads.events.list", async () => [
    {
      id: "identity-owned",
      threadId: "thr_owned",
      scope: { kind: "thread" },
      seq: 1,
      createdAt: 1,
      type: "thread/identity",
      data: { providerThreadId: "provider-owned" },
    },
  ]);
  let delivered: unknown;
  for (let step = 0; step < 40; step++) {
    expect(
      await h.behavior.callRpc("collectorMaintenance", {
        hostId: "host_target",
        operation: "readiness",
      }),
    ).toEqual({ kind: "checked", readiness: view });
    const input = h.experimental_hostRpcCalls.at(-1)?.input as {
      identities?: { total: number | null; rows: unknown[] };
    };
    if (input.identities?.total === 2 && input.identities.rows.length === 2) {
      delivered = input;
      break;
    }
  }
  expect(delivered).toEqual({
    identities: {
      hostId: "host_target",
      generation: 1,
      offset: 0,
      total: 2,
      rows: [
        {
          threadId: "thr_owned",
          providerIdentity: null,
          title: "Synthetic thread",
          state: "available",
        },
        {
          threadId: "thr_owned",
          providerIdentity: "provider-owned",
          title: "Synthetic thread",
          state: "available",
        },
      ],
    },
  });
  expect(
    h.identityDatabase
      .prepare("SELECT host_id,offset,total FROM discovery_receipts WHERE host_id='host_target'")
      .get(),
  ).toEqual({ host_id: "host_target", offset: 2, total: 2 });
  expect(await h.behavior.callRpc("selection", null)).toEqual({ hostId: null, generation: 0 });
  await h.lifecycle.dispose();
});

it.each(["throw", "cancel"])(
  "invalidates the target finally after %s and late host work",
  async (mode) => {
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const { bb, harness: h } = createFakePluginHost({ pluginId: "codex-quota" });
    const unexpected = async (): Promise<never> => {
      throw Error("Unrelated operation");
    };
    const machines = createMachineCoordinator({
      storage: bb.storage.kv,
      get: async () => null,
      list: async () => [],
      observe: unexpected,
      prepare: unexpected,
      report: unexpected,
    });
    const maintenance = createCollectorMaintenance({
      get: async (hostId) => makeHostResponse({ id: hostId }),
      readiness: unexpected,
      repair: async () => {
        expect(await bb.storage.kv.list("machine-summary-v1/host_a/")).toEqual([]);
        entered();
        if (mode === "cancel") await held;
        await bb.storage.kv.set("machine-summary-v1/host_a/late", { stale: true });
        throw Error("private-sentinel");
      },
      mutate: (hostId, work) => machines.mutate(hostId, work),
    });
    await bb.storage.kv.set("machine-summary-v1/host_a/initial", { stale: true });
    await bb.storage.kv.set("machine-summary-v1/host_b/retained", { kept: true });
    const controller = new AbortController();
    const pending = maintenance.run(
      { hostId: "host_a", operation: "repair-existing" },
      controller.signal,
    );
    await started;
    if (mode === "cancel") controller.abort();
    try {
      expect(await pending).toEqual({
        kind: "unavailable",
        reason: mode === "cancel" ? "canceled" : "unsupported",
        hostWork: "may-have-run",
      });
    } finally {
      release();
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(await bb.storage.kv.list("machine-summary-v1/host_a/")).toEqual([]);
    expect(await bb.storage.kv.get("machine-summary-v1/host_b/retained")).toEqual({ kept: true });
    maintenance.dispose();
    machines.dispose();
    await h.lifecycle.dispose();
  },
);
