import type { InsightResult } from "../contract";
import { prStatusView } from "./pr-status-view";

const canMergeByThread = new Map<string, boolean>();

export function rememberInsight(threadId: string, result: InsightResult): void {
  if (result.kind === "ok") {
    canMergeByThread.set(threadId, prStatusView(result.insight).action !== null);
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
