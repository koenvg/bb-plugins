import { z } from "zod";

export const historyRequestSchema = z.object({
  hostId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
  generation: z.number().int().min(0).max(1_000_000_000),
}).strict();

export const collectorActionSchema = z.enum(["install", "repair", "pause", "resume", "prepare-legacy", "retire-legacy"]);
export type CollectorAction = z.infer<typeof collectorActionSchema>;
export const legacyConfirmationSchema = z.object({ token: z.uuid(), legacyWritersStopped: z.literal(true) }).strict();
export type LegacyConfirmation = z.infer<typeof legacyConfirmationSchema>;
export const collectorCommandSchema = z.object({ action: collectorActionSchema, confirmation: legacyConfirmationSchema.optional() }).strict()
  .refine(value => (value.action === "retire-legacy") === (value.confirmation !== undefined));
export const collectorRequestSchema = historyRequestSchema.extend({ action: collectorActionSchema, confirmation: legacyConfirmationSchema.optional() })
  .refine(value => (value.action === "retire-legacy") === (value.confirmation !== undefined));
export type CollectorRequest = z.infer<typeof collectorRequestSchema>;
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const collectionSchema = z.object({
  enabled: z.boolean(), firstObservedAt: z.iso.datetime(), pauseCount: count,
  backlog: z.boolean(), invalidRecords: count, unconfirmedEvents: count, conflictingEntries: count,
  workspaces: z.array(z.object({ workspace: z.string().min(1).max(16_384), totalTokens: count, events: count }).strict()).max(50),
  truncated: z.boolean(),
}).strict();
export const historyHealthSchema = z.object({
  state: z.enum(["healthy", "maintenance", "recovered"]),
  detailFrom: z.iso.datetime(), compactFrom: z.iso.datetime(), pending: z.boolean(),
  recoveryGaps: z.array(z.object({ start: z.iso.datetime(), end: z.iso.datetime() }).strict()).max(1),
  legacyLogsPending: z.boolean(),
  legacyRetirement: z.object({ phase: z.enum(["required", "awaiting-confirmation", "ingesting", "retaining", "complete", "blocked"]),
    token: z.uuid().optional(), expiresAt: z.iso.datetime().optional(),
    reason: z.enum(["confirmation-required", "confirmation-invalid", "source-changed", "source-incomplete", "control-changed", "work-incomplete"]).optional(),
  }).strict().optional(),
}).strict();
export const historyReadinessSchema = z.object({
  state: z.enum(["available", "not-configured", "unavailable"]),
  reason: z.enum(["ok", "not-configured", "storage-unavailable", "storage-incompatible", "collector-incompatible",
    "no-selection", "foreign-host", "selection-changed", "host-offline", "unsupported", "retirement-incomplete"]),
  storage: z.enum(["compatible", "unconfigured", "unavailable", "incompatible", "unchecked"]),
  collector: z.enum(["compatible-v1", "missing", "incompatible", "unchecked"]),
  writer: z.enum(["unconfirmed", "observed"]),
  collection: collectionSchema.optional(),
  health: historyHealthSchema.optional(),
}).strict().refine((view) => view.state === "available"
  ? view.reason === "ok" && view.storage === "compatible" && view.collector === "compatible-v1"
  : view.state === "not-configured" ? view.reason === "not-configured" && ["compatible", "unconfigured"].includes(view.storage)
    && ["missing", "compatible-v1"].includes(view.collector)
  : !["ok", "not-configured"].includes(view.reason));
export type HistoryReadiness = z.infer<typeof historyReadinessSchema>;
export type HistoryRequest = z.infer<typeof historyRequestSchema>;
export function historyUnavailable(reason: HistoryReadiness["reason"]): HistoryReadiness {
  return { state: "unavailable", reason, storage: "unchecked", collector: "unchecked", writer: "unconfirmed" };
}
