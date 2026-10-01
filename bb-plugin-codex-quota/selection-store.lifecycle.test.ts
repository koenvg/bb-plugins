import { afterEach, describe, expect, it, vi } from "vitest";
import { QuotaSelectionStore, type QuotaApi, type Selection } from "./selection-store.js";
import type { QuotaStatus } from "./contract.js";

const fresh = (): QuotaStatus => ({ state: "fresh", reason: "ok", snapshot: {
  observedAt: new Date(Date.now()).toISOString(), plan: null, bankedResets: null,
  general: [{ id: "primary", name: "Primary", remainingPercent: 42, resetAt: null }],
  additional: [], bindingWindowId: "primary", bindingRemainingPercent: 42,
} });
function fixture() {
  let selection: Selection = { hostId: "host_a", generation: 1 };
  const read = vi.fn<QuotaApi["read"]>(async () => fresh());
  const api: QuotaApi = {
    selection: async () => selection,
    selectHost: async ({ hostId }) => selection = { hostId, generation: selection.generation + 1 },
    read,
  };
  return { api, read };
}
afterEach(() => { vi.useRealTimers(); });

describe("app-window quota refresh lifetime", () => {
  it("continues scheduled reads after the wall clock moves backwards", async () => {
    vi.useFakeTimers();
    const { api, read } = fixture();
    const store = new QuotaSelectionStore();
    const stop = store.start(api);
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(Date.now() - 120_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().view.state).not.toBe("fresh");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(read).toHaveBeenCalledTimes(2);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps independent app-window stores alive when another window closes", async () => {
    vi.useFakeTimers();
    const first = fixture();
    const second = fixture();
    const firstStore = new QuotaSelectionStore();
    const secondStore = new QuotaSelectionStore();
    const stopFirst = firstStore.start(first.api);
    const stopSecond = secondStore.start(second.api);
    await vi.advanceTimersByTimeAsync(0);
    stopFirst();
    stopFirst();
    expect(firstStore.getSnapshot().hasActiveOwner).toBe(false);
    expect(secondStore.getSnapshot().hasActiveOwner).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(first.read).toHaveBeenCalledTimes(1);
    expect(second.read).toHaveBeenCalledTimes(2);
    stopSecond();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["clear", "reject"] as const)("keeps selection checks alive after a manual %s", async (outcome) => {
    vi.useFakeTimers();
    const { api, read } = fixture();
    const selection = vi.fn(api.selection);
    api.selection = selection;
    const store = new QuotaSelectionStore();
    const stop = store.start(api);
    await vi.advanceTimersByTimeAsync(0);
    if (outcome === "reject") api.selectHost = async () => { throw new Error("selection rejected"); };
    await store.selectHost(api, null);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(selection).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(selection).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledTimes(outcome === "clear" ? 1 : 2);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("waits for host selection confirmation before resume or manual quota reads", async () => {
    vi.useFakeTimers();
    const { api, read } = fixture();
    const store = new QuotaSelectionStore();
    const stop = store.start(api);
    await vi.advanceTimersByTimeAsync(0);
    let confirm!: () => void;
    const gate = new Promise<void>((resolve) => { confirm = resolve; });
    const select = api.selectHost;
    api.selectHost = async (input) => { await gate; return select(input); };
    const switching = store.selectHost(api, "host_b");
    await store.resume();
    await store.refresh(api, true);
    expect(read).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().ready).toBe(false);
    confirm();
    await switching;
    expect(store.getSnapshot().selection.hostId).toBe("host_b");
    expect(read.mock.calls[1]?.[0].hostId).toBe("host_b");
    stop();
  });
  it("reads on activation and refreshes a minute after completion without overlapping reads", async () => {
    vi.useFakeTimers();
    const { api, read } = fixture();
    const store = new QuotaSelectionStore();
    const stop = store.start(api);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().view.snapshot?.bindingRemainingPercent).toBe(42);
    expect(read.mock.calls).toEqual([[{ hostId: "host_a", generation: 1, refresh: false }]]);
    let resolve!: (result: QuotaStatus) => void;
    read.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(read.mock.calls[1]).toEqual([{ hostId: "host_a", generation: 1, refresh: true }]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(read).toHaveBeenCalledTimes(2);
    resolve(fresh());
    await vi.advanceTimersByTimeAsync(59_999);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(3);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("checks selection without reading quota when no host is selected", async () => {
    vi.useFakeTimers();
    const { api, read } = fixture();
    api.selection = async () => ({ hostId: null, generation: 0 });
    const store = new QuotaSelectionStore();
    const stop = store.start(api);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(read).not.toHaveBeenCalled();
    expect(store.getSnapshot().selection.hostId).toBeNull();
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["rejected", "stale", "unavailable"] as const)("backs off %s reads and returns to a minute cadence on fresh recovery", async (failure) => {
    vi.useFakeTimers();
    const { api, read } = fixture();
    const attempts: number[] = [];
    const initial = Date.now();
    let recover = false;
    read.mockImplementation(async () => {
      attempts.push(Date.now() - initial);
      if (recover) return fresh();
      if (failure === "rejected") throw new Error("transport failure");
      return failure === "stale" ? { ...fresh(), state: "stale", reason: "network" }
        : { state: "unavailable", reason: "network", snapshot: null };
    });
    const store = new QuotaSelectionStore();
    const stop = store.start(api);
    await vi.advanceTimersByTimeAsync(720_000);
    expect(attempts).toEqual([0, 60_000, 180_000, 420_000, 720_000]);
    recover = true;
    await vi.advanceTimersByTimeAsync(300_000);
    expect(store.getSnapshot().view.state).toBe("fresh");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(attempts.slice(-2)).toEqual([1_020_000, 1_080_000]);
    stop();
  });
  it("keeps the original observation timestamp on an automatic transport failure", async () => {
    vi.useFakeTimers();
    const { api, read } = fixture();
    const store = new QuotaSelectionStore();
    const stop = store.start(api);
    await vi.advanceTimersByTimeAsync(0);
    const observation = store.getSnapshot().view.snapshot;
    read.mockRejectedValueOnce(new Error("transport failure"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.getSnapshot().view).toEqual({ state: "stale", reason: "host-offline", snapshot: observation });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(read).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().view.snapshot?.observedAt).toBe(observation?.observedAt);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(3);
    expect(store.getSnapshot().view.state).toBe("fresh");
    stop();
  });
  it("shares a manual retry and resets its automatic deadline after recovery", async () => {
    vi.useFakeTimers();
    const { api, read } = fixture();
    read.mockRejectedValueOnce(new Error("transport failure"));
    const store = new QuotaSelectionStore();
    const stop = store.start(api);
    await vi.advanceTimersByTimeAsync(30_000);
    let resolve!: (result: QuotaStatus) => void;
    read.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const manual = store.refresh(api, true);
    const duplicate = store.refresh(api, true);
    expect(read).toHaveBeenCalledTimes(2);
    resolve(fresh());
    await Promise.all([manual, duplicate]);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(3);
    stop();
  });

  it.each(["selection", "read", "selectHost"] as const)("discards pending %s results after disposal", async (phase) => {
    vi.useFakeTimers();
    const { api, read } = fixture();
    let release!: () => void;
    if (phase === "selection") api.selection = () => new Promise((done) => {
      release = () => done({ hostId: "host_a", generation: 1 });
    });
    if (phase === "read") read.mockImplementationOnce(() => new Promise((done) => { release = () => done(fresh()); }));
    const store = new QuotaSelectionStore();
    const stop = store.start(api);
    await vi.advanceTimersByTimeAsync(0);
    let selecting: Promise<void> | undefined;
    if (phase === "selectHost") {
      api.selectHost = () => new Promise((done) => { release = () => done({ hostId: "host_b", generation: 2 }); });
      selecting = store.selectHost(api, "host_b");
    }
    stop();
    const disposed = store.getSnapshot();
    release();
    await selecting;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(store.getSnapshot()).toBe(disposed);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("resets the previous host's backoff when a different host is selected", async () => {
    vi.useFakeTimers();
    const { api, read } = fixture();
    read.mockRejectedValue(new Error("transport failure"));
    const store = new QuotaSelectionStore();
    const stop = store.start(api);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(read).toHaveBeenCalledTimes(3);
    await store.selectHost(api, "host_b");
    expect(read.mock.calls[3]?.[0].hostId).toBe("host_b");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(read.mock.calls[4]?.[0].hostId).toBe("host_b");
    stop();
  });

  it("replaces an owner safely and an old disposer cannot stop its replacement", async () => {
    vi.useFakeTimers();
    const first = fixture();
    const replacement = fixture();
    let release!: (result: QuotaStatus) => void;
    first.read.mockImplementationOnce(() => new Promise((done) => { release = done; }));
    const store = new QuotaSelectionStore();
    const stopFirst = store.start(first.api);
    await vi.advanceTimersByTimeAsync(0);
    const stopReplacement = store.start(replacement.api);
    await vi.advanceTimersByTimeAsync(0);
    const current = store.getSnapshot();
    stopFirst();
    stopFirst();
    release({ state: "unavailable", reason: "network", snapshot: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot()).toBe(current);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(replacement.read).toHaveBeenCalledTimes(2);
    expect(first.read).toHaveBeenCalledTimes(1);
    stopReplacement();
    stopReplacement();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not read an unconfirmed selection after synchronization fails", async () => {
    vi.useFakeTimers();
    const { api, read } = fixture();
    const store = new QuotaSelectionStore();
    const stop = store.start(api);
    await vi.advanceTimersByTimeAsync(0);
    api.selection = async () => { throw new Error("selection unavailable"); };
    await vi.advanceTimersByTimeAsync(180_000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().view.state).toBe("stale");
    stop();
  });
  it("honors backoff on resume and catches up only once after a clock jump", async () => {
    vi.useFakeTimers();
    const { api, read } = fixture();
    read.mockRejectedValue(new Error("transport failure"));
    const store = new QuotaSelectionStore();
    const stop = store.start(api);
    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.all([store.resume(), store.resume(), store.resume()]);
    expect(read).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + 600_000);
    read.mockResolvedValue(fresh());
    await Promise.all([store.resume(), store.resume(), store.resume()]);
    expect(read).toHaveBeenCalledTimes(3);
    expect(store.getSnapshot().view.state).toBe("fresh");
    stop();
  });

  it("discovers a changed server selection on resume without carrying old backoff", async () => {
    vi.useFakeTimers();
    const { api, read } = fixture();
    read.mockRejectedValue(new Error("transport failure"));
    const store = new QuotaSelectionStore();
    const stop = store.start(api);
    await vi.advanceTimersByTimeAsync(180_000);
    api.selection = async () => ({ hostId: "host_b", generation: 2 });
    read.mockResolvedValue(fresh());
    await store.resume();
    expect(read.mock.calls[3]).toEqual([{ hostId: "host_b", generation: 2, refresh: false }]);
    expect(store.getSnapshot().selection.hostId).toBe("host_b");
    stop();
  });
});
