import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { idSchema } from "../shared/contract";

export const roleSchema = z.enum(["implementation", "orchestrator", "integration"]);
export type WorkerRole = z.infer<typeof roleSchema>;
export const claimPhaseSchema = z.enum([
  "reserved",
  "creating",
  "created",
  "attached",
  "creation_unknown",
  "attachment_failed",
  "admission_rejected",
]);
export const claimSchema = z
  .object({
    id: z.string(),
    taskId: idSchema,
    role: roleSchema,
    runId: z.string(),
    coordinatorThreadId: z.string(),
    phase: claimPhaseSchema,
    threadId: z.string().nullable(),
    associationId: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    releasedAt: z.string().nullable(),
    reason: z.string().nullable(),
  })
  .strict();
export type DispatchClaim = z.infer<typeof claimSchema>;
export const dispatchInputSchema = z
  .object({
    runId: z.string().min(1),
    coordinatorThreadId: z.string().min(1),
    taskId: idSchema,
    role: roleSchema.default("implementation"),
  })
  .strict();
const resultSchema = z
  .object({
    outcome: z.enum([
      "deferred",
      "created",
      "reused",
      "adopted",
      "resolution_needed",
      "unresolved",
    ]),
    reason: z.string(),
    threadId: z.string().nullable(),
    claim: claimSchema.nullable(),
    candidates: z.array(z.object({ associationId: z.string(), threadId: z.string() }).strict()),
  })
  .strict();
export type DispatchResult = z.infer<typeof resultSchema>;
export const dispatchRpcContract = defineRpcContract({
  orchestrateDispatch: { input: dispatchInputSchema, output: resultSchema },
  orchestrateAdopt: {
    input: dispatchInputSchema.extend({ associationId: z.string().min(1) }).strict(),
    output: resultSchema,
  },
});
export const correlationSchema = z
  .object({
    version: z.literal(1),
    attemptId: z.string(),
    taskId: idSchema,
    role: roleSchema,
    runId: z.string(),
    coordinatorThreadId: z.string(),
    bbProjectId: z.string(),
  })
  .strict();
