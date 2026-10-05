import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const RUN_LIMITS = {
  tasks: 100,
  references: 16,
  referenceLength: 1024,
  invocationAgeMs: 15 * 60_000,
  approvalBytes: 48 * 1024,
} as const;
const reference = z.string().trim().min(1).max(RUN_LIMITS.referenceLength);
export const runConfigSchema = z
  .object({
    epic: reference,
    tasks: z.array(reference).min(1).max(RUN_LIMITS.tasks),
    preset: reference,
    baselineReferences: z.array(reference).min(1).max(RUN_LIMITS.references),
  })
  .strict();
export type RunConfig = z.infer<typeof runConfigSchema>;
export const invocationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("begin"),
      config: runConfigSchema.partial().optional(),
    })
    .strict(),
  z.object({ action: z.literal("pause"), runId: reference }).strict(),
  z.object({ action: z.literal("resume"), runId: reference }).strict(),
]);
export type Invocation = z.infer<typeof invocationSchema>;
export const proposalSchema = z
  .object({
    epicId: reference,
    projectId: reference,
    bbProjectId: reference,
    coordinatorThreadId: reference,
    approvedTaskIds: z.array(reference).min(1).max(RUN_LIMITS.tasks),
    fingerprints: z.record(reference, z.string().regex(/^[a-f0-9]{64}$/)),
    execution: z
      .object({
        presetId: reference,
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        snapshot: z
          .object({
            providerId: reference,
            modelId: reference,
            reasoningLevel: reference,
            serviceTier: z.string().nullable(),
            permissionMode: reference,
            environmentKind: reference,
            baseBranch: z.string().nullable(),
            machineId: z.string().nullable(),
            instructions: z.string(),
          })
          .strict(),
      })
      .strict(),
    baselineReferences: z.array(reference).min(1).max(RUN_LIMITS.references),
  })
  .strict();
export type RunProposal = z.infer<typeof proposalSchema>;
export const approvalSchema = z
  .object({ approved: z.literal(true), proposal: proposalSchema })
  .strict();
export const runSchema = proposalSchema.extend({
  id: reference,
  invocationReference: reference,
  approvalReference: reference,
  phase: z.enum(["active", "paused", "interrupted"]),
  generation: reference,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ApprovedRun = z.infer<typeof runSchema>;
export const runResultSchema = z.union([
  z.object({ outcome: z.literal("run"), run: runSchema }).strict(),
  z
    .object({
      outcome: z.enum(["pending", "cancelled", "interrupted"]),
      invocationReference: reference,
      error: z.object({ code: reference, message: z.string() }).strict().optional(),
    })
    .strict(),
]);
export type RunResult = z.infer<typeof runResultSchema>;
const controlInput = z.object({ coordinatorThreadId: reference, requestId: reference }).strict();
export const runRpcContract = defineRpcContract({
  orchestrateBegin: { input: controlInput, output: runResultSchema },
  orchestratePause: { input: controlInput, output: runResultSchema },
  orchestrateResume: { input: controlInput, output: runResultSchema },
  orchestratePreview: {
    input: z.object({ coordinatorThreadId: reference, config: runConfigSchema }).strict(),
    output: z.object({ proposal: proposalSchema, summary: z.string() }).strict(),
  },
});
