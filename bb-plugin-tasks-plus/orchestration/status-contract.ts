import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  idSchema,
  TASK_STATUSES,
  TASK_THREAD_LIVE_STATUSES,
} from "../shared/contract";

export const STATUS_LIMITS = {
  subtasks: 100,
  bytes: 128 * 1024,
  workersPerTask: 5,
  attachmentsPerTask: 5,
  resultsPerReport: 5,
  decisionsPerWorker: 5,
  textCharacters: 240,
  referenceCodeUnits: 1024,
  externalWorkers: 100,
  lookupConcurrency: 4,
  lookupTimeoutMs: 2000,
} as const;

const unknownSchema = z
  .object({ state: z.literal("unknown"), reason: z.string() })
  .strict();
const absentSchema = z.object({ state: z.literal("absent") }).strict();
function available<S extends z.ZodType>(schema: S) {
  return z.union([
    unknownSchema,
    absentSchema,
    z.object({ state: z.literal("present"), value: schema }).strict(),
  ]);
}
export function unknown(reason: string): z.infer<typeof unknownSchema> {
  return { state: "unknown", reason };
}
const excerptSchema = z
  .object({
    text: z.string(),
    totalCharacters: z.number().int().nonnegative(),
    omittedCharacters: z.number().int().nonnegative(),
  })
  .strict()
  .refine((value) => {
    const characters = Array.from(value.text).length;
    return (
      characters <= STATUS_LIMITS.textCharacters &&
      value.totalCharacters === characters + value.omittedCharacters
    );
  }, "Invalid excerpt limit or overflow count");
function listSchema<S extends z.ZodType>(
  item: S,
  limit: number = STATUS_LIMITS.resultsPerReport,
) {
  return z
    .object({
      items: z.array(item).max(limit),
      total: z.number().int().nonnegative(),
      omitted: z.number().int().nonnegative(),
    })
    .strict()
    .refine(
      (value) => value.total === value.items.length + value.omitted,
      "Invalid list overflow count",
    );
}
const referenceSchema = z.string();
const referencesSchema = listSchema(referenceSchema);
const taskIdentitySchema = z
  .object({ id: z.string(), key: z.string(), status: z.enum(TASK_STATUSES) })
  .strict();
const roleSchema = z.enum(["implementation", "orchestrator", "integration"]);
const ownerSchema = z
  .object({ associationId: z.string(), threadId: z.string(), role: roleSchema })
  .strict();
const claimSchema = z
  .object({
    id: z.string(),
    runId: z.string(),
    role: roleSchema,
    phase: z.string(),
    threadId: z.string().nullable(),
  })
  .strict();
const runValueSchema = z
  .object({
    id: z.string(),
    phase: z.string(),
    coordinatorThreadId: z.string(),
    approvedTaskIds: z.array(z.string()),
    scopeState: z.enum(["current", "changed", "unknown"]),
    baselineReferences: referencesSchema,
  })
  .strict();
const reportDeliveryValueSchema = z
  .object({
    id: z.string(),
    state: z.enum([
      "pending",
      "native",
      "sent",
      "queued",
      "suppressed",
      "failed",
      "ambiguous",
    ]),
    reason: excerptSchema,
    reference: z.string().nullable(),
    attemptedAt: z.string().nullable(),
  })
  .strict();
const reportValueSchema = z
  .object({
    id: z.string(),
    commentId: z.string(),
    threadId: z.string(),
    outcome: z.enum([
      "completed",
      "review_ready",
      "blocked",
      "failed",
      "needs_decision",
    ]),
    createdAt: z.string(),
    summary: excerptSchema,
    resultReferences: referencesSchema,
    baselineReferences: referencesSchema.optional(),
    delivery: reportDeliveryValueSchema.optional(),
    runId: z.string().nullable().optional(),
    claimId: z.string().nullable().optional(),
    associationId: z.string().nullable().optional(),
  })
  .strict();
const acceptanceValueSchema = z
  .object({
    reportId: z.string(),
    threadId: z.string(),
    outcome: z.enum(["verified", "failed", "unverified"]),
    baselineReferences: referencesSchema,
    evidenceReferences: referencesSchema,
  })
  .strict();
