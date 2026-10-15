import { z } from "zod";
import {
  collectionSchema,
  historyReadinessSchema,
  historyRequestSchema,
} from "./history-contract.js";

export const maintenanceRequestSchema = z
  .object({
    hostId: historyRequestSchema.shape.hostId,
    operation: z.enum(["readiness", "repair-existing"]),
  })
  .strict();
export type MaintenanceRequest = z.infer<typeof maintenanceRequestSchema>;
export const maintenanceCommandSchema = z
  .object({ operation: z.literal("repair-existing") })
  .strict();
const captureSchema = collectionSchema.pick({
  enabled: true,
  firstObservedAt: true,
  pauseCount: true,
});
const establishedReadinessSchema = historyReadinessSchema.safeExtend({
  state: z.literal("available"),
  reason: z.literal("ok"),
  storage: z.literal("compatible"),
  collector: z.literal("compatible-v1"),
  collection: collectionSchema,
});
const unavailableSchema = z
  .object({
    kind: z.literal("unavailable"),
    reason: z.enum([
      "host-offline",
      "host-unapproved",
      "canceled",
      "unsupported",
      "verification-failed",
    ]),
    hostWork: z.enum(["not-started", "may-have-run"]),
  })
  .strict();
const unchangedSchema = z
  .object({
    kind: z.literal("unchanged"),
    reason: z.literal("collector-compatible"),
    readiness: establishedReadinessSchema,
  })
  .strict();
const repairedSchema = z
  .object({
    kind: z.literal("repaired"),
    preserved: captureSchema,
    readiness: establishedReadinessSchema,
  })
  .strict()
  .refine(
    ({ preserved, readiness: { collection } }) =>
      preserved.enabled === collection.enabled &&
      preserved.firstObservedAt === collection.firstObservedAt &&
      preserved.pauseCount === collection.pauseCount,
  );
const refusedSchema = z
  .object({
    kind: z.literal("refused"),
    reason: z.enum([
      "collector-missing",
      "unsafe-collector",
      "runtime-unsupported",
      "storage-ineligible",
      "collection-invalid",
      "readiness-ineligible",
    ]),
    readiness: historyReadinessSchema,
  })
  .strict();
export const repairResultSchema = z.discriminatedUnion("kind", [
  unchangedSchema,
  repairedSchema,
  refusedSchema,
  unavailableSchema,
]);
export type RepairResult = z.infer<typeof repairResultSchema>;
export const maintenanceResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("checked"), readiness: historyReadinessSchema }).strict(),
  unchangedSchema,
  repairedSchema,
  refusedSchema,
  unavailableSchema,
]);
export type MaintenanceResult = z.infer<typeof maintenanceResultSchema>;
export function maintenanceUnavailable(
  reason: z.infer<typeof unavailableSchema>["reason"],
  hostWork: z.infer<typeof unavailableSchema>["hostWork"],
): z.infer<typeof unavailableSchema> {
  return { kind: "unavailable", reason, hostWork };
}
