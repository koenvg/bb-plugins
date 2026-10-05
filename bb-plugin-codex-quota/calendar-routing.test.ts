import { expect, it } from "vitest";
import { createFakePluginHost, makeHostResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";
const query = {
  startDate: "2026-09-01",
  timezone: "UTC",
  group: "workspace",
  scope: { kind: "host" },
};
it("routes only the frozen calendar query without metadata, account, quota or import work", async () => {
  const { bb, harness } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
    },
    experimental_callHostRpc: async () => ({ state: "unavailable", reason: "not-configured" }),
  });
  await plugin(bb);
  const selection = (await harness.behavior.callRpc("selectHost", { hostId: "host_a" })) as {
    generation: number;
  };
  expect(
    await harness.behavior.callRpc("calendarReport", {
      hostId: "host_a",
      generation: selection.generation,
      query,
    }),
  ).toEqual({ state: "unavailable", reason: "not-configured" });
  expect(
    harness.experimental_hostRpcCalls.map((call) => ({ method: call.method, input: call.input })),
  ).toEqual([{ method: "calendarReport", input: query }]);
  expect(harness.inspection.sdk.calls.map((call) => call.path)).toEqual([
    "hosts.get",
    "hosts.get",
    "hosts.get",
  ]);
  await harness.lifecycle.dispose();
});
it.each([
  { startDate: "2026-02-30", timezone: "UTC", group: "workspace", scope: { kind: "host" } },
  {
    startDate: "2026-09-01",
    timezone: "Mars/Invalid",
    group: "workspace",
    scope: { kind: "host" },
  },
  { startDate: "2026-09-01", timezone: "", group: "workspace", scope: { kind: "host" } },
  { startDate: "2026-09-01", timezone: "+02:00", group: "workspace", scope: { kind: "host" } },
  {
    startDate: "2026-09-01",
    timezone: "UTC",
    group: "thread",
    scope: { kind: "workspace", workspace: "/original" },
  },
  {
    startDate: "2026-09-01",
    timezone: "UTC",
    group: "workspace",
    scope: { kind: "workspace", workspace: "relative" },
  },
  {
    startDate: "2026-09-01",
    timezone: "UTC",
    group: "workspace",
    scope: { kind: "host" },
    endDate: "2026-10-02",
  },
])("rejects invalid calendar inputs before dispatch %#", async (query) => {
  const { bb, harness } = createFakePluginHost({ pluginId: "codex-quota" });
  await plugin(bb);
  await expect(
    harness.behavior.callRpc("calendarReport", { hostId: "host_a", generation: 0, query }),
  ).rejects.toThrow();
  expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  await harness.lifecycle.dispose();
});
it.each(["switch", "dispose"])("suppresses a late report after %s", async (action) => {
  let finish!: (value: unknown) => void, entered!: () => void;
  const pendingResult = new Promise((resolve) => {
      finish = resolve;
    }),
    started = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const { bb, harness } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
    },
    experimental_callHostRpc: async () => {
      entered();
      return pendingResult;
    },
  });
  await plugin(bb);
  const selection = (await harness.behavior.callRpc("selectHost", { hostId: "host_a" })) as {
    generation: number;
  };
  const pending = harness.behavior.callRpc("calendarReport", {
    hostId: "host_a",
    generation: selection.generation,
    query,
  });
  await started;
  if (action === "switch") await harness.behavior.callRpc("selectHost", { hostId: "host_b" });
  else await harness.lifecycle.dispose();
  finish({ state: "unavailable", reason: "not-configured" });
  expect(await pending).toEqual({ state: "unavailable", reason: "selection-changed" });
  expect(harness.experimental_hostRpcCalls[0]?.signal?.aborted).toBe(true);
  if (action === "switch") await harness.lifecycle.dispose();
});
it("cancels immediately before dispatch when enrollment preparation is disposed", async () => {
  let finish!: () => void, entered!: () => void;
  const prepared = new Promise<void>((resolve) => {
      finish = resolve;
    }),
    started = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const { bb, harness } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
    },
    experimental_callHostRpc: async () => {
      throw Error("must not dispatch");
    },
  });
  await plugin(bb);
  const selection = (await harness.behavior.callRpc("selectHost", { hostId: "host_a" })) as {
    generation: number;
  };
  harness.inspection.sdk.stub("hosts.get", async () => {
    entered();
    await prepared;
    return makeHostResponse({ id: "host_a" });
  });
  const pending = harness.behavior.callRpc("calendarReport", {
    hostId: "host_a",
    generation: selection.generation,
    query,
  });
  await started;
  await harness.lifecycle.dispose();
  finish();
  expect(await pending).toEqual({ state: "unavailable", reason: "selection-changed" });
  expect(harness.experimental_hostRpcCalls).toHaveLength(0);
});
it("rejects a valid-shaped report for a different frozen query", async () => {
  const { calendarSnapshot } = await import("./calendar-test-support.js");
  const { bb, harness } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
    },
    experimental_callHostRpc: async () =>
      calendarSnapshot({
        startDate: "2026-08-02",
        timezone: "UTC",
        group: "workspace",
        scope: { kind: "host" },
      }),
  });
  await plugin(bb);
  const selected = (await harness.behavior.callRpc("selectHost", { hostId: "host_a" })) as {
    generation: number;
  };
  expect(
    await harness.behavior.callRpc("calendarReport", {
      hostId: "host_a",
      generation: selected.generation,
      query,
    }),
  ).toEqual({ state: "unavailable", reason: "unsupported" });
  await harness.lifecycle.dispose();
});
it("rejects daily values outside the request range even when the echoed query matches", async () => {
  const { calendarSnapshot } = await import("./calendar-test-support.js");
  const input = {
    startDate: "2026-09-01",
    timezone: "UTC",
    group: "workspace" as const,
    scope: { kind: "host" as const },
  };
  const { bb, harness } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
    },
    experimental_callHostRpc: async () => {
      const value = calendarSnapshot(input);
      value.days[0].date = "2026-08-01";
      return value;
    },
  });
  await plugin(bb);
  const selected = (await harness.behavior.callRpc("selectHost", { hostId: "host_a" })) as {
    generation: number;
  };
  expect(
    await harness.behavior.callRpc("calendarReport", {
      hostId: "host_a",
      generation: selected.generation,
      query: input,
    }),
  ).toEqual({ state: "unavailable", reason: "unsupported" });
  await harness.lifecycle.dispose();
});
it("rejects priced entity counts that exceed the corresponding accepted token entities", async () => {
  const { calendarSnapshot } = await import("./calendar-test-support.js");
  const input = {
    startDate: "2026-09-01",
    timezone: "UTC",
    group: "workspace" as const,
    scope: { kind: "host" as const },
  };
  const { bb, harness } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
    },
    experimental_callHostRpc: async () => {
      const value = calendarSnapshot(input);
      value.days[14].activeEntities = 1;
      value.days[14].money = {
        state: "partial",
        capturedCost: 10,
        records: 60,
        pricedRecords: 2,
        pricedEntities: 2,
        reason: "missing-prices",
      };
      return value;
    },
  });
  await plugin(bb);
  const selected = (await harness.behavior.callRpc("selectHost", { hostId: "host_a" })) as {
    generation: number;
  };
  expect(
    await harness.behavior.callRpc("calendarReport", {
      hostId: "host_a",
      generation: selected.generation,
      query: input,
    }),
  ).toEqual({ state: "unavailable", reason: "unsupported" });
  await harness.lifecycle.dispose();
});
it.each([
  { capturedCost: 0 },
  { capturedCost: -1 },
  { capturedCost: Infinity },
  { capturedCost: NaN },
  { capturedCost: Number.MAX_SAFE_INTEGER + 1 },
  { pricedRecords: 61 },
  { pricedEntities: 61 },
  { records: Number.MAX_SAFE_INTEGER + 1 },
  { pricedEntities: 0 },
  { state: "partial" as const },
])("rejects unsafe or inconsistent monetary DTO values %#", async (change) => {
  const { calendarSnapshot } = await import("./calendar-test-support.js");
  const input = {
    startDate: "2026-09-01",
    timezone: "UTC",
    group: "workspace" as const,
    scope: { kind: "host" as const },
  };
  const { bb, harness } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
    },
    experimental_callHostRpc: async () => {
      const value = calendarSnapshot(input);
      value.summary.money = {
        state: "available",
        capturedCost: 10,
        records: 60,
        pricedRecords: 60,
        pricedEntities: 60,
        reason: "ok",
        ...change,
      };
      return value;
    },
  });
  await plugin(bb);
  const selected = (await harness.behavior.callRpc("selectHost", { hostId: "host_a" })) as {
    generation: number;
  };
  expect(
    await harness.behavior.callRpc("calendarReport", {
      hostId: "host_a",
      generation: selected.generation,
      query: input,
    }),
  ).toEqual({ state: "unavailable", reason: "unsupported" });
  await harness.lifecycle.dispose();
});

