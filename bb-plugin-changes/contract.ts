import { imageResultSchema, imageSideSchema } from "./core/image-content";
import { changedFileSchema, changesBasisSchema } from "./core/changes";
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  changesResultSchema,
  diffQuerySchema,
  diffTargetSchema,
  patchesResultSchema,
  sendFeedbackResultSchema,
} from "./core/changes";
import {
  getViewedResultSchema,
  updateViewedResultSchema,
  viewedMarksSchema,
} from "./core/viewed-files";

export const rpcContract = defineRpcContract({
  getImage: {
    input: z
      .object({
        threadId: z.string().min(1),
        basis: changesBasisSchema,
        file: changedFileSchema,
        side: imageSideSchema,
      })
      .strict(),
    output: imageResultSchema,
  },
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
  getViewed: {
    input: z.object({ threadId: z.string().min(1), target: diffTargetSchema }).strict(),
    output: getViewedResultSchema,
  },
  updateViewed: {
    input: z
      .object({
        threadId: z.string().min(1),
        target: diffTargetSchema,
        set: viewedMarksSchema,
        remove: z.array(z.string()),
      })
      .strict(),
    output: updateViewedResultSchema,
  },
});
