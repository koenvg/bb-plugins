import { z } from "zod";
import type { Blocker } from "./blockers";

export const mergeMethodSchema = z.enum(["MERGE", "SQUASH", "REBASE"]);
export type MergeMethod = z.infer<typeof mergeMethodSchema>;

export const mergeActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("merge"), method: mergeMethodSchema }),
]);
export type MergeAction = z.infer<typeof mergeActionSchema>;

export const MERGE_METHOD_LABEL: Record<MergeMethod, string> = {
  MERGE: "Create merge commit",
  SQUASH: "Squash and merge",
  REBASE: "Rebase and merge",
};

export interface MergeActionInput {
  prState: "open" | "draft" | "closed" | "merged";
  blockers: readonly Blocker[];
  isMergeQueueEnabled: boolean;
  defaultMethod: MergeMethod;
  allowedMethods: Readonly<Record<MergeMethod, boolean>>;
}

export function buildMergeAction(input: MergeActionInput): MergeAction {
  if (input.prState !== "open" || input.blockers.length > 0) return { kind: "none" };
  if (input.isMergeQueueEnabled) return { kind: "none" };
  if (!input.allowedMethods[input.defaultMethod]) return { kind: "none" };
  return { kind: "merge", method: input.defaultMethod };
}
