export type QuotaWindow = { id: string; name: string; remainingPercent: number; resetAt: string | null };
export type QuotaSnapshot = {
  observedAt: string;
  plan: "free" | "plus" | "pro" | "team" | "business" | "enterprise" | "edu" | null;
  general: QuotaWindow[];
  additional: { name: string; windows: QuotaWindow[] }[];
  bindingWindowId: string | null;
  bindingRemainingPercent: number | null;
  bankedResets: number | null;
};

type RecordValue = Record<string, unknown>;
const asRecord = (value: unknown): RecordValue | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
const percent = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
const round = (value: number): number => Math.round(value * 100) / 100;

function resetTime(window: RecordValue, observedAtMs: number): string | null {
  const absolute = window.reset_at;
  const relative = window.reset_after_seconds;
  const max = observedAtMs + 366 * 86_400_000;
  if (typeof absolute === "number" && Number.isFinite(absolute)) {
    const ms = absolute * 1000;
    if (ms >= observedAtMs && ms <= max) return new Date(ms).toISOString();
  }
  if (typeof relative === "number" && Number.isFinite(relative) && relative >= 0 && relative <= 366 * 86_400) {
    return new Date(observedAtMs + relative * 1000).toISOString();
  }
  return null;
}

function windowName(key: string, window: RecordValue): string {
  const seconds = window.limit_window_seconds;
  if (typeof seconds === "number" && Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 366 * 86_400) {
    for (const [unit, size] of [["day", 86_400], ["hour", 3_600], ["minute", 60]] as const) {
      if (seconds % size === 0) return `${seconds / size} ${unit}${seconds / size === 1 ? "" : "s"}`;
    }
  }
  if (key === "primary_window") return "Primary";
  if (key === "secondary_window") return "Secondary";
  return key.slice(0, -7).replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase());
}

function windows(value: unknown, observedAtMs: number): QuotaWindow[] | null {
  const record = asRecord(value);
  if (!record) return [];
  const entries = Object.entries(record).filter(([key]) => /^[a-z][a-z0-9_]{0,47}_window$/.test(key));
  if (entries.length > 32) return null;
  const result: QuotaWindow[] = [];
  for (const [key, raw] of entries) {
    const window = asRecord(raw);
    const used = percent(window?.used_percent);
    if (!window || used === null) continue;
    result.push({ id: key, name: windowName(key, window), remainingPercent: round(100 - used), resetAt: resetTime(window, observedAtMs) });
  }
  return result;
}

function limitName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const name = value.trim();
  return name.length > 0 && name.length <= 48 && /^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/.test(name) ? name : fallback;
}

/** Strict, bounded host-only projection; never forwards identity, email, raw fields, or upstream errors. */
export function normalizeQuota(payload: unknown, observedAtMs: number): QuotaSnapshot | null {
  const root = asRecord(payload);
  if (!root || !Number.isFinite(observedAtMs) || observedAtMs < 0 || observedAtMs > Date.UTC(2100, 0, 1)) return null;
  const general = windows(root.rate_limit, observedAtMs);
  if (!general) return null;
  const additional: QuotaSnapshot["additional"] = [];
  const raw = root.additional_rate_limits;
  const rawMap = asRecord(raw);
  const entries: [string, unknown][] = Array.isArray(raw)
    ? raw.map((item, index) => [`Additional limit ${index + 1}`, item])
    : rawMap ? Object.entries(rawMap) : [];
  if (entries.length > 16) return null;
  for (const [fallback, item] of entries) {
    const group = asRecord(item);
    if (!group) continue;
    const normalized = windows(group.rate_limit ?? group, observedAtMs);
    if (!normalized) return null;
    if (normalized.length) additional.push({ name: limitName(group.limit_name ?? group.metered_feature, limitName(fallback, "Additional limit")), windows: normalized });
  }
  const codeReview = windows(root.code_review_rate_limit, observedAtMs);
  if (!codeReview) return null;
  if (codeReview.length) additional.push({ name: "Code review", windows: codeReview });
  if (!general.length && !additional.length) return null;
  if (general.length + additional.reduce((sum, item) => sum + item.windows.length, 0) > 32) return null;

  const plan = root.plan_type;
  const knownPlans = ["free", "plus", "pro", "team", "business", "enterprise", "edu"] as const;
  const banked = asRecord(root.rate_limit_reset_credits)?.available_count;
  const binding = general.reduce<QuotaWindow | null>((best, item) =>
    best === null || item.remainingPercent < best.remainingPercent ? item : best, null);
  return {
    observedAt: new Date(observedAtMs).toISOString(),
    plan: knownPlans.find((value) => value === plan) ?? null,
    general, additional,
    bindingWindowId: binding?.id ?? null,
    bindingRemainingPercent: binding?.remainingPercent ?? null,
    bankedResets: typeof banked === "number" && Number.isSafeInteger(banked) && banked >= 0 ? banked : null,
  };
}
