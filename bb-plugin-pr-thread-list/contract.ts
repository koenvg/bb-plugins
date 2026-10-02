import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const summariesSchema = z.object({
  insightAvailable: z.boolean(),
  summaries: z.record(z.string(), z.unknown()),
});
export type Summaries = z.infer<typeof summariesSchema>;

export const SNOOZES_CHANGED_CHANNEL = "snoozes.changed";
export const MAX_SNOOZE_MS = 30 * 86_400_000;

const threadId = z.string().min(1);
const snoozesSchema = z.object({ snoozes: z.record(z.string(), z.number()) });
export type Snoozes = z.infer<typeof snoozesSchema>;

export const rpcContract = defineRpcContract({
  listSummaries: { input: z.object({}).strict(), output: summariesSchema },
  listSnoozes: { input: z.object({}).strict(), output: snoozesSchema },
  snooze: { input: z.object({ threadId, wakeAt: z.number().int() }).strict(), output: z.object({}) },
  wake: { input: z.object({ threadId }).strict(), output: z.object({}) },
});
