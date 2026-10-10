import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

import { historyReadinessSchema, collectorCommandSchema } from "../history/history-contract.js";
import { activityViewSchema } from "../activity/activity-contract.js";
import { hostPreparationSchema } from "../history/report-preparation-contract.js";
import { identityBatchSchema } from "../history/identity/identity-contract.js";
import { importCommandSchema, importViewSchema } from "../history/import/import-contract.js";
import {
  calendarQuerySchema,
  calendarReportSchema,
} from "../history/calendar/calendar-contract.js";
const windowSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,47}_window$/),
    name: z.string().min(1).max(48),
    remainingPercent: z.number().finite().min(0).max(100),
    resetAt: z.string().datetime().nullable(),
  })
  .strict();

export const quotaSnapshotSchema = z
  .object({
    observedAt: z.string().datetime(),
    plan: z.enum(["free", "plus", "pro", "team", "business", "enterprise", "edu"]).nullable(),
    general: z.array(windowSchema).max(32),
    additional: z
      .array(
        z
          .object({ name: z.string().min(1).max(48), windows: z.array(windowSchema).max(32) })
          .strict(),
      )
      .max(17),
    bindingWindowId: z.string().max(56).nullable(),
    bindingRemainingPercent: z.number().finite().min(0).max(100).nullable(),
    bankedResets: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  })
  .strict();

export const quotaViewSchema = z
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
    snapshot: quotaSnapshotSchema.nullable(),
  })
  .strict()
  .refine((view) =>
    view.state === "unavailable"
      ? view.snapshot === null && view.reason !== "ok"
      : view.snapshot !== null && (view.state !== "fresh" || view.reason === "ok"),
  );
export type QuotaStatus = z.infer<typeof quotaViewSchema>;

// Host/server-only account correlation, separate from private token fingerprints.
export const accountObservationInput = z
  .object({
    challenge: z.string().regex(/^[a-f0-9]{64}$/),
    refresh: z.boolean(),
    includeActivity: z.boolean(),
  })
  .strict();
export const accountObservationSchema = z
  .object({
    proof: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    quota: quotaViewSchema,
    activity: activityViewSchema,
  })
  .strict();

export const hostContract = defineRpcContract({
  accountObservation: { input: accountObservationInput, output: accountObservationSchema },
  ping: { input: z.null(), output: z.object({ reachable: z.boolean() }).strict() },
  quota: { input: z.object({ refresh: z.boolean().optional() }).strict(), output: quotaViewSchema },
  historyReadiness: {
    input: z.union([z.null(), z.object({ identities: identityBatchSchema }).strict()]),
    output: historyReadinessSchema,
  },
  reportPreparation: {
    input: z.object({ identities: identityBatchSchema }).strict(),
    output: hostPreparationSchema,
  },
  calendarReport: { input: calendarQuerySchema, output: calendarReportSchema },
  collectorControl: { input: collectorCommandSchema, output: historyReadinessSchema },
  historicalImport: {
    input: z
      .object({
        hostId: z.string().min(1).max(128),
        command: importCommandSchema,
        knownWorkspaces: z.array(z.string().min(1).max(4096)).max(50),
      })
      .strict(),
    output: importViewSchema,
  },
  activity: {
    input: z.object({ refresh: z.boolean().optional() }).strict(),
    output: activityViewSchema,
  },
});
