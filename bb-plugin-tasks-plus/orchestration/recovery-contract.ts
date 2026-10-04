import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { claimSchema, dispatchInputSchema } from "./dispatch-contract";

export const RECOVERY_WARNING =
  "A successful listing does not prove absence or rule out delayed creation. Release or replacement can cause duplicate work. Resolution does not spawn, send, resume or delete. A later dispatch needs separate current admission.";
export const recoveryInputSchema = dispatchInputSchema
  .extend({ claimId: z.string().min(1) })
  .strict();
export const resolutionDecisionSchema = recoveryInputSchema
  .extend({
    action: z.enum(["release", "replace"]),
    associationId: z.string().min(1).nullable(),
    reconciliationId: z.string().regex(/^[a-f0-9]{64}$/),
    acknowledgeDelayedCreation: z.literal(true),
  })
  .strict()
  .refine(
    (value) =>
      value.action === "replace"
        ? value.associationId !== null
        : value.associationId === null,
    "Replacement requires an association; release must not select one",
  );
export const resolutionRecordSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("operator_resolution"),
    decisionReference: z.string().min(1),
    decision: resolutionDecisionSchema,
    observedAt: z.string().datetime(),
    previousReason: z.string().nullable(),
    replacementClaimId: z.string().nullable(),
  })
  .strict();
export type RecoveryInput = z.infer<typeof recoveryInputSchema>;
export type ResolutionDecision = z.infer<typeof resolutionDecisionSchema>;
export function readResolution(reason: string | null) {
  try {
    return resolutionRecordSchema.parse(JSON.parse(reason ?? ""));
  } catch {
    return null;
  }
}
export function releasedDispatchGrant(
  claim: z.infer<typeof claimSchema> | null,
  input: z.infer<typeof dispatchInputSchema>,
): boolean {
  if (!claim?.releasedAt) return false;
  const record = readResolution(claim.reason);
  return (
    !!record &&
    record.decision.action === "release" &&
    record.decision.associationId === null &&
    record.replacementClaimId === null &&
    record.decision.claimId === claim.id &&
    record.decision.taskId === claim.taskId &&
    record.decision.role === claim.role &&
    record.decision.runId === claim.runId &&
    record.decision.coordinatorThreadId === claim.coordinatorThreadId &&
    claim.taskId === input.taskId &&
    claim.role === input.role &&
    claim.runId === input.runId &&
    claim.coordinatorThreadId === input.coordinatorThreadId
  );
}
export const recoveryResultSchema = z
  .object({
    outcome: z.enum([
      "recovered",
      "reused",
      "unresolved",
      "released",
      "replaced",
    ]),
    reason: z.string(),
    warning: z.literal(RECOVERY_WARNING),
    claim: claimSchema,
    threadId: z.string().nullable(),
    reconciliationId: z.string().nullable(),
    observedAt: z.string(),
    complete: z.boolean(),
    candidates: z.array(z.string()).max(200),
  })
  .strict();
export type RecoveryResult = z.infer<typeof recoveryResultSchema>;
export const recoveryRpcContract = defineRpcContract({
  orchestrateReconcile: {
    input: recoveryInputSchema,
    output: recoveryResultSchema,
  },
  orchestrateLink: {
    input: recoveryInputSchema.extend({ threadId: z.string().min(1) }).strict(),
    output: recoveryResultSchema,
  },
  orchestrateResolve: {
    input: resolutionDecisionSchema.safeExtend({
      requestId: z.string().min(1),
    }),
    output: recoveryResultSchema,
  },
});
