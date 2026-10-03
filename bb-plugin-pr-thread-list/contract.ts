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
const snoozesSchema = z.object({ snoozes: z.record(threadId, z.number().int()), groups: z.record(threadId, threadId) })
  .refine(({ snoozes, groups }) => {
    if (Object.keys(snoozes).length !== Object.keys(groups).length) return false;
    const deadlines = new Map<string, number>();
    for (const [id, at] of Object.entries(snoozes)) {
      const group = groups[id];
      if (!group || deadlines.has(group) && deadlines.get(group) !== at) return false;
      deadlines.set(group, at);
    }
    return true;
  }, "Snooze membership and deadlines must form complete groups.");
export type Snoozes = z.infer<typeof snoozesSchema>;

export const rpcContract = defineRpcContract({
  listSummaries: { input: z.object({}).strict(), output: summariesSchema },
  listSnoozes: { input: z.object({}).strict(), output: snoozesSchema },
  snooze: { input: z.object({ threadId, wakeAt: z.number().int() }).strict(), output: z.object({}) },
  wake: { input: z.object({ threadId }).strict(), output: z.object({}) },
});
