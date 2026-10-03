import { describe, expect, it } from "vitest";
import { ActivityCache } from "./activity-cache.js";
import { normalizeActivity } from "./activity.js";
import type { ActivityRead } from "./activity-contract.js";
const time = Date.UTC(2026, 3, 23, 12);
const snapshot = normalizeActivity({ stats: { lifetime_tokens: 12 } }, time)!;
const ok = async (): Promise<ActivityRead> => ({ status: "ok", snapshot });
const same = async () => "a";
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
describe("independent host-private activity cache", () => {
  it("ages and expires on clock alone, retaining the original observation", async () => {
    let now = time; const cache = new ActivityCache(() => now);
    expect((await cache.read("a", ok, same)).state).toBe("fresh");
    now += 300_000; expect(cache.peek("a").state).toBe("stale");
    expect((await cache.read("a", async () => ({ status: "service", snapshot: null }), same)).snapshot?.observedAt).toBe(snapshot.observedAt);
    expect(cache.peek("a").reason).toBe("service");
    now = time + 86_400_000; expect(cache.peek("a")).toEqual({ state: "unavailable", reason: "expired", snapshot: null });
  });
  it("coalesces forced reads, throttles failures, and rechecks every cached/coalesced return", async () => {
    let now = time; let calls = 0; let checks = 0;
    const cache = new ActivityCache(() => now); const delayed = deferred<ActivityRead>();
    const load = async () => { calls++; return delayed.promise; };
    const recheck = async () => { checks++; return "a"; };
    const first = cache.read("a", load, recheck, true); const second = cache.read("a", load, recheck, true);
    delayed.resolve({ status: "ok", snapshot }); await Promise.all([first, second]);
    expect(calls).toBe(1); expect(checks).toBeGreaterThanOrEqual(2);
    await cache.read("a", load, recheck, true); expect(calls).toBe(1);
    now += 30_000; await cache.read("a", async () => { calls++; return { status: "network", snapshot: null }; }, recheck, true);
    expect(calls).toBe(2); expect(cache.peek("a").state).toBe("stale");
    await cache.read("a", load, recheck, true); expect(calls).toBe(2);
  });
  it.each(["b", null])("discards results and cache when identity becomes %s", async identity => {
    const cache = new ActivityCache(() => time);
    expect((await cache.read("a", ok, async () => identity)).snapshot).toBeNull();
    expect(cache.peek("a").snapshot).toBeNull();
  });
  it("clears a fresh cache if the cached-return recheck fails", async () => {
    const cache = new ActivityCache(() => time); await cache.read("a", ok, same);
    expect((await cache.read("a", ok, async () => { throw new Error("private"); })).reason).toBe("identity-unavailable");
    expect(cache.peek("a").snapshot).toBeNull();
  });
  it("does not publish an old account request after a new account request", async () => {
    let now = time; const cache = new ActivityCache(() => now); const held = deferred<ActivityRead>();
    const first = cache.read("a", () => held.promise, same); now += 30_000;
    await cache.read("b", ok, async () => "b"); held.resolve({ status: "ok", snapshot });
    expect((await first).snapshot).toBeNull(); expect(cache.peek("b").snapshot).toEqual(snapshot);
  });
  it("cancels each waiting caller and disposes pending work without caching", async () => {
    const cache = new ActivityCache(() => time); const held = deferred<ActivityRead>();
    const first = cache.read("a", () => held.promise, same);
    const controller = new AbortController(); const second = cache.read("a", ok, same, true, controller.signal);
    controller.abort(); expect((await second).reason).toBe("selection-changed");
    cache.dispose(); expect((await first).snapshot).toBeNull(); held.resolve({ status: "ok", snapshot });
    expect((await cache.read("a", ok, same)).snapshot).toBeNull();
  });
  it("disposes a pending cached-return identity check immediately", async () => {
    const cache = new ActivityCache(() => time); await cache.read("a", ok, same);
    const held = deferred<string | null>();
    const pending = cache.read("a", ok, () => held.promise);
    cache.dispose(); expect((await pending).snapshot).toBeNull(); held.resolve("a");
  });
});
