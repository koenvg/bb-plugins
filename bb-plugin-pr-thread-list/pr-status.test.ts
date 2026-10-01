import { describe, expect, it } from "vitest";
import type { PluginSidebarPullRequest } from "@get-bb/plugin-sdk/app";
import { presentPullRequest } from "./pr-status";
import type { PrInsight } from "./pr-insight";

const pr = (attention: PluginSidebarPullRequest["attention"], state: PluginSidebarPullRequest["state"] = "open"): PluginSidebarPullRequest =>
  ({ number: 42, title: "Ship it", url: "https://example.com/pull/42", state, attention });

const insight = (overrides: Partial<PrInsight> = {}): PrInsight => ({ failedChecks: 0, passedChecks: 0, runningChecks: 0, pendingReviews: 0,
  blockers: [], failedNames: [], pendingNames: [], ...overrides });

const icons = (view: ReturnType<typeof presentPullRequest>) => view.marks.map((mark) => mark.icon);

describe("pull request presentation", () => {
  it.each([
    ["none", "open", "GitPullRequest", [], null, "open"],
    ["draft", "draft", "GitPullRequestDraft", [], null, "draft"],
    ["checks_pending", "open", "GitPullRequest", ["Spinner"], null, "checks running"],
    ["checks_failed", "open", "GitPullRequest", ["CircleX"], "Checks failed", "checks failed"],
    ["review_requested", "open", "GitPullRequest", ["Eye"], null, "awaiting review"],
    ["changes_requested", "open", "GitPullRequest", ["Edit"], "Changes requested", "changes requested"],
    ["conflicts", "open", "GitPullRequest", ["AlertCircle"], "Conflicts", "merge conflicts"],
    ["blocked", "open", "GitPullRequest", ["Lock"], "Blocked", "merge blocked"],
    ["ready_to_merge", "open", "GitPullRequest", [], "Ready", "ready to merge"],
    ["merged", "merged", "GitMerge", [], "Merged", "merged"],
    ["closed", "closed", "GitPullRequestClosed", [], null, "closed"],
  ] as const)("maps %s to its icons and words", (attention, state, lead, marks, word, status) => {
    const view = presentPullRequest(pr(attention, state), null);
    expect(view).toMatchObject({ lead, word, label: `PR #42: ${status}` });
    expect(icons(view)).toEqual(marks);
  });
  it.each([
    ["ready_to_merge", null, "passed", "PR #42: Ship it\nAll checks passed"],
    ["checks_pending", null, "running", "PR #42: Ship it\nChecks running"],
    ["checks_failed", null, "failed", "PR #42: Ship it\nChecks failed"],
    ["blocked", { passedChecks: 4 }, "passed", "PR #42: Ship it\nAll checks passed"],
    ["blocked", { passedChecks: 4, runningChecks: 1 }, "running", "PR #42: Ship it\nChecks running"],
    ["review_requested", { passedChecks: 4, failedChecks: 1 }, "failed", "PR #42: Ship it\nChecks failed"],
    ["ready_to_merge", { failedChecks: 2 }, "passed", "PR #42: Ship it\nAll checks passed"],
    ["blocked", null, "unknown", "PR #42: Ship it"],
    ["none", { passedChecks: 0 }, "unknown", "PR #42: Ship it"],
  ] as const)("colours the PR icon for %s with insight %j as checks %s", (attention, extra, checks, leadTitle) => {
    expect(presentPullRequest(pr(attention), extra && insight(extra))).toMatchObject({ checks, leadTitle });
  });
  it("uses terminal state over stale attention, and does not invent a ready state", () => {
    expect(presentPullRequest(pr("ready_to_merge", "closed"), null).lead).toBe("GitPullRequestClosed");
    expect(presentPullRequest(pr("future" as PluginSidebarPullRequest["attention"]), null).label).toBe("PR #42: open");
  });
  it("shows every reason behind a blocked PR that BB cannot report itself, each with its own tooltip", () => {
    const view = presentPullRequest(pr("blocked"), insight({ blockers: ["behind", "review_required", "checks_running"],
      runningChecks: 6, pendingReviews: 2, pendingNames: ["ana", "core-team (team)"] }));
    expect(view).toMatchObject({ word: null, tone: "waiting",
      label: "PR #42: 6 checks running, 2 reviews pending, branch out of date" });
    expect(view.marks).toEqual([
      { icon: "Spinner", count: 6, spin: true, tone: "waiting", title: "6 checks running" },
      { icon: "Eye", count: 2, spin: false, tone: "waiting", title: "2 reviews pending\nWaiting on: ana, core-team (team)" },
    ]);
    expect(icons(presentPullRequest(pr("blocked"), insight({ blockers: ["unresolved_threads"] })))).toEqual(["MessageSquare"]);
    const behind = presentPullRequest(pr("blocked"), insight({ blockers: ["behind"] }));
    expect(behind).toMatchObject({ word: null, marks: [], label: "PR #42: branch out of date" });
  });
  it("keeps BB's blocked word over reasons BB would have reported itself", () => {
    for (const blocker of ["conflicts", "checks_failed", "changes_requested"] as const) {
      const view = presentPullRequest(pr("blocked"), insight({ blockers: [blocker] }));
      expect(view.word).toBe("Blocked");
      expect(icons(view)).toEqual(["Lock"]);
    }
  });
  it("counts only what matches BB's reason and lists the names", () => {
    const failed = presentPullRequest(pr("checks_failed"), insight({ failedChecks: 2, pendingReviews: 1, failedNames: ["lint", "e2e"] }));
    expect(failed.marks).toEqual([{ icon: "CircleX", count: 2, spin: false, tone: "problem", title: "2 failed checks\nFailed: lint, e2e" }]);
    expect(failed.label).toBe("PR #42: 2 failed checks");
    expect(presentPullRequest(pr("ready_to_merge"), insight({ failedChecks: 2 })).marks).toEqual([]);
  });
});
