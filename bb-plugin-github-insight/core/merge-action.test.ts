import { describe, expect, it } from "vitest";
import type { Blocker } from "./blockers";
import { buildMergeAction, type MergeActionInput, type MergeMethod } from "./merge-action";

function only(method: MergeMethod): MergeActionInput["allowedMethods"] {
  return { MERGE: false, SQUASH: false, REBASE: false, [method]: true };
}

function input(overrides: Partial<MergeActionInput> = {}): MergeActionInput {
  return {
    prState: "open",
    blockers: [],
    isMergeQueueEnabled: false,
    defaultMethod: "SQUASH",
    allowedMethods: { MERGE: true, SQUASH: true, REBASE: true },
    ...overrides,
  };
}

describe("buildMergeAction", () => {
  it("merges a ready PR with the default method", () => {
    expect(buildMergeAction(input())).toEqual({ kind: "merge", method: "SQUASH" });
  });

  it.each(["MERGE", "SQUASH", "REBASE"] as const)(
    "merges with the default method %s when the repository allows it",
    (method) => {
      const action = buildMergeAction(
        input({ defaultMethod: method, allowedMethods: only(method) }),
      );

      expect(action).toEqual({ kind: "merge", method });
    },
  );

  it.each(["merged", "closed", "draft"] as const)("gives no action for a %s PR", (prState) => {
    expect(buildMergeAction(input({ prState }))).toEqual({ kind: "none" });
  });

  it("gives no action when the PR has a blocker", () => {
    const blockers: Blocker[] = [{ code: "checks_failed", text: "1 check failed" }];

    expect(buildMergeAction(input({ blockers }))).toEqual({ kind: "none" });
  });

  it("gives no action when the repository does not allow the default method", () => {
    const action = buildMergeAction(
      input({ defaultMethod: "REBASE", allowedMethods: { ...only("MERGE"), SQUASH: true } }),
    );

    expect(action).toEqual({ kind: "none" });
  });

  it("does not merge directly when the base branch has a merge queue", () => {
    expect(buildMergeAction(input({ isMergeQueueEnabled: true }))).toEqual({ kind: "none" });
  });
});
