import { describe, expect, it } from "vitest";
import { normalizeActivity } from "./activity.js";
import { activityViewSchema } from "./activity-contract.js";

const time = Date.UTC(2026, 3, 23, 12);
describe("independent account activity normalization", () => {
  it("keeps each missing/invalid summary unknown, not zero", () => {
    const snapshot = normalizeActivity({ profile: { stats: { lifetime_tokens: 0, peak_daily_tokens: -1,
      longest_running_turn_sec: 1.5, current_streak_days: "3", longest_streak_days: Infinity } } }, time)!;
    expect(snapshot.summary).toEqual({ lifetimeTokens: 0, peakDailyTokens: null, longestTurnSeconds: 1.5,
      currentStreakDays: null, longestStreakDays: null });
    expect(snapshot.daily).toBeNull(); expect(snapshot.weekly).toBeNull(); expect(snapshot.cumulative).toBeNull();
    expect(activityViewSchema.safeParse({ state: "fresh", reason: "ok", snapshot }).success).toBe(true);
  });
  it("sorts supported dates, derives UTC Monday weeks and returned-bucket cumulative totals", () => {
    const snapshot = normalizeActivity({ stats: { daily_usage_buckets: [
      { start_date: "2026-04-20", tokens: 10 }, { date: "2026-04-19", tokens: 5 },
      { date: "2026-04-22", tokens: 0 },
    ] } }, time)!;
    expect(snapshot.daily).toEqual([{ date: "2026-04-19", tokens: 5 }, { date: "2026-04-20", tokens: 10 }, { date: "2026-04-22", tokens: 0 }]);
    expect(snapshot.weekly).toEqual([{ date: "2026-04-13", tokens: 5 }, { date: "2026-04-20", tokens: 10 }]);
    expect(snapshot.cumulative?.map(x => x.tokens)).toEqual([5, 15, 15]);
    expect(snapshot.summary.lifetimeTokens).toBeNull();
  });
  it.each([null, {}, [], { stats: {} }, { stats: { lifetime_tokens: "4" } }])("rejects unsupported input %j", payload => {
    expect(normalizeActivity(payload, time)).toBeNull();
  });
  it.each([
    [{ date: "2026-02-30", tokens: 1 }], [{ date: "2026-04-20", tokens: -1 }],
    [{ date: "2026-04-20", tokens: 0.5 }], [{ date: "2026-04-20", tokens: Number.MAX_SAFE_INTEGER + 1 }],
    [{ date: "2026-04-20", tokens: 1 }, { date: "2026-04-20", tokens: 2 }],
    Array.from({ length: 367 }, () => ({ date: "2026-04-20", tokens: 1 })),
  ].map(rows => [rows]))("does not claim complete derived data from malformed/duplicate/oversize buckets", daily_usage_buckets => {
    const snapshot = normalizeActivity({ stats: { lifetime_tokens: 4, daily_usage_buckets } }, time)!;
    expect(snapshot.summary.lifetimeTokens).toBe(4);
    expect(snapshot.daily).toBeNull(); expect(snapshot.weekly).toBeNull(); expect(snapshot.cumulative).toBeNull();
  });
  it("keeps valid daily buckets when derived sums overflow", () => {
    const snapshot = normalizeActivity({ stats: { daily_usage_buckets: [
      { date: "2026-04-20", tokens: Number.MAX_SAFE_INTEGER }, { date: "2026-04-21", tokens: 1 },
    ] } }, time)!;
    expect(snapshot.daily).toHaveLength(2); expect(snapshot.weekly).toBeNull(); expect(snapshot.cumulative).toBeNull();
  });
  it("never copies arbitrary strings, claims, emails or raw fields", () => {
    const secret = "sentinel-sensitive@example.invalid";
    const snapshot = normalizeActivity({ email: secret, profile: { email: secret }, stats: { lifetime_tokens: 4, raw: secret }, metadata: { generated_at: secret } }, time)!;
    expect(JSON.stringify(snapshot)).not.toContain(secret);
    expect(activityViewSchema.safeParse({ state: "fresh", reason: "ok", snapshot: { ...snapshot, raw: secret } }).success).toBe(false);
    expect(activityViewSchema.safeParse({ state: "unavailable", reason: "ok", snapshot }).success).toBe(false);
  });
});
