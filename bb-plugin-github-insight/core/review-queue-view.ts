import { z } from "zod";
import { reviewPrSchema } from "./review-pr";
import { queueListSchema, queuePrSchema } from "./review-queue";

const linkedQueuePrSchema = queuePrSchema.extend({
  projectIds: z.array(z.string()),
  threadId: z.string().nullable(),
});
export type LinkedQueuePr = z.infer<typeof linkedQueuePrSchema>;

const linkedQueueListSchema = queueListSchema.extend({
  groups: z.array(z.object({ repo: z.string(), prs: z.array(linkedQueuePrSchema) })),
});
export type LinkedQueueList = z.infer<typeof linkedQueueListSchema>;

export const reviewThreadStatusSchema = z.enum(["running", "needs_you", "idle", "error"]);
export type ReviewThreadStatus = z.infer<typeof reviewThreadStatusSchema>;

const myReviewSchema = reviewPrSchema.extend({
  threadId: z.string(),
  status: reviewThreadStatusSchema,
});
export type MyReview = z.infer<typeof myReviewSchema>;

export const reviewQueueViewSchema = z.object({
  myReviews: z.array(myReviewSchema),
  reviewRequests: linkedQueueListSchema,
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