it.each([
  (v: import("./calendar-contract.js").CalendarSnapshot) => {
    v.comparison!.query.startDate = "2026-08-01";
  },
  (v: import("./calendar-contract.js").CalendarSnapshot) => {
    v.comparison!.query.timezone = "America/New_York";
  },
  (v: import("./calendar-contract.js").CalendarSnapshot) => {
    v.comparison!.query.scope = { kind: "workspace", workspace: "/other" };
  },
  (v: import("./calendar-contract.js").CalendarSnapshot) => {
    v.comparison!.observedAt = "2026-09-01T00:00:00.000Z";
  },
  (v: import("./calendar-contract.js").CalendarSnapshot) => {
    delete v.comparison;
  },
  (v: import("./calendar-contract.js").CalendarSnapshot) => {
    v.comparison!.reasons.tokens = "zero-baseline";
  },
  (v: import("./calendar-contract.js").CalendarSnapshot) => {
    if (v.comparison!.prior.state !== "unavailable")
      v.comparison!.prior.summary.money.pricedEntities = 61;
  },
  (v: import("./calendar-contract.js").CalendarSnapshot) => {
    if (v.comparison!.prior.state !== "unavailable") v.comparison!.prior.coverage.zero = true;
  },
])("rejects incompatible, stale, absent or contradictory prior DTOs %#", async (change) => {
  const { calendarSnapshot } = await import("./calendar-test-support.js");
  const input = {
    startDate: "2026-09-01",
    timezone: "UTC",
    group: "workspace" as const,
    scope: { kind: "host" as const },
    comparison: true,
  };
  const { bb, harness } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
    },
    experimental_callHostRpc: async () => {
      const value = calendarSnapshot(input);
      change(value);
      return value;
    },
  });
  await plugin(bb);
  const selected = (await harness.behavior.callRpc("selectHost", { hostId: "host_a" })) as {
    generation: number;
  };
  expect(
    await harness.behavior.callRpc("calendarReport", {
      hostId: "host_a",
      generation: selected.generation,
      query: input,
    }),
  ).toEqual({ state: "unavailable", reason: "unsupported" });
  await harness.lifecycle.dispose();
});
it("routes a frozen comparison once and cancels it before dispatch after enrollment disposal", async () => {
  let finish!: () => void, entered!: () => void;
  const prepared = new Promise<void>((resolve) => {
      finish = resolve;
    }),
    started = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const { bb, harness } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
    },
    experimental_callHostRpc: async () => {
      throw Error("must not dispatch");
    },
  });
  await plugin(bb);
  const selected = (await harness.behavior.callRpc("selectHost", { hostId: "host_a" })) as {
    generation: number;
  };
  harness.inspection.sdk.stub("hosts.get", async () => {
    entered();
    await prepared;
    return makeHostResponse({ id: "host_a" });
  });
  const pending = harness.behavior.callRpc("calendarReport", {
    hostId: "host_a",
    generation: selected.generation,
    query: { ...query, comparison: true },
  });
  await started;
  await harness.lifecycle.dispose();
  finish();
  expect(await pending).toEqual({ state: "unavailable", reason: "selection-changed" });
  expect(harness.experimental_hostRpcCalls).toHaveLength(0);
});

