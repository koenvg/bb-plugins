import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { visibleView } from "../account/freshness.js";
import { QuotaCache, type QuotaRead } from "../quota/quota-cache.js";
import { MachineAccountsStore, footerAllowance } from "./accounts-store.js";
import { accountsFixture, quotaFixture } from "./machines.test-support.js";

const start = Date.UTC(2026, 3, 23, 12);
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function pollingAccount(rpcMs = 12_000, cachedRpcMs = rpcMs) {
  const cache = new QuotaCache();
  const store = new MachineAccountsStore();
  const controller = new AbortController();
  const upstream = {
    status: "ok" as QuotaRead["status"],
    identity: "account-a" as string | null,
    observationAge: 0,
    rpcFailed: false,
  };
  const load = vi.fn(async (): Promise<QuotaRead> => {
    await wait(8000);
    return upstream.status === "ok"
      ? { status: "ok", snapshot: quotaFixture(Date.now() - upstream.observationAge).snapshot }
      : { status: upstream.status, snapshot: null };
  });
  const recheck = vi.fn(async () => {
    await wait(1000);
    return upstream.identity;
  });
  const requests: number[] = [];
  const api = vi.fn(async ({ refresh }: { refresh: boolean }) => {
    requests.push(Date.now() - start);
    if (upstream.rpcFailed) {
      await wait(rpcMs);
      throw new Error("RPC unavailable");
    }
    const previousLoads = load.mock.calls.length;
    const quota = await cache.read("account-a", load, recheck, refresh, controller.signal);
    await wait(load.mock.calls.length === previousLoads ? cachedRpcMs : rpcMs);
    const data = accountsFixture();
    data.accounts[0]!.quota = quota;
    return data;
  });
  const samples: { at: number; state: string; label: string; observedAt: string | null }[] = [];
  const unsubscribe = store.subscribe(() => {
    const { data, now } = store.getSnapshot();
    if (!data) return;
    samples.push({
      at: now - start,
      state: visibleView(data.accounts[0]!.quota, now).state,
      label: footerAllowance(data, now).label,
      observedAt: data.accounts[0]!.quota.snapshot?.observedAt ?? null,
    });
  });
  const stop = store.start(api);
  return {
    cache,
    store,
    controller,
    upstream,
    load,
    recheck,
    api,
    requests,
    samples,
    dispose() {
      unsubscribe();
      stop();
    },
  };
}

let account: ReturnType<typeof pollingAccount> | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(start);
});
afterEach(() => {
  account?.dispose();
  account = undefined;
  vi.useRealTimers();
});

function displayed() {
  const { data, now } = account!.store.getSnapshot();
  return {
    quota: visibleView(data!.accounts[0]!.quota, now),
    footer: footerAllowance(data, now),
  };
}

describe("account polling through the host quota cache", () => {
  it.each([
    { rpcMs: 0, cachedRpcMs: 0 },
    { rpcMs: 12_000, cachedRpcMs: 12_000 },
    { rpcMs: 24_000, cachedRpcMs: 24_000 },
    { rpcMs: 24_000, cachedRpcMs: 33_000 },
  ])(
    "keeps the footer current across delayed healthy renewals with $rpcMs/$cachedRpcMs ms RPC overhead",
    async ({ rpcMs, cachedRpcMs }) => {
      account = pollingAccount(rpcMs, cachedRpcMs);
      await vi.advanceTimersByTimeAsync(20 * 60_000);

      expect(account.samples.length).toBeGreaterThan(1000);
      expect(
        account.samples.find((sample) => sample.label !== "63%" || sample.state !== "fresh"),
      ).toBeUndefined();
      expect(new Set(account.samples.map((sample) => sample.observedAt)).size).toBeGreaterThan(3);
      expect(account.load.mock.calls.length).toBeGreaterThan(3);
      expect(account.api.mock.calls.length).toBeGreaterThan(account.load.mock.calls.length);
      expect(account.api.mock.calls.every(([input]) => !input.refresh)).toBe(true);
      expect(displayed().footer).toMatchObject({ label: "63%", known: false });
    },
  );

  it("hides a retained observation after a renewal failure and preserves frontend backoff", async () => {
    account = pollingAccount();
    await vi.advanceTimersByTimeAsync(21_000);
    const original = displayed().quota.snapshot;
    account.upstream.status = "network";
    await vi.advanceTimersByTimeAsync(229_000);

    expect(displayed().quota).toEqual({ state: "stale", reason: "network", snapshot: original });
    expect(displayed().footer.label).toBe("—");
    expect(Date.now() - Date.parse(original!.observedAt)).toBeLessThan(300_000);
    await vi.advanceTimersByTimeAsync(950_000);
    expect(
      account.samples.filter((sample) => sample.at >= 250_000 && sample.label !== "—"),
    ).toEqual([]);
    expect(account.requests).toEqual([
      0, 81_000, 153_000, 225_000, 306_000, 447_000, 708_000, 1_029_000,
    ]);
  });

  it("does not keep a renewed success current when its identity cannot be verified", async () => {
    account = pollingAccount();
    await vi.advanceTimersByTimeAsync(21_000);
    account.upstream.identity = null;
    await vi.advanceTimersByTimeAsync(229_000);

    expect(displayed().quota).toEqual({
      state: "unavailable",
      reason: "identity-unavailable",
      snapshot: null,
    });
    expect(displayed().footer.label).toBe("—");
    expect(account.cache.peek("account-a").snapshot).toBeNull();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(
      account.samples.filter((sample) => sample.at >= 250_000 && sample.state === "fresh"),
    ).toEqual([]);
  });

  it.each(["abort", "invalidate"])("discards a renewal interrupted by %s", async (action) => {
    account = pollingAccount();
    await vi.advanceTimersByTimeAsync(225_000);
    expect(account.load).toHaveBeenCalledTimes(2);
    if (action === "abort") account.controller.abort();
    else account.cache.invalidate();
    await vi.advanceTimersByTimeAsync(21_000);

    expect(displayed().quota).toMatchObject({ state: "unavailable", snapshot: null });
    expect(displayed().footer.label).toBe("—");
    expect(account.cache.peek("account-a").snapshot).toBeNull();
  });

  it("hides observations after RPC failure and ages them on the viewer clock without more reads", async () => {
    account = pollingAccount();
    await vi.advanceTimersByTimeAsync(21_000);
    const original = displayed().quota.snapshot;
    account.upstream.rpcFailed = true;
    await vi.advanceTimersByTimeAsync(72_000);
    expect(displayed().quota).toEqual({ state: "stale", reason: "network", snapshot: original });
    expect(displayed().footer.label).toBe("—");
    vi.setSystemTime(start + 86_408_000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(displayed().quota).toEqual({ state: "unavailable", reason: "expired", snapshot: null });
    expect(displayed().footer.label).toBe("—");
    expect(account.load).toHaveBeenCalledTimes(1);
  });

  it.each([
    { age: 300_000, state: "stale", reason: "aged" },
    { age: 86_400_000, state: "unavailable", reason: "expired" },
    { age: -60_000, state: "unavailable", reason: "expired" },
  ])(
    "never presents a non-current upstream observation as current ($age ms)",
    async ({ age, state, reason }) => {
      account = pollingAccount();
      account.upstream.observationAge = age;
      await vi.advanceTimersByTimeAsync(21_000);
      expect(displayed().quota).toMatchObject({ state, reason });
      expect(displayed().footer.label).toBe("—");
      await vi.advanceTimersByTimeAsync(600_000);
      expect(
        account.samples.filter((sample) => sample.label !== "—" || sample.state === "fresh"),
      ).toEqual([]);
    },
  );
});
