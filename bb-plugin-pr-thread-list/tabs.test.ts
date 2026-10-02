import { describe, expect, it } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { thread } from "./fixtures";
import type { BlockerCode, MergeQueueState, PrState, PrSummary } from "./pr-insight";
import { tabFor } from "./tabs";

const pr = (blockers: BlockerCode[], state: PrState = "open", overrides: Partial<PrSummary> = {}): PrSummary => ({
  number: 42, url: "https://example.com/pull/42", state,
  failedChecks: 0, passedChecks: 0, runningChecks: 0, pendingReviews: 0,
  blockers, failedNames: [], pendingNames: [], mergeQueue: null, ...overrides,
});
const queued = (state: MergeQueueState, blockers: BlockerCode[] = []) => pr(blockers, "open", { mergeQueue: { position: 2, state } });
const activity = { workflows: 0, backgroundAgents: 1, backgroundCommands: 0, planMode: 0, goals: 0 };

describe("tabFor", () => {
  it.each<[string, Partial<PluginSidebarThread>, PrSummary | null, "attention" | "inflight"]>([
    ["waits for an approval while checks run", { hasPendingInteraction: true }, pr(["checks_running"]), "attention"],
    ["has a failed queued message", { queuedWork: "failed" }, null, "attention"],
    ["has an unread error", { indicator: "unread-error", isUnread: true }, null, "attention"],
    ["is idle with unread output and a PR waiting for review", { isUnread: true }, pr(["review_required"]), "attention"],
    ["runs with failed checks", { status: "active" }, pr(["checks_failed"]), "inflight"],
    ["has a background agent", { activity }, null, "inflight"],
    ["has a queued message waiting", { queuedWork: "waiting" }, null, "inflight"],
    ["is idle without a PR", {}, null, "attention"],
    ["has failed checks and a required review", {}, pr(["checks_failed", "review_required"]), "attention"],
    ["has conflicts while checks run", {}, pr(["conflicts", "checks_running"]), "attention"],
    ["has requested changes", {}, pr(["changes_requested"]), "attention"],
    ["has unresolved comments and a required review", {}, pr(["unresolved_threads", "review_required"]), "attention"],
    ["has checks running", {}, pr(["checks_running"]), "inflight"],
    ["has running checks the blockers do not name", {}, pr([], "open", { runningChecks: 2 }), "inflight"],
    ["waits for a required review", {}, pr(["review_required", "behind"]), "inflight"],
    ["is ready to merge", {}, pr([]), "attention"],
    ["is only behind", {}, pr(["behind"]), "attention"],
    ["is only blocked", {}, pr(["blocked"]), "attention"],
    ["has a queued PR", {}, queued("queued"), "inflight"],
    ["has a PR whose queue checks run", {}, queued("awaiting_checks"), "inflight"],
    ["has a merging PR", {}, queued("merging"), "inflight"],
    ["has a queued PR with stale blockers", {}, queued("queued", ["checks_failed"]), "inflight"],
    ["has a failed queue entry", {}, queued("failed"), "attention"],
    ["has unread output and a queued PR", { isUnread: true }, queued("queued"), "attention"],
    ["has a draft PR", {}, pr([], "draft", { runningChecks: 1 }), "attention"],
    ["has a merged PR", {}, pr([], "merged"), "attention"],
    ["has a closed PR", {}, pr([], "closed"), "attention"],
  ])("a thread that %s goes to %s", (_name, overrides, summary, tab) => {
    expect(tabFor(thread(overrides), summary)).toBe(tab);
  });
});
