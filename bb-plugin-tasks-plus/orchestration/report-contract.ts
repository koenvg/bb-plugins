import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { idSchema } from "../shared/contract";
import { roleSchema } from "./dispatch-contract";

export const REPORT_LIMITS = {
  summary: 2000,
  question: 2000,
  reference: 1024,
  results: 16,
  baselines: 16,
  key: 128,
  contextsPerWorker: 8,
  contextLifetimeMs: 24 * 60 * 60_000,
} as const;
const reference = z.string().trim().min(1).max(REPORT_LIMITS.reference);
export const reportOutcomeSchema = z.enum([
  "completed",
  "review_ready",
  "blocked",
  "failed",
  "needs_decision",
]);
export const resultReferenceSchema = z
  .object({
    kind: z.enum(["commit", "branch", "patch", "artifact", "evidence", "url"]),
    reference,
  })
  .strict();
export const reportPayloadSchema = z
  .object({
    taskId: idSchema,
    key: z.string().trim().min(1).max(REPORT_LIMITS.key),
    outcome: reportOutcomeSchema,
    summary: z.string().trim().min(1).max(REPORT_LIMITS.summary),
    question: z
      .string()
      .trim()
      .min(1)
      .max(REPORT_LIMITS.question)
      .nullable()
      .default(null),
    resultReferences: z
      .array(resultReferenceSchema)
      .max(REPORT_LIMITS.results)
      .default([]),
    baselineReferences: z
      .array(reference)
      .max(REPORT_LIMITS.baselines)
      .default([]),
  })
  .strict();
const hasQuestion = (value: z.infer<typeof reportPayloadSchema>) =>
  value.outcome !== "needs_decision" || value.question !== null;
export const reportInputSchema = reportPayloadSchema
  .extend({ contextToken: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict()
  .refine(hasQuestion, "needs_decision requires an explicit question");
export const nativeReportInputSchema = reportPayloadSchema.refine(
  hasQuestion,
  "needs_decision requires an explicit question",
);
export type ReportPayload = z.infer<typeof nativeReportInputSchema>;
export type ReportInput = z.infer<typeof reportInputSchema>;
export const reportOriginSchema = z
  .object({
    taskId: idSchema,
    threadId: reference,
    bbProjectId: reference,
    associationId: reference.nullable(),
    claimId: reference.nullable(),
    runId: reference.nullable(),
  })
  .strict();
export type ReportOrigin = z.infer<typeof reportOriginSchema>;
export const reportDeliverySchema = z
  .object({
    id: reference,
    state: z.enum([
      "pending",
      "native",
      "sent",
      "queued",
      "suppressed",
      "failed",
      "ambiguous",
    ]),
    reason: z.string().max(2000),
    reference: reference.nullable(),
    attemptedAt: z.string().nullable(),
  })
  .strict();
export type ReportDelivery = z.infer<typeof reportDeliverySchema>;
export const workerReportSchema = reportPayloadSchema
  .extend({
    id: reference,
    threadId: reference,
    taskKey: reference,
    projectId: idSchema,
    bbProjectId: reference,
    associationId: reference.nullable(),
    claimId: reference.nullable(),
    runId: reference.nullable(),
    coordinatorThreadId: reference.nullable(),
    role: roleSchema.nullable(),
    commentId: idSchema,
    createdAt: z.string(),
    delivery: reportDeliverySchema,
  })
  .strict();
export type WorkerReport = z.infer<typeof workerReportSchema>;
export const reportRpcContract = defineRpcContract({
  reportWorker: { input: reportInputSchema, output: workerReportSchema },
  readWorkerReport: {
    input: z.object({ reportId: reference }).strict(),
    output: workerReportSchema.nullable(),
  },
});
