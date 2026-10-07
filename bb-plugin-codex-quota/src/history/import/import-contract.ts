import { z } from "zod";
import { historyRequestSchema } from "../history-contract.js";
const path = z
  .string()
  .min(1)
  .max(4096)
  // oxlint-disable-next-line no-control-regex -- Reject control characters in untrusted input.
  .regex(/^\/[^\u0000-\u001f\u007f]*$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const importConfigurationSchema = z
  .object({
    bbRoot: path,
    ordinaryRoots: z.array(path).max(8),
    workspaces: z.array(path).min(1).max(50),
  })
  .strict();
export const importCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("configure"),
      configuration: importConfigurationSchema,
    })
    .strict(),
  z.object({ action: z.literal("start"), includeUncertain: z.boolean().optional() }).strict(),
  ...(["status", "resume", "cancel"] as const).map((action) =>
    z.object({ action: z.literal(action) }).strict(),
  ),
]);
export const importRequestSchema = historyRequestSchema.extend({
  command: importCommandSchema,
});
export const importReasonSchema = z.enum([
  "ok",
  "not-configured",
  "invalid-configuration",
  "unfinished-generation",
  "metadata-incomplete",
  "no-generation",
  "storage-unavailable",
  "storage-incompatible",
  "selection-changed",
  "host-offline",
  "no-selection",
  "foreign-host",
  "unsupported",
]);
export const importDiagnosticSchema = z.enum([
  "missing-source",
  "source-changed",
  "workspace-unverified",
  "invalid-record",
  "oversize-record",
  "unresolved-overlap",
  "unresolved-ancestry",
  "discovery-limit",
  "identity-unresolved",
  "interrupted",
]);
export const importViewSchema = z
  .object({
    reason: importReasonSchema,
    configuration: importConfigurationSchema.nullable(),
    generation: z
      .object({
        id: z.string().uuid(),
        state: z.enum(["stopped", "completed", "canceled"]),
        startAt: z.iso.datetime(),
        endAt: z.iso.datetime(),
        workspaces: z.array(path).max(50),
        sourceRoots: z.array(path).max(9).optional(),
        candidates: count,
        finished: count,
        bytes: count,
        records: count,
        replayed: count,
        omissions: count,
        includeUncertain: z.boolean().optional(),
        uncertainRecords: count.optional(),
        coverage: z.literal("partial"),
        diagnostics: z.array(importDiagnosticSchema).max(20),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type ImportConfiguration = z.infer<typeof importConfigurationSchema>;
export type ImportCommand = z.infer<typeof importCommandSchema>;
export type ImportView = z.infer<typeof importViewSchema>;
export type ImportDiagnostic = z.infer<typeof importDiagnosticSchema>;
export const importUnavailable = (reason: ImportView["reason"]): ImportView => ({
  reason,
  configuration: null,
  generation: null,
});
