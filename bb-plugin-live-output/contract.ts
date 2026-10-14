import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

import { graphSeconds } from "./timing";
const count = z.number().finite().nonnegative();
const sampleSchema = z
  .object({
    second: z.number().int(),
    rawBytesPerSecond: count,
    smoothBytesPerSecond: count,
  })
  .strict();
const contributorSchema = z
  .object({
    id: z.string(),
    title: z.string().max(200),
    providerId: z.string().max(200),
    parentThreadId: z.string().nullable(),
    hidden: z.boolean(),
    archived: z.boolean(),
    rawBytesPerSecond: count,
    smoothBytesPerSecond: count,
    lastAt: count,
  })
  .strict();
export const snapshotSchema = z
  .object({
    at: count,
    startedAt: count,
    coverage: z.enum(["starting", "live", "degraded"]),
    threadsDiscovered: count,
    streamingThreads: count,
    totalBytes: count,
    deltas: count,
    failures: count,
    backlog: count,
    capacityLimited: z.boolean(),
    rawBytesPerSecond: count,
    smoothBytesPerSecond: count,
    samples: z.array(sampleSchema).length(graphSeconds),
    contributors: z.array(contributorSchema).max(10),
  })
  .strict();
export type OutputSnapshot = z.infer<typeof snapshotSchema>;
export const rpcContract = defineRpcContract({
  snapshot: { input: z.null(), output: snapshotSchema },
});
