// Endpoint field mapping and UTC week grouping adapted from OpenForge Codex Usage. See LICENSE.activity.
import { MAX_ACTIVITY_BUCKETS, type ActivitySnapshot } from "./activity-contract.js";

type Bucket = { date: string; tokens: number };
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const number = (value: unknown, integer = true): number | null =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= Number.MAX_SAFE_INTEGER &&
  (!integer || Number.isSafeInteger(value))
    ? value
    : null;
function dailyBuckets(value: unknown): Bucket[] | null {
  if (!Array.isArray(value) || value.length > MAX_ACTIVITY_BUCKETS) return null;
  const dates = new Set<string>();
  const rows: Bucket[] = [];
  for (const item of value) {
    const row = record(item);
    const date = row?.start_date ?? row?.date;
    const tokens = number(row?.tokens);
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || tokens === null)
      return null;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date ||
      dates.has(date)
    )
      return null;
    dates.add(date);
    rows.push({ date, tokens });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}
function weeklyBuckets(daily: Bucket[]): Bucket[] | null {
  const weeks = new Map<string, number>();
  for (const row of daily) {
    const date = new Date(`${row.date}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const week = date.toISOString().slice(0, 10);
    const tokens = (weeks.get(week) ?? 0) + row.tokens;
    if (!Number.isSafeInteger(tokens)) return null;
    weeks.set(week, tokens);
  }
  return [...weeks].map(([date, tokens]) => ({ date, tokens }));
}
function cumulativeBuckets(daily: Bucket[]): Bucket[] | null {
  let total = 0;
  const rows: Bucket[] = [];
  for (const row of daily) {
    total += row.tokens;
    if (!Number.isSafeInteger(total)) return null;
    rows.push({ date: row.date, tokens: total });
  }
  return rows;
}
export function normalizeActivity(
  payload: unknown,
  observedAtMs = Date.now(),
): ActivitySnapshot | null {
  const root = record(payload);
  const stats = record(root?.stats) ?? record(record(root?.profile)?.stats);
  if (!stats || !Number.isFinite(observedAtMs) || Math.abs(observedAtMs) > 8.64e15) return null;
  const summary = {
    lifetimeTokens: number(stats.lifetime_tokens),
    peakDailyTokens: number(stats.peak_daily_tokens),
    longestTurnSeconds: number(stats.longest_running_turn_sec, false),
    currentStreakDays: number(stats.current_streak_days),
    longestStreakDays: number(stats.longest_streak_days),
  };
  const daily = dailyBuckets(stats.daily_usage_buckets);
  if (daily === null && Object.values(summary).every((value) => value === null)) return null;
  return {
    observedAt: new Date(observedAtMs).toISOString(),
    summary,
    daily,
    weekly: daily === null ? null : weeklyBuckets(daily),
    cumulative: daily === null ? null : cumulativeBuckets(daily),
  };
}
