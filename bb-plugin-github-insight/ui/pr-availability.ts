import type { InsightResult } from "../contract";

const canMergeByThread = new Map<string, boolean>();

export function rememberInsight(threadId: string, result: InsightResult): void {
  if (result.kind === "ok") {
    const { kind } = result.insight.mergeAction;
    canMergeByThread.set(threadId, kind === "merge" || kind === "enqueue");
  } else if (result.kind === "no_pr") {
    canMergeByThread.delete(threadId);
  }
}

export function hasPr(threadId: string): boolean {
  return canMergeByThread.has(threadId);
}

export function canMerge(threadId: string): boolean {
  return canMergeByThread.get(threadId) === true;
}
