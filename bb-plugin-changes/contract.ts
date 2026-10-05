import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  changesResultSchema,
  diffQuerySchema,
  diffTargetSchema,
  patchesResultSchema,
  sendFeedbackResultSchema,
} from "./core/changes";

export const rpcContract = defineRpcContract({
  getChanges: {
    input: z.object({ threadId: z.string().min(1), target: diffTargetSchema }).strict(),
    output: changesResultSchema,
  },
  getPatches: {
    input: z
      .object({
        threadId: z.string().min(1),
        query: diffQuerySchema,
        paths: z.array(z.string()).min(1),
      })
      .strict(),
    output: patchesResultSchema,
  },
  sendFeedback: {
    input: z.object({ threadId: z.string().min(1), text: z.string().regex(/\S/) }).strict(),
    output: sendFeedbackResultSchema,
  },
});
