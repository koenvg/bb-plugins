import { describe, expect, it } from "vitest";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import hostEntry from "./host.js";
import { createQuotaHostEntry } from "./host.js";
import type { QuotaSnapshot } from "./quota.js";

describe("Codex Quota host entry", () => {
  it("answers a validated RPC without exposing host data", async () => {
    const harness = experimental_createHostEntryHarness(hostEntry);
    expect(await harness.experimental_call("ping", null)).toEqual({ reachable: true });
    await harness.experimental_dispose();
  });

  it("checks the active account on a cached return without another quota GET", async () => {
    const now = Date.UTC(2026, 3, 23, 12);
    let account = "account-a";
    let calls = 0;
    const entry = createQuotaHostEntry({
      auth: async () => ({ status: "ok", token: "secret", identity: account }),
      read: async () => ({ status: "ok", snapshot: {
        observedAt: new Date(now).toISOString(), plan: null, bankedResets: null,
        general: [{ id: "primary_window", name: "Primary", remainingPercent: ++calls === 1 ? 42 : 65, resetAt: null }],
        additional: [], bindingWindowId: "primary_window", bindingRemainingPercent: calls === 1 ? 42 : 65,
      } }), now: () => now,
    });
    const harness = experimental_createHostEntryHarness(entry);
    expect((await harness.experimental_call("quota", {})).snapshot?.bindingRemainingPercent).toBe(42);
    expect((await harness.experimental_call("quota", {})).snapshot?.bindingRemainingPercent).toBe(42);
    expect(calls).toBe(1);
    account = "account-b";
    expect((await harness.experimental_call("quota", {})).snapshot?.bindingRemainingPercent).toBe(65);
    expect(calls).toBe(2);
    await harness.experimental_dispose();
  });
  it("rechecks account identity after a delayed quota response and never returns the old account", async () => {
    const observedAt = Date.UTC(2026, 3, 23, 12);
    const snapshot: QuotaSnapshot = { observedAt: new Date(observedAt).toISOString(), plan: null, bankedResets: 0,
      general: [{ id: "primary_window", name: "Primary", remainingPercent: 42, resetAt: null }],
      additional: [], bindingWindowId: "primary_window", bindingRemainingPercent: 42 };
    let active = "account-a";
    let resolveRead!: (result: { status: "ok"; snapshot: QuotaSnapshot }) => void;
    const read = new Promise<{ status: "ok"; snapshot: QuotaSnapshot }>((done) => { resolveRead = done; });
    let started!: () => void;
    const readStarted = new Promise<void>((done) => { started = done; });
    const entry = createQuotaHostEntry({
      auth: async () => ({ status: "ok", token: "secret", identity: active }),
      read: async () => { started(); return read; }, now: () => observedAt,
    });
    const harness = experimental_createHostEntryHarness(entry);
    const pending = harness.experimental_call("quota", {});
    await readStarted;
    active = "account-b";
    resolveRead({ status: "ok", snapshot });
    expect(await pending).toEqual({ state: "unavailable", reason: "identity-changed", snapshot: null });
    expect(JSON.stringify(await pending)).not.toContain("secret");
    await harness.experimental_dispose();
  });

  it("discards a cancelled host read before publishing it to the host cache", async () => {
    const observedAt = Date.UTC(2026, 3, 23, 12);
    const snapshot: QuotaSnapshot = { observedAt: new Date(observedAt).toISOString(), plan: null, bankedResets: null,
      general: [{ id: "primary_window", name: "Primary", remainingPercent: 42, resetAt: null }],
      additional: [], bindingWindowId: "primary_window", bindingRemainingPercent: 42 };
    let finish!: () => void;
    let started!: () => void;
    const delayed = new Promise<void>((done) => { finish = done; });
    const entered = new Promise<void>((done) => { started = done; });
    let calls = 0;
    const entry = createQuotaHostEntry({
      auth: async () => ({ status: "ok", token: "secret", identity: "account-a" }),
      read: async () => { if (++calls === 1) { started(); await delayed; } return { status: "ok", snapshot }; },
      now: () => observedAt,
    });
    const harness = experimental_createHostEntryHarness(entry);
    const controller = new AbortController();
    const pending = harness.experimental_call("quota", {}, { signal: controller.signal });
    await entered;
    controller.abort();
    finish();
    expect(await pending).toEqual({ state: "unavailable", reason: "selection-changed", snapshot: null });
    expect((await harness.experimental_call("quota", {})).state).toBe("fresh");
    expect(calls).toBe(2);
    await harness.experimental_dispose();
  });
  it("starts a worker reload with an empty cache, and does not publish an uncheckable identity", async () => {
    const observedAt = Date.UTC(2026, 3, 23, 12);
    let calls = 0;
    let checkable = true;
    const entry = createQuotaHostEntry({
      auth: async () => checkable ? ({ status: "ok", token: "secret", identity: "account-a" }) : ({ status: "auth-unavailable" }),
      read: async () => { calls++; return { status: "ok" as const, snapshot: {
        observedAt: new Date(observedAt).toISOString(), plan: null, bankedResets: null,
        general: [{ id: "primary_window", name: "Primary", remainingPercent: 25, resetAt: null }],
        additional: [], bindingWindowId: "primary_window", bindingRemainingPercent: 25,
      } }; }, now: () => observedAt,
    });
    const first = experimental_createHostEntryHarness(entry);
    expect((await first.experimental_call("quota", {})).state).toBe("fresh");
    expect((await first.experimental_call("quota", {})).state).toBe("fresh");
    expect(calls).toBe(1);
    checkable = false;
    expect(await first.experimental_call("quota", {})).toEqual({ state: "unavailable", reason: "auth-unavailable", snapshot: null });
    await first.experimental_dispose();
    const second = experimental_createHostEntryHarness(createQuotaHostEntry({
      auth: async () => ({ status: "ok", token: "secret", identity: "account-a" }),
      read: async () => { calls++; return { status: "network" as const, snapshot: null }; }, now: () => observedAt,
    }));
    expect(await second.experimental_call("quota", {})).toEqual({ state: "unavailable", reason: "network", snapshot: null });
    expect(calls).toBe(2);
    await second.experimental_dispose();
  });
});
