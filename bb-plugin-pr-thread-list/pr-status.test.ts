import { describe, expect, it } from "vitest";
import { presentPullRequest } from "./pr-status";
import type { BlockerCode, PrState, PrSummary } from "./pr-insight";

const pr = (state: PrState, blockers: BlockerCode[] = [], overrides: Partial<PrSummary> = {}): PrSummary => ({
  number: 42, url: "https://example.com/pull/42", state,
  failedChecks: 0, passedChecks: 0, runningChecks: 0, pendingReviews: 0,
  blockers, failedNames: [], pendingNames: [], ...overrides,
});

const icons = (view: ReturnType<typeof presentPullRequest>) => view.marks.map((mark) => mark.icon);

describe("pull request presentation", () => {
  it.each([
    ["draft", [], "GitPullRequestDraft", [], null, "draft"],
    ["open", ["behind"], "GitPullRequest", [], null, "branch out of date"],
    ["open", ["checks_running"], "GitPullRequest", ["Spinner"], null, "checks running"],
    ["open", ["checks_failed"], "GitPullRequest", ["CircleX"], "Checks failed", "checks failed"],
    ["open", ["review_required"], "GitPullRequest", ["Eye"], null, "awaiting review"],
    ["open", ["changes_requested"], "GitPullRequest", ["Edit"], "Changes requested", "changes requested"],
    ["open", ["unresolved_threads"], "GitPullRequest", ["MessageSquare"], null, "unresolved comments"],
    ["open", ["conflicts"], "GitPullRequest", ["AlertCircle"], "Conflicts", "merge conflicts"],
    ["open", ["blocked"], "GitPullRequest", ["Lock"], "Blocked", "merge blocked"],
    ["open", [], "GitPullRequest", [], "Ready", "ready to merge"],
    ["merged", [], "GitMerge", [], "Merged", "merged"],
    ["closed", [], "GitPullRequestClosed", [], null, "closed"],
  ] as const)("maps %s with blockers %j to its icons and words", (state, blockers, lead, marks, word, status) => {
    const view = presentPullRequest(pr(state, [...blockers]));
    expect(view).toMatchObject({ lead, word, label: `PR #42: ${status}` });
    expect(icons(view)).toEqual(marks);
  });
  it.each([
    [{ passedChecks: 4 }, "passed", "PR #42\nAll checks passed"],
    [{ passedChecks: 4, runningChecks: 1 }, "running", "PR #42\nChecks running"],
    [{ passedChecks: 4, failedChecks: 1 }, "failed", "PR #42\nChecks failed"],
    [{}, "unknown", "PR #42"],
  ] as const)("colours the PR icon for counts %j as checks %s", (counts, checks, leadTitle) => {
    expect(presentPullRequest(pr("open", [], counts))).toMatchObject({ checks, leadTitle });
  });
  it("does not colour checks for a merged or closed PR", () => {
    expect(presentPullRequest(pr("merged", [], { failedChecks: 2 })).checks).toBe("unknown");
    expect(presentPullRequest(pr("closed", ["checks_failed"])).lead).toBe("GitPullRequestClosed");
  });
  it("shows every blocker, problems first, each with its own tooltip", () => {
    const view = presentPullRequest(pr("open", ["behind", "review_required", "checks_running", "conflicts"],
      { runningChecks: 6, pendingReviews: 2, pendingNames: ["ana", "core-team (team)"] }));
    expect(view).toMatchObject({ word: "Conflicts", tone: "problem",
      label: "PR #42: merge conflicts, 6 checks running, 2 reviews pending, branch out of date" });
    expect(view.marks).toEqual([
      { icon: "AlertCircle", count: null, spin: false, tone: "problem", title: "Merge conflicts" },
      { icon: "Spinner", count: 6, spin: true, tone: "waiting", title: "6 checks running" },
      { icon: "Eye", count: 2, spin: false, tone: "waiting", title: "2 reviews pending\nWaiting on: ana, core-team (team)" },
    ]);
  });
  it("counts failed checks and lists their names", () => {
    const failed = presentPullRequest(pr("open", ["checks_failed"], { failedChecks: 2, failedNames: ["lint", "e2e"] }));
    expect(failed.marks).toEqual([{ icon: "CircleX", count: 2, spin: false, tone: "problem", title: "2 failed checks\nFailed: lint, e2e" }]);
    expect(failed.label).toBe("PR #42: 2 failed checks");
  });
});
