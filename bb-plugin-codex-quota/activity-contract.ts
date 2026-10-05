import { z } from "zod";
import type { QuotaReason } from "./quota-cache.js";

export const MAX_ACTIVITY_BUCKETS = 366;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });
const buckets = z
  .array(z.object({ date, tokens: count }).strict())
  .max(MAX_ACTIVITY_BUCKETS)
  .refine((rows) => rows.every((row, index) => index === 0 || rows[index - 1]!.date < row.date));
export const activitySnapshotSchema = z
  .object({
    observedAt: z.string().datetime(),
    summary: z
      .object({
        lifetimeTokens: count.nullable(),
        peakDailyTokens: count.nullable(),
        longestTurnSeconds: z
          .number()
          .finite()
          .nonnegative()
          .max(Number.MAX_SAFE_INTEGER)
          .nullable(),
        currentStreakDays: count.nullable(),
        longestStreakDays: count.nullable(),
      })
      .strict(),
    daily: buckets.nullable(),
    weekly: buckets.nullable(),
    cumulative: buckets.nullable(),
  })
  .strict();
export const activityViewSchema = z
  .object({
    state: z.enum(["fresh", "stale", "unavailable"]),
    reason: z.enum([
      "ok",
      "aged",
      "expired",
      "unavailable",
      "identity-changed",
      "identity-unavailable",
      "auth-required",
      "auth-no-token",
      "credential-store-failed",
      "oauth-refresh-failed",
      "auth-derivation-failed",
      "oauth-short-lived",
      "oauth-resolution-failed",
      "auth-runtime-failed",
      "auth-unavailable",
      "auth-expired",
      "auth-check-failed",
      "runtime-unavailable",
      "network",
      "service",
      "unsupported",
      "no-selection",
      "selection-changed",
      "host-offline",
      "foreign-host",
    ]),
    snapshot: activitySnapshotSchema.nullable(),
  })
  .strict()
  .refine((view) =>
    view.state === "unavailable"
      ? view.snapshot === null && view.reason !== "ok"
      : view.snapshot !== null &&
        (view.state === "fresh" ? view.reason === "ok" : view.reason !== "ok"),
  );
export type ActivitySnapshot = z.infer<typeof activitySnapshotSchema>;
export type ActivityView = z.infer<typeof activityViewSchema>;
export type ActivityRead =
  | { status: "ok"; snapshot: ActivitySnapshot }
  | { status: "auth-expired" | "network" | "service" | "unsupported"; snapshot: null };
export const emptyActivity = (
  reason: QuotaReason | "no-selection" | "host-offline" | "foreign-host" = "unavailable",
): ActivityView => ({ state: "unavailable", reason, snapshot: null });
