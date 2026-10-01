import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const summariesSchema = z.object({
  insightAvailable: z.boolean(),
  summaries: z.record(z.string(), z.unknown()),
});
export type Summaries = z.infer<typeof summariesSchema>;

export const rpcContract = defineRpcContract({
  listSummaries: { input: z.object({}).strict(), output: summariesSchema },
});
