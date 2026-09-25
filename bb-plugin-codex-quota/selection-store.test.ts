import { describe, expect, it } from "vitest";
import { QuotaSelectionStore, type QuotaApi } from "./selection-store.js";
import type { QuotaStatus } from "./contract.js";

const observedAt = new Date(Date.now() - 1000).toISOString();
const view: QuotaStatus = { state: "fresh", reason: "ok", snapshot: {
  observedAt, plan: null, bankedResets: 2,
  general: [{ id: "primary_window", name: "Primary", remainingPercent: 30, resetAt: null }],
  additional: [], bindingWindowId: "primary_window", bindingRemainingPercent: 30,
} };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("shared badge/dashboard selection", () => {
  it("coalesces simultaneous refresh and never publishes a late result after a host change", async () => {
    const store = new QuotaSelectionStore();
    const pending = deferred<QuotaStatus>();
    let reads = 0;
    const api: QuotaApi = {
      selection: async () => ({ hostId: "host_a", generation: 1 }),
      selectHost: async ({ hostId }) => ({ hostId, generation: 2 }),
      read: async ({ hostId }) => { reads++; return hostId === "host_a" ? pending.promise : view; },
    };
    await store.connect(api);
    const badge = store.refresh(api);
    const dashboard = store.refresh(api);
    expect(reads).toBe(1);
    await store.selectHost(api, "host_b");
    expect(store.getSnapshot().selection.hostId).toBe("host_b");
    expect(store.getSnapshot().view.state).toBe("fresh");
    pending.resolve(view);
    await Promise.all([badge, dashboard]);
    expect(store.getSnapshot().selection.hostId).toBe("host_b");
    expect(reads).toBe(2);
  });
  it("revalidates a fresh observation on return without presenting it as current during the check", async () => {
    const store = new QuotaSelectionStore();
    let reads = 0;
    const api: QuotaApi = {
      selection: async () => ({ hostId: "host_a", generation: 1 }),
      selectHost: async ({ hostId }) => ({ hostId, generation: 2 }),
      read: async () => { reads++; return view; },
    };
    expect(store.getSnapshot().ready).toBe(false);
    await store.connect(api);
    await store.refresh(api);
    expect(store.getSnapshot().view.state).toBe("fresh");
    const returning = store.connect(api);
    expect(store.getSnapshot().view.state).toBe("stale");
    expect(store.getSnapshot().loading).toBe(true);
    await returning;
    await store.refresh(api);
    expect(reads).toBe(2); // The host cache can answer the second RPC without another quota GET.
    expect(store.getSnapshot().view.state).toBe("fresh");
  });
  it("does not publish a previous account's percentage as fresh while the host checks a switch", async () => {
    const store = new QuotaSelectionStore();
    const switched = deferred<QuotaStatus>();
    let reads = 0;
    const api: QuotaApi = {
      selection: async () => ({ hostId: "host_a", generation: 1 }),
      selectHost: async ({ hostId }) => ({ hostId, generation: 2 }),
      read: async () => ++reads === 1 ? view : switched.promise,
    };
    await store.connect(api);
    await store.refresh(api);
    const returning = store.connect(api);
    expect(store.getSnapshot().view.state).toBe("stale");
    await returning;
    const recheck = store.refresh(api);
    expect(store.getSnapshot().loading).toBe(true);
    switched.resolve({ state: "unavailable", reason: "identity-changed", snapshot: null });
    await recheck;
    expect(store.getSnapshot().view).toEqual({ state: "unavailable", reason: "identity-changed", snapshot: null });
  });
  it("keeps a prior observation stale when selection sync temporarily fails", async () => {
    const store = new QuotaSelectionStore();
    let unavailable = false;
    const api: QuotaApi = {
      selection: async () => { if (unavailable) throw new Error("disconnected"); return { hostId: "host_a", generation: 1 }; },
      selectHost: async ({ hostId }) => ({ hostId, generation: 2 }),
      read: async () => view,
    };
    await store.connect(api);
    await store.refresh(api);
    unavailable = true;
    await store.connect(api);
    expect(store.getSnapshot().view).toMatchObject({ state: "stale", reason: "host-offline", snapshot: view.snapshot });
    expect(store.getSnapshot().ready).toBe(true);
  });

  it("labels a mounted view stale at five minutes and removes it at 24 hours without a refresh error", async () => {
    const store = new QuotaSelectionStore(() => 1000000);
    const snapshot = { ...view.snapshot!, observedAt: new Date(1000000).toISOString() };
    const api: QuotaApi = { selection: async () => ({ hostId: "host_a", generation: 1 }),
      selectHost: async ({ hostId }) => ({ hostId, generation: 2 }),
      read: async () => ({ state: "fresh", reason: "ok", snapshot }) };
    await store.connect(api);
    await store.refresh(api);
    store.tick(1000000 + 299999);
    expect(store.getSnapshot().view.state).toBe("fresh");
    store.tick(1000000 + 300000);
    expect(store.getSnapshot().view.state).toBe("stale");
    store.tick(1000000 + 86400000);
    expect(store.getSnapshot().view).toEqual({ state: "unavailable", reason: "expired", snapshot: null });
  });
  it("keeps a prior percentage stale when a refresh RPC fails", async () => {
    let now = Date.now();
    const store = new QuotaSelectionStore(() => now);
    let fail = false;
    const api: QuotaApi = {
      selection: async () => ({ hostId: "host_a", generation: 1 }),
      selectHost: async ({ hostId }) => ({ hostId, generation: 2 }),
      read: async () => { if (fail) throw new Error("transport failure"); return view; },
    };
    await store.connect(api);
    await store.refresh(api);
    now += 1000;
    fail = true;
    await store.refresh(api, true);
    expect(store.getSnapshot().view).toMatchObject({ state: "stale", reason: "host-offline", snapshot: view.snapshot });
  });
});
