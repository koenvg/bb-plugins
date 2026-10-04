import { describe, expect, it, vi } from "vitest";
import { normalizeQuota } from "./quota.js";
import { fetchNormalizedQuota } from "./feasibility.js";

const observedAt = Date.UTC(2026, 3, 23, 12);
const signal = new AbortController().signal;
const token = "synthetic-secret-do-not-return";

describe("Codex quota normalization", () => {
  it("keeps general and additional windows separate and chooses the most restrictive general window", () => {
    const snapshot = normalizeQuota({
      plan_type: "plus",
      rate_limit: {
        primary_window: { used_percent: 0, reset_at: observedAt / 1000 + 3600 },
        secondary_window: { used_percent: 100, reset_after_seconds: 60 },
      },
      additional_rate_limits: [{ limit_name: "Code review", rate_limit: { primary_window: { used_percent: 85 } } }],
      rate_limit_reset_credits: { available_count: 0 },
    }, observedAt);
    expect(snapshot).toEqual({
      observedAt: new Date(observedAt).toISOString(), plan: "plus", bankedResets: 0,
      general: [
        { id: "primary_window", name: "Primary", remainingPercent: 100, resetAt: new Date(observedAt + 3_600_000).toISOString() },
        { id: "secondary_window", name: "Secondary", remainingPercent: 0, resetAt: new Date(observedAt + 60_000).toISOString() },
      ],
      additional: [{ name: "Code review", windows: [{ id: "primary_window", name: "Primary", remainingPercent: 15, resetAt: null }] }],
      bindingWindowId: "secondary_window", bindingRemainingPercent: 0,
    });
  });

  it("breaks general-window ties in upstream order without counting additional limits", () => {
    const snapshot = normalizeQuota({
      rate_limit: { secondary_window: { used_percent: 70 }, primary_window: { used_percent: 70 } },
      additional_rate_limits: [{ rate_limit: { primary_window: { used_percent: 100 } } }],
    }, observedAt);
    expect(snapshot?.bindingWindowId).toBe("secondary_window");
    expect(snapshot?.bindingRemainingPercent).toBe(30);
  });

  it("uses unknown instead of zero for invalid percentages, resets, plan, or absent banked count", () => {
    const snapshot = normalizeQuota({
      plan_type: "user@example.com", rate_limit: {
        primary_window: { used_percent: "0", reset_at: "tomorrow" },
        secondary_window: { used_percent: 125, reset_after_seconds: -2 },
      },
      additional_rate_limits: [{ limit_name: "GPT-5", rate_limit: { primary_window: { used_percent: 33.333, reset_at: -1, reset_after_seconds: 30 } } }],
      rate_limit_reset_credits: { available_count: -1 },
    }, observedAt);
    expect(snapshot?.general).toEqual([]);
    expect(snapshot?.bindingRemainingPercent).toBeNull();
    expect(snapshot?.bankedResets).toBeNull();
    expect(snapshot?.plan).toBeNull();
    expect(snapshot?.additional[0]?.windows[0]).toEqual({
      id: "primary_window", name: "Primary", remainingPercent: 66.67,
      resetAt: new Date(observedAt + 30_000).toISOString(),
    });
    expect(normalizeQuota({ rate_limit_reset_credits: { available_count: 0.5 } }, observedAt)).toBeNull();
  });

  it("rejects malformed roots and oversized or unrecognized window collections", () => {
    expect(normalizeQuota(null, observedAt)).toBeNull();
    expect(normalizeQuota({ rate_limit: { primary_window: { used_percent: NaN } } }, observedAt)).toBeNull();
    const many = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`limit_${i}_window`, { used_percent: 1 }]));
    expect(normalizeQuota({ rate_limit: many }, observedAt)).toBeNull();
    expect(normalizeQuota({ rate_limit: { primary_window: { used_percent: Infinity } } }, observedAt)).toBeNull();
  });
});

describe("bounded quota GET", () => {
  it("returns only normalized values and fixed status on request failures", async () => {
    const response = new Response(JSON.stringify({ rate_limit: { primary_window: { used_percent: 35 } } }));
    const get = vi.fn(async (_url: string, _init: RequestInit) => response);
    const success = await fetchNormalizedQuota(token, signal, get, observedAt);
    expect(success.status).toBe("ok");
    expect(success.snapshot?.bindingRemainingPercent).toBe(65);
    expect(JSON.stringify(success)).not.toContain(token);
    expect(get).toHaveBeenCalledWith("https://chatgpt.com/backend-api/wham/usage", expect.objectContaining({ method: "GET", signal }));
    for (const [failure, status] of [
      [new Response("denied", { status: 401 }), "auth-expired"],
      [new Response("down", { status: 503 }), "service"],
      [new Response("{}"), "unsupported"],
      [new Response("x".repeat(65537)), "unsupported"],
    ] as const) {
      const result = await fetchNormalizedQuota(token, signal, async () => failure, observedAt);
      expect(result).toEqual({ status, snapshot: null });
    }
    expect(await fetchNormalizedQuota(token, signal, async () => { throw new Error(token); }, observedAt)).toEqual({ status: "network", snapshot: null });
  });
});
