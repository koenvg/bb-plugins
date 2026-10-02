import type { PluginKvStorage } from "@get-bb/plugin-sdk";
import { z } from "zod";
import type { PullRequestRef } from "../core/pr-ref";

const PREFIX = "reviewed:";

const markEntrySchema = z.object({
  v: z.literal(1),
  owner: z.string(),
  repo: z.string(),
  number: z.number(),
  headOid: z.string(),
  markedAt: z.number(),
});

export interface ReviewedMark {
  ref: PullRequestRef;
  headOid: string;
  markedAt: number;
}

export type ReviewedMarks = ReturnType<typeof createReviewedMarks>;

function keyOf({ owner, repo, number }: PullRequestRef): string {
  return `${PREFIX}${owner.toLowerCase()}/${repo.toLowerCase()}#${number}`;
}

export function createReviewedMarks(
  kv: Pick<PluginKvStorage, "get" | "set" | "delete" | "list">,
  now: () => number,
) {
  return {
    save: (ref: PullRequestRef, headOid: string) =>
      kv.set(keyOf(ref), {
        v: 1,
        owner: ref.owner.toLowerCase(),
        repo: ref.repo.toLowerCase(),
        number: ref.number,
        headOid,
        markedAt: now(),
      }),

    delete: (ref: PullRequestRef) => kv.delete(keyOf(ref)),

    async list(): Promise<ReviewedMark[]> {
      const entries = await Promise.all(
        (await kv.list(PREFIX)).map(async (key) => markEntrySchema.safeParse(await kv.get(key))),
      );
      return entries.flatMap((entry) => {
        if (!entry.success) return [];
        const { owner, repo, number, headOid, markedAt } = entry.data;
        return [{ ref: { owner, repo, number }, headOid, markedAt }];
      });
    },
  };
}