const handoffSchema = z
  .object({
    state: z.enum(["unknown", "not_required", "blocked", "ready"]),
    reason: z.string(),
  })
  .strict();
const activitySchema = z
  .object({
    state: z.enum(["fresh", "stale", "unknown"]),
    value: z.enum([
      "pending",
      "starting",
      "active",
      "stopping",
      "idle",
      "failed",
      "deleted",
      "missing",
      "unknown",
    ]),
    observedAt: z.string().nullable(),
    attemptedAt: z.string().nullable(),
    cachedValue: z.enum(TASK_THREAD_LIVE_STATUSES),
    cachedAt: z.string(),
    reason: z.string().nullable(),
  })
  .strict();
const decisionSchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    threadId: z.string(),
    kind: z.string(),
    state: z.enum(["pending", "resolving"]),
    createdAt: z.string(),
    question: excerptSchema,
  })
  .strict();
const decisionsSchema = z
  .object({
    state: z.enum(["fresh", "unknown"]),
    observedAt: z.string().nullable(),
    reason: z.string().nullable(),
    items: z.array(decisionSchema).max(STATUS_LIMITS.decisionsPerWorker),
    total: z.number().int().nonnegative().nullable(),
    omitted: z.number().int().nonnegative().nullable(),
  })
  .strict();
const nativeDecisionsSchema = z
  .object({
    state: z.enum(["fresh", "partial", "unknown"]),
    observedAt: z.string().nullable(),
    items: z.array(decisionSchema).max(STATUS_LIMITS.decisionsPerWorker),
    knownPending: z.number().int().nonnegative(),
    omitted: z.number().int().nonnegative(),
    unobservedWorkers: z.number().int().nonnegative(),
  })
  .strict();
const workerSchema = z
  .object({
    associationId: z.string(),
    threadId: z.string(),
    activity: activitySchema,
    decisions: decisionsSchema,
  })
  .strict();
const ownershipSchema = z
  .object({
    state: z.enum(["known", "unknown", "resolution_needed"]),
    reason: z.string(),
    owners: z.array(ownerSchema).max(3),
  })
  .strict();
const taskStatusSchema = taskIdentitySchema
  .extend({
    title: excerptSchema,
    nativeReadiness: z.enum(["ready", "blocked"]),
    dependencies: z.array(taskIdentitySchema),
    openBlockerCount: z.number().int().nonnegative(),
    priorWork: z.boolean(),
    ownership: ownershipSchema,
    owners: z.array(workerSchema).max(3),
    workers: listSchema(workerSchema, STATUS_LIMITS.workersPerTask),
    attachments: listSchema(
      z
        .object({
          id: z.string(),
          commentId: z.string().nullable(),
          fileName: excerptSchema,
        })
        .strict(),
      STATUS_LIMITS.attachmentsPerTask,
    ),
    dispatch: available(z.array(claimSchema)),
    nativeDecisions: nativeDecisionsSchema,
    latestOutcome: available(reportValueSchema),
    reportDeliveries: available(
      listSchema(
        z
          .object({
            reportId: z.string(),
            threadId: z.string(),
            delivery: reportDeliveryValueSchema,
          })
          .strict(),
        STATUS_LIMITS.resultsPerReport,
      ),
    ).optional(),
    handoff: handoffSchema,
    reportedDecisions: available(
      listSchema(decisionSchema, STATUS_LIMITS.decisionsPerWorker),
    ),
  })
  .strict();
const countsSchema = z
  .object({
    subtasks: z.number().int().nonnegative(),
    dependencies: z.number().int().nonnegative(),
    workers: z.number().int().nonnegative(),
  })
  .strict();
