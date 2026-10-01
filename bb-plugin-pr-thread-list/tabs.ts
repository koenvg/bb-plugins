import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { BlockerCode, PrSummary } from "./pr-insight";
import { hasActivity, isBusy, needsAttention } from "./row-cues";

export type AttentionTab = "attention" | "inflight";
export type Tab = AttentionTab | "all";

const PROBLEMS: readonly BlockerCode[] = ["conflicts", "checks_failed", "changes_requested", "unresolved_threads"];
const WAITING: readonly BlockerCode[] = ["checks_running", "review_required"];

export function tabFor(thread: PluginSidebarThread, pr: PrSummary | null): AttentionTab {
  if (needsAttention(thread) || thread.isUnread) return "attention";
  if (isBusy(thread) || hasActivity(thread) || thread.queuedWork !== "none") return "inflight";
  if (!pr || pr.blockers.some((code) => PROBLEMS.includes(code))) return "attention";
  if (pr.state === "open" && (pr.runningChecks > 0 || pr.blockers.some((code) => WAITING.includes(code)))) return "inflight";
  return "attention";
}
