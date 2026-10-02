import { z } from "zod";
import { queuePrSchema } from "./review-queue";
import { reviewStateSchema } from "./review-state";

export const reviewThreadStatusSchema = z.enum(["running", "needs_you", "idle", "error"]);
export type ReviewThreadStatus = z.infer<typeof reviewThreadStatusSchema>;

const linkedThreadSchema = z.object({
  id: z.string(),
  status: reviewThreadStatusSchema,
  isReviewThread: z.boolean(),
});
export type LinkedThread = z.infer<typeof linkedThreadSchema>;

export const queueRowSchema = queuePrSchema.extend({ requested: z.boolean() });
export type QueueRow = z.infer<typeof queueRowSchema>;

const linkedQueuePrSchema = queueRowSchema.extend({
  projectIds: z.array(z.string()),
  review: reviewStateSchema,
  thread: linkedThreadSchema.nullable(),
});
export type LinkedQueuePr = z.infer<typeof linkedQueuePrSchema>;

const queueSectionSchema = z.array(z.object({ repo: z.string(), prs: z.array(linkedQueuePrSchema) }));
export type QueueSection = z.infer<typeof queueSectionSchema>;

export const reviewQueueViewSchema = z.object({
  needsReview: queueSectionSchema,
  reviewed: queueSectionSchema,
  truncated: z.boolean(),
  loadedAt: z.number(),
});
export type ReviewQueueView = z.infer<typeof reviewQueueViewSchema>;

export const loadedReviewQueueSchema = z.discriminatedUnion("kind", [
  reviewQueueViewSchema.extend({ kind: z.literal("ok") }),
  z.object({
    kind: z.literal("error"),
    message: z.string(),
    lastGood: reviewQueueViewSchema.nullable(),
  }),
]);
export type LoadedReviewQueue = z.infer<typeof loadedReviewQueueSchema>;

export const reviewQueueResultSchema = z.union([
  loadedReviewQueueSchema,
  z.object({ kind: z.literal("loading") }),
]);
export type ReviewQueueResult = z.infer<typeof reviewQueueResultSchema>;
