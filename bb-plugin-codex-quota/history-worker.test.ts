import { expect, it } from "vitest";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import { createQuotaHostEntry } from "./host.js";
import { createHostHistory } from "./history-host.js";

it("disposal settles active and queued history calls without opening queued storage", async () => {
  let release!: () => void, entered!: () => void;
  let opens = 0;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const history = createHostHistory({
    storage: async () => {
      opens++;
      entered();
      await held;
      return null;
    },
  });
  const harness = experimental_createHostEntryHarness(
    createQuotaHostEntry({
      history,
      auth: async () => ({ status: "auth-required" }),
      read: async () => ({ status: "service", snapshot: null }),
    }),
  );
  const active = harness.experimental_call("historyReadiness", null);
  await started;
  const queued = harness.experimental_call("calendarReport", {
    startDate: "2026-09-01",
    timezone: "UTC",
    group: "workspace",
    scope: { kind: "host" },
  });
  await harness.experimental_dispose();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const results = await Promise.race([
      Promise.all([active, queued]),
      new Promise((resolve) => {
        deadline = setTimeout(() => resolve("still waiting"), 50);
      }),
    ]);
    expect(results).toEqual([
      expect.objectContaining({ reason: "selection-changed" }),
      { state: "unavailable", reason: "selection-changed" },
    ]);
    expect(opens).toBe(1);
  } finally {
    clearTimeout(deadline);
    release();
    await Promise.all([active, queued]);
  }
});

it("retains an import worker until canceled storage work has actually drained", async () => {
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const history = createHostHistory({
    storage: async () => {
      entered();
      await held;
      return null;
    },
  });
  const harness = experimental_createHostEntryHarness(
    createQuotaHostEntry({
      history,
      auth: async () => ({ status: "auth-required" }),
      read: async () => ({ status: "service", snapshot: null }),
    }),
  );
  const controller = new AbortController();
  const pending = harness.experimental_call(
    "historicalImport",
    {
      hostId: "host_a",
      command: { action: "start" },
      knownWorkspaces: [],
    },
    { signal: controller.signal },
  );
  await started;
  try {
    controller.abort();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(harness.experimental_getRetainedWorkerLeaseCount()).toBe(1);
  } finally {
    release();
    expect(await pending).toMatchObject({ reason: "selection-changed" });
    expect(harness.experimental_getRetainedWorkerLeaseCount()).toBe(0);
    await harness.experimental_dispose();
  }
});

it("caller cancellation does not let the next history operation enter storage early", async () => {
  let release!: () => void, entered!: () => void;
  let opens = 0;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const history = createHostHistory({
    storage: async () => {
      if (++opens === 1) {
        entered();
        await held;
      }
      return null;
    },
  });
  const controller = new AbortController();
  const active = history.read({ dataDir: "/unused", signal: controller.signal });
  await started;
  controller.abort();
  const queued = history.read({ dataDir: "/unused", signal: new AbortController().signal });
  try {
    expect(await active).toMatchObject({ reason: "selection-changed" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(opens).toBe(1);
    release();
    expect(await queued).toMatchObject({ reason: "storage-unavailable" });
    expect(opens).toBe(2);
  } finally {
    release();
    await Promise.all([active, queued]);
    history.dispose();
  }
});
