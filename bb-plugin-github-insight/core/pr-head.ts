import { z } from "zod";
import { prStateSchema } from "./review-submit";

const prHeadResponseSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        id: z.string(),
        headRefOid: z.string(),
        state: prStateSchema,
        viewerDidAuthor: z.boolean(),
      }),
    }),
  }),
});

export const prHeadSchema = z.object({
  prNodeId: z.string(),
  oid: z.string(),
  state: prStateSchema,
  viewerIsAuthor: z.boolean(),
});
export type PrHead = z.infer<typeof prHeadSchema>;

export function parsePrHead(response: unknown): PrHead {
  const { id, headRefOid, state, viewerDidAuthor } =
    prHeadResponseSchema.parse(response).data.repository.pullRequest;
  return { prNodeId: id, oid: headRefOid, state, viewerIsAuthor: viewerDidAuthor };
}
