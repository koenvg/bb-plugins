import { z } from "zod";
const scalar = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    // oxlint-disable-next-line no-control-regex -- Reject control characters in untrusted input.
    .regex(/^[^\u0000-\u001f\u007f]+$/u);
export const confirmedRelationshipSchema = z
  .object({
    sessionId: scalar(256),
    providerIdentity: scalar(250).regex(/^[^/\\]+$/),
    workspace: scalar(16_384).refine((path) => path.startsWith("/")),
  })
  .strict();
export const threadIdSchema = z.string().regex(/^thr_[A-Za-z0-9_-]{1,124}$/);
export const identityRowSchema = z
  .object({
    threadId: threadIdSchema,
    providerIdentity: scalar(250)
      .regex(/^[^/\\]+$/)
      .nullable(),
    title: scalar(256).nullable(),
    state: z.enum(["available", "archived", "deleted"]),
    // Host-neutral unknown or resolved ownership. Neither can bind a thread.
    ownershipUnknown: z.boolean().optional(),
  })
  .strict();
// Internal server-to-host batch. Nothing here comes from browser request fields.
export const identityBatchSchema = z
  .object({
    hostId: scalar(128),
    generation: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative().nullable(),
    rows: z.array(identityRowSchema).max(100),
  })
  .strict();
export type IdentityBatch = z.infer<typeof identityBatchSchema>;
export const attributionViewSchema = z
  .object({
    discovery: z.enum(["unknown", "partial", "complete"]),
    backlog: z.boolean(),
    grades: z
      .array(
        z
          .object({
            grade: z.enum(["exact-thread", "workspace-only", "ambiguous", "unattributed"]),
            totalTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
            events: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(4),
    threads: z
      .array(
        z
          .object({
            threadId: threadIdSchema,
            label: scalar(400),
            state: z.enum(["available", "archived", "deleted", "missing"]),
            totalTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
            events: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(50),
    truncated: z.boolean(),
  })
  .strict();
export type AttributionView = z.infer<typeof attributionViewSchema>;