export const epicStatusSchema = z
  .object({
    generatedAt: z.string(),
    tasksObservedAt: z.string(),
    consistency: z.literal("tasks_snapshot_external_observations"),
    limits: z
      .object(
        Object.fromEntries(
          Object.entries(STATUS_LIMITS).map(([key, value]) => [
            key,
            z.literal(value),
          ]),
        ) as {
          [K in keyof typeof STATUS_LIMITS]: z.ZodLiteral<
            (typeof STATUS_LIMITS)[K]
          >;
        },
      )
      .strict(),
    auxiliaryReduced: z.boolean(),
    external: z
      .object({
        observedWorkers: z.number().int().nonnegative(),
        omittedWorkers: z.number().int().nonnegative(),
      })
      .strict(),
    epic: taskStatusSchema,
    subtasks: z.array(taskStatusSchema).max(STATUS_LIMITS.subtasks),
    totals: z
      .object({
        subtasks: z.number().int().nonnegative(),
        done: z.number().int().nonnegative(),
        canceled: z.number().int().nonnegative(),
        nativeReady: z.number().int().nonnegative(),
        nativeBlocked: z.number().int().nonnegative(),
      })
      .strict(),
    run: available(runValueSchema),
    acceptance: available(acceptanceValueSchema),
  })
  .strict();
export const statusResultSchema = z.union([
  z.object({ ok: z.literal(true), status: epicStatusSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          code: z.enum([
            "task_not_found",
            "epic_status_size_limit",
            "epic_status_extension_invalid",
          ]),
          message: z.string(),
          counts: countsSchema.optional(),
          requiredBytes: z.number().int().nonnegative().optional(),
        })
        .strict(),
    })
    .strict(),
]);
export const orchestrationStatusContract = defineRpcContract({
  orchestrateStatus: {
    input: z.object({ epicId: idSchema }).strict(),
    output: statusResultSchema,
  },
});
export type EpicStatus = z.infer<typeof epicStatusSchema>;
export type StatusResult = z.infer<typeof statusResultSchema>;
export type WorkerStatus = z.infer<typeof workerSchema>;
export type DecisionStatus = z.infer<typeof decisionSchema>;
export type TaskStatusProjection = z.infer<typeof taskStatusSchema>;

// Later slices read their actual Tasks-owned records here. This synchronous reader
// runs inside the same read transaction as the native snapshot. It must not write,
// call BB, reconstruct comments, or infer reports from activity/metadata.
type Availability<T> =
  | { state: "unknown"; reason: string }
  | { state: "absent" }
  | { state: "present"; value: T };
type RunData = Omit<z.infer<typeof runValueSchema>, "baselineReferences"> & {
  baselineReferences: readonly string[];
};
type ReportData = Omit<
  z.infer<typeof reportValueSchema>,
  "summary" | "resultReferences" | "baselineReferences" | "delivery"
> & {
  summary: string;
  resultReferences: readonly string[];
  baselineReferences?: readonly string[];
  delivery?: Omit<z.infer<typeof reportDeliveryValueSchema>, "reason"> & {
    reason: string;
  };
};
type AcceptanceData = Omit<
  z.infer<typeof acceptanceValueSchema>,
  "baselineReferences" | "evidenceReferences"
> & {
  baselineReferences: readonly string[];
  evidenceReferences: readonly string[];
};
export interface TaskCoordinationData {
  // Primary role and association IDs must each be unique within a task.
  ownership?: z.infer<typeof ownershipSchema>;
  dispatch?: Availability<z.infer<typeof claimSchema>[]>;
  latestOutcome?: Availability<ReportData>;
  handoff?: z.infer<typeof handoffSchema>;
  reportedDecisions?: Availability<
    Array<Omit<DecisionStatus, "question"> & { question: string }>
  >;
  reportedDecisionTotal?: number;
  reportDeliveries?: Availability<{
    items: Array<{
      reportId: string;
      threadId: string;
      delivery: Omit<z.infer<typeof reportDeliveryValueSchema>, "reason"> & {
        reason: string;
      };
    }>;
    total: number;
  }>;
}
export interface CoordinationSnapshot {
  run?: Availability<RunData>;
  acceptance?: Availability<AcceptanceData>;
  tasks?: ReadonlyMap<string, TaskCoordinationData>;
}
export type CoordinationReader = (
  epicId: string,
  taskIds: readonly string[],
) => CoordinationSnapshot;