it("rejects any monetary or token percentage in the conservative contract", async () => {
  const { calendarSnapshot } = await import("./calendar-test-support.js");
  const input = {
    startDate: "2026-09-01",
    timezone: "UTC",
    group: "workspace" as const,
    scope: { kind: "host" as const },
    comparison: true,
  };
  const { bb, harness } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
    },
    experimental_callHostRpc: async () => {
      const value = calendarSnapshot(input);
      return { ...value, comparison: { ...value.comparison, percentage: 5 } };
    },
  });
  await plugin(bb);
  const selected = (await harness.behavior.callRpc("selectHost", { hostId: "host_a" })) as {
    generation: number;
  };
  expect(
    await harness.behavior.callRpc("calendarReport", {
      hostId: "host_a",
      generation: selected.generation,
      query: input,
    }),
  ).toEqual({ state: "unavailable", reason: "unsupported" });
  await harness.lifecycle.dispose();
});

const invalidZeroCoverage = [
  { state: "uncovered" as const },
  { state: "incomplete" as const, backlog: true },
  { pauses: 1 },
  { uncertain: true },
  { omissions: 1 },
  { recoveryGap: true },
  { truncated: true },
  { zero: false },
];
it.each(
  ["day", "prior"].flatMap((location) =>
    invalidZeroCoverage.map((change) => [location, change] as const),
  ),
)("rejects contradictory empty %s inactivity certificates %#", async (location, change) => {
  const { calendarEmptySnapshot } = await import("./calendar-test-support.js");
  const input = {
    startDate: "2026-09-01",
    timezone: "UTC",
    group: "workspace" as const,
    scope: { kind: "host" as const },
    comparison: true,
  };
  const { bb, harness } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
    },
    experimental_callHostRpc: async () => {
      const value = calendarEmptySnapshot(input, "observed-inactivity");
      if (location === "day") value.days[14].coverage = { ...value.days[14].coverage, ...change };
      else if (value.comparison!.prior.state !== "unavailable")
        value.comparison!.prior.coverage = { ...value.comparison!.prior.coverage, ...change };
      return value;
    },
  });
  await plugin(bb);
  const selected = (await harness.behavior.callRpc("selectHost", { hostId: "host_a" })) as {
    generation: number;
  };
  expect(
    await harness.behavior.callRpc("calendarReport", {
      hostId: "host_a",
      generation: selected.generation,
      query: input,
    }),
  ).toEqual({ state: "unavailable", reason: "unsupported" });
  await harness.lifecycle.dispose();
});
