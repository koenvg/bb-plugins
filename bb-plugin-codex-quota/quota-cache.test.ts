import { describe, expect, it } from "vitest";
import { QuotaCache } from "./quota-cache.js";
import type { QuotaSnapshot } from "./quota.js";

const start = Date.UTC(2026, 3, 23, 12);
const snapshot = (time = start): QuotaSnapshot => ({
  observedAt: new Date(time).toISOString(), plan: "plus", bankedResets: null,
  general: [{ id: "primary_window", name: "Primary", remainingPercent: 25, resetAt: null }],
  additional: [], bindingWindowId: "primary_window", bindingRemainingPercent: 25,
});
const success = (time = start) => ({ status: "ok" as const, snapshot: snapshot(time) });

function delayed<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("host-owned account cache", () => {
  it("coalesces simultaneous reads and discards a delayed old-account response", async () => {
    let now = start;
    const cache = new QuotaCache(() => now);
    const first = delayed<ReturnType<typeof success>>();
    let calls = 0;
    let active = "account-a";
    const loadA = () => { calls++; return first.promise; };
    const a1 = cache.read("account-a", loadA, async () => active);
    const a2 = cache.read("account-a", loadA, async () => active);
    expect(calls).toBe(1);
    active = "account-b";
    now += 10;
    const b = await cache.read("account-b", async () => success(start + 10), async () => active);
    expect(b.state).toBe("fresh");
    first.resolve(success());
    const old1 = await a1;
    const old2 = await a2;
    expect(old1.state).toBe("unavailable");
    expect(old2.snapshot).toBeNull();
    const again = await cache.read("account-b", async () => { throw new Error("should be cached"); }, async () => active);
    expect(again.snapshot?.observedAt).toBe(new Date(start + 10).toISOString());
    expect(JSON.stringify([old1, old2, b, again])).not.toContain("account-b");
  });

  it("discards success when result-time account identity cannot be rechecked", async () => {
    const cache = new QuotaCache(() => start);
    expect(await cache.read("account-a", async () => success(), async () => null)).toEqual({
      state: "unavailable", reason: "identity-unavailable", snapshot: null,
    });
  });

  it("transitions at five minutes without a failed refresh and expires after 24 hours", async () => {
    let now = start;
    const cache = new QuotaCache(() => now);
    expect((await cache.read("a", async () => success(), async () => "a")).state).toBe("fresh");
    now += 299_999;
    expect(cache.peek("a").state).toBe("fresh");
    now++;
    expect(cache.peek("a")).toMatchObject({ state: "stale", reason: "aged", snapshot: snapshot() });
    now = start + 86_400_000;
    expect(cache.peek("a")).toEqual({ state: "unavailable", reason: "expired", snapshot: null });
  });

  it("retains an original observation as stale on refresh failure, then loses it on reload", async () => {
    let now = start;
    const cache = new QuotaCache(() => now);
    await cache.read("a", async () => success(), async () => "a");
    now += 300_001;
    const stale = await cache.read("a", async () => ({ status: "network" as const, snapshot: null }), async () => "a");
    expect(stale).toEqual({ state: "stale", reason: "network", snapshot: snapshot() });
    expect(new QuotaCache(() => now).peek("a")).toEqual({ state: "unavailable", reason: "unavailable", snapshot: null });
  });
  it("keeps a fresh snapshot explicitly stale after a failed forced refresh", async () => {
    let now = start;
    const cache = new QuotaCache(() => now);
    await cache.read("a", async () => success(), async () => "a");
    now += 31_000;
    const failed = await cache.read("a", async () => ({ status: "network" as const, snapshot: null }), async () => "a", true);
    expect(failed).toEqual({ state: "stale", reason: "network", snapshot: snapshot() });
    expect(cache.peek("a")).toEqual(failed);
  });
  it("does not publish a snapshot if its request is cancelled during the read", async () => {
    const cache = new QuotaCache(() => start);
    const inFlight = delayed<ReturnType<typeof success>>();
    const controller = new AbortController();
    const pending = cache.read("a", () => inFlight.promise, async () => "a", false, controller.signal);
    controller.abort();
    inFlight.resolve(success());
    expect(await pending).toEqual({ state: "unavailable", reason: "selection-changed", snapshot: null });
    expect(cache.peek("a").snapshot).toBeNull();
  });
  it("honors explicit refresh after a bounded minimum interval even while a snapshot is fresh", async () => {
    let now = start;
    const cache = new QuotaCache(() => now);
    let calls = 0;
    const load = async () => { calls++; return success(now); };
    await cache.read("a", load, async () => "a");
    now += 10_000;
    await cache.read("a", load, async () => "a", true);
    expect(calls).toBe(1);
    now += 20_000;
    await cache.read("a", load, async () => "a", true);
    expect(calls).toBe(2);
    expect(cache.peek("a").snapshot?.observedAt).toBe(new Date(now).toISOString());
  });
});
