import { describe, expect, it } from "vitest";
import type { PrInsight } from "../core/overview";
import { GhFailureError } from "../github/gh-failure";
import type { CachedPr } from "../refresh/insight-service";
import { createMergeWrites } from "./merge-writes";

const target = { ref: { owner: "o", repo: "r", number: 7 }, hostId: "host-1", openOnBb: true };
const HEAD = "2c850077d3529aa67c8178c80d09517377124ea9";

const insight: PrInsight = {
  pr: { number: 7, title: "t", state: "open", url: "https://github.com/o/r/pull/7", headOid: HEAD },
  mergeAction: { kind: "merge", method: "REBASE" },
  blockers: [],
  reviewers: [],
  checks: [],
  mergeQueue: null,
};

const cached: CachedPr = { kind: "cached", target, insight, pullRequestId: "PR_7" };

type Deps = Parameters<typeof createMergeWrites>[0];

function writesWith(overrides: Partial<Deps> = {}) {
  const merges: unknown[][] = [];
  const enqueues: unknown[][] = [];
  const refreshed: string[] = [];
  const warnings: string[] = [];
  const writes = createMergeWrites({
    cachedPr: async () => cached,
    mergePullRequest: async (...args) => {
      merges.push(args);
      return { data: {} };
    },
    enqueuePullRequest: async (...args) => {
      enqueues.push(args);
      return { data: {} };
    },
    refreshAfterWrite: async (threadId) => {
      refreshed.push(threadId);
    },
    warn: (message) => warnings.push(message),
    ...overrides,
  });
  return { writes, merges, enqueues, refreshed, warnings };
}

const request = { threadId: "thr_1", action: "merge", expectedHeadOid: HEAD } as const;

describe("runMergeAction", () => {
  it("merges with the cached PR id and method and the head commit the tab showed", async () => {
    const { writes, merges, refreshed } = writesWith();

    const result = await writes.runMergeAction(request);

    expect(result).toEqual({ kind: "ok" });
    expect(merges).toEqual([
      [target, { pullRequestId: "PR_7", mergeMethod: "REBASE", expectedHeadOid: HEAD }],
    ]);
    expect(refreshed).toEqual(["thr_1"]);
  });

  it("enqueues with the cached PR id and the head commit the tab showed", async () => {
    const { writes, merges, enqueues, refreshed } = writesWith({
      cachedPr: async () => ({
        ...cached,
        insight: { ...insight, mergeAction: { kind: "enqueue" } },
      }),
    });

    const result = await writes.runMergeAction({ ...request, action: "enqueue" });

    expect(result).toEqual({ kind: "ok" });
    expect(enqueues).toEqual([[target, { pullRequestId: "PR_7", expectedHeadOid: HEAD }]]);
    expect(merges).toEqual([]);
    expect(refreshed).toEqual(["thr_1"]);
  });

  it("does not enqueue when the cached PR offers a merge", async () => {
    const { writes, merges, enqueues } = writesWith();

    const result = await writes.runMergeAction({ ...request, action: "enqueue" });

    expect(result).toEqual({ kind: "error", message: "The PR changed. Refresh and try again." });
    expect(enqueues).toEqual([]);
    expect(merges).toEqual([]);
  });

  it("does not enqueue a PR that is already queued", async () => {
    const { writes, enqueues } = writesWith({
      cachedPr: async () => ({
        ...cached,
        insight: { ...insight, mergeAction: { kind: "queued" } },
      }),
    });

    const result = await writes.runMergeAction({ ...request, action: "enqueue" });

    expect(result).toEqual({ kind: "error", message: "The PR changed. Refresh and try again." });
    expect(enqueues).toEqual([]);
  });

  it.each<[CachedPr, string]>([
    [{ kind: "no_pr" }, "No pull request for this thread"],
    [{ kind: "error", message: "bb is down" }, "bb is down"],
    [{ kind: "not_cached" }, "Refresh the PR and try again."],
  ])("does not merge when the PR is %j", async (cachedPr, message) => {
    const { writes, merges } = writesWith({ cachedPr: async () => cachedPr });

    expect(await writes.runMergeAction(request)).toEqual({ kind: "error", message });
    expect(merges).toEqual([]);
  });

  it("does not merge when the cached PR offers no merge", async () => {
    const { writes, merges } = writesWith({
      cachedPr: async () => ({ ...cached, insight: { ...insight, mergeAction: { kind: "none" } } }),
    });

    const result = await writes.runMergeAction(request);

    expect(result).toEqual({ kind: "error", message: "The PR changed. Refresh and try again." });
    expect(merges).toEqual([]);
  });

  it("does not merge when the cached head commit differs from the one the tab showed", async () => {
    const { writes, merges } = writesWith();

    const result = await writes.runMergeAction({ ...request, expectedHeadOid: "0000000" });

    expect(result).toEqual({ kind: "error", message: "The PR changed. Refresh and try again." });
    expect(merges).toEqual([]);
  });

  it("gives the GitHub error text and does not refresh when GitHub rejects the merge", async () => {
    const { writes, refreshed } = writesWith({
      mergePullRequest: async () => {
        throw new GhFailureError({ kind: "failed", message: "Head branch was modified" });
      },
    });

    const result = await writes.runMergeAction(request);

    expect(result).toEqual({ kind: "error", message: "Head branch was modified" });
    expect(refreshed).toEqual([]);
  });

  it("reports the merge as done and only warns when the refresh after it fails", async () => {
    const { writes, warnings } = writesWith({
      refreshAfterWrite: async () => {
        throw new Error("host gone");
      },
    });

    expect(await writes.runMergeAction(request)).toEqual({ kind: "ok" });
    expect(warnings).toEqual([
      "Could not refresh the PR insight of thread thr_1: Error: host gone",
    ]);
  });
});
