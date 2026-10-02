import { describe, expect, it } from "vitest";
import type { LinkedQueuePr, ReviewQueueResult } from "../contract";
import type { QueuePr, ReviewQueue } from "../core/review-queue";
import type { PrResolution } from "../pr-lookup";
import {
  createReviewQueueService,
  type QueueProject,
  type QueueReviewThread,
  type QueueThread,
  type ReviewQueueServiceDeps,
} from "./review-queue-service";

function queuePr(repo: string, number: number): QueuePr {
  return {
    repo,
    number,
    title: `PR ${number}`,
    author: "octocat",
    createdAt: "2026-09-30T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    draft: false,
    ci: "passed",
    reviewDecision: "REVIEW_REQUIRED",
    headRefName: `feature-${number}`,
    url: `https://github.com/${repo}/pull/${number}`,
  };
}

function queueOf(reviewRequests: QueuePr[], myPrs: QueuePr[] = []): ReviewQueue {
  const list = (prs: QueuePr[]) => ({
    groups: prs.map((pr) => ({ repo: pr.repo, prs: [pr] })),
    truncated: false,
  });
  return { reviewRequests: list(reviewRequests), myPrs: list(myPrs) };
}

function project(id: string, gitRemoteUrl: string | null, updatedAt: number, kind: QueueProject["kind"] = "standard"): QueueProject {
  return { id, kind, gitRemoteUrl, updatedAt };
}

function thread(id: string, environmentId: string | null, updatedAt: number, archivedAt: number | null = null): QueueThread {
  return { id, environmentId, updatedAt, archivedAt };
}

function reviewThread(id: string, overrides: Partial<QueueReviewThread> = {}): QueueReviewThread {
  return { id, archivedAt: null, createdAt: 1, updatedAt: 1, status: "active", hasPendingInteraction: false, ...overrides };
}

function reviewPrEntry(repo: string, number: number) {
  return { "review-pr": { v: 1, repo, number, title: `PR ${number}`, url: `https://github.com/${repo}/pull/${number}` } };
}

function metadataOf(byThread: Record<string, unknown>) {
  return async (threadId: string) => byThread[threadId] ?? {};
}

function linkedTo(owner: string, repo: string, number: number): PrResolution {
  return { kind: "pr", target: { ref: { owner, repo, number }, hostId: "host-1", openOnBb: true } };
}

function serviceWith(overrides: Partial<ReviewQueueServiceDeps> = {}) {
  const hostIds: string[] = [];
  const archived: string[] = [];
  const service = createReviewQueueService({
    primaryHostId: async () => "host-1",
    fetchReviewQueue: async (hostId) => {
      hostIds.push(hostId);
      return queueOf([queuePr("Acme/API", 15)]);
    },
    listProjects: async () => [],
    listThreads: async () => [],
    listReviewThreads: async () => [],
    readPluginMetadata: async () => ({}),
    archiveThread: async (threadId) => {
      archived.push(threadId);
    },
    resolveEnvironmentPr: async () => ({ kind: "no_pr" }),
    now: () => 1_000,
    ...overrides,
  });
  return { service, hostIds, archived };
}

function firstReviewRequest(result: ReviewQueueResult): LinkedQueuePr {
  if (result.kind !== "ok") throw new Error(`expected ok, got ${result.message}`);
  return result.reviewRequests.groups[0]!.prs[0]!;
}

describe("review queue service", () => {
  it("fetches the queue on the primary host and stamps the load time", async () => {
    const { service, hostIds } = serviceWith();

    const result = await service.getReviewQueue();

    expect(hostIds).toEqual(["host-1"]);
    expect(result).toMatchObject({ kind: "ok", loadedAt: 1_000 });
  });

  it("lists matching projects most recently updated first", async () => {
    const { service } = serviceWith({
      listProjects: async () => [
        project("prj_old", "https://github.com/acme/api.git", 1),
        project("prj_new", "git@github.com:Acme/API.git", 3),
        project("prj_mid", "https://github.com/ACME/api", 2),
        project("prj_other", "https://github.com/acme/web", 4),
      ],
    });

    const pr = firstReviewRequest(await service.getReviewQueue());

    expect(pr.projectIds).toEqual(["prj_new", "prj_mid", "prj_old"]);
  });

  it("ignores a personal project with a matching remote", async () => {
    const { service } = serviceWith({
      listProjects: async () => [project("prj_personal", "https://github.com/acme/api", 1, "personal")],
    });

    const pr = firstReviewRequest(await service.getReviewQueue());

    expect(pr.projectIds).toEqual([]);
  });

  it("gives no projects and no thread when nothing matches", async () => {
    const { service } = serviceWith({
      listProjects: async () => [project("prj_web", "https://github.com/acme/web", 1), project("prj_none", null, 2)],
      listThreads: async () => [thread("thr_1", "env_1", 1)],
      resolveEnvironmentPr: async () => linkedTo("acme", "api", 99),
    });

    const pr = firstReviewRequest(await service.getReviewQueue());

    expect(pr).toMatchObject({ projectIds: [], threadId: null });
  });

  it("links the most recently updated thread whose PR matches", async () => {
    const { service } = serviceWith({
      listThreads: async () => [thread("thr_old", "env_old", 1), thread("thr_new", "env_new", 2), thread("thr_other", "env_other", 3)],
      resolveEnvironmentPr: async (environmentId) =>
        environmentId === "env_other" ? linkedTo("acme", "api", 16) : linkedTo("acme", "api", 15),
    });

    const pr = firstReviewRequest(await service.getReviewQueue());

    expect(pr.threadId).toBe("thr_new");
  });

  it("links threads on My PRs too", async () => {
    const { service } = serviceWith({
      fetchReviewQueue: async () => queueOf([], [queuePr("acme/api", 15)]),
      listThreads: async () => [thread("thr_1", "env_1", 1)],
      resolveEnvironmentPr: async () => linkedTo("acme", "api", 15),
    });

    const result = await service.getReviewQueue();

    expect(result.kind === "ok" && result.myPrs.groups[0]!.prs[0]!.threadId).toBe("thr_1");
  });

  it("ignores an archived thread", async () => {
    const { service } = serviceWith({
      listThreads: async () => [thread("thr_archived", "env_1", 2, 5)],
      resolveEnvironmentPr: async () => linkedTo("acme", "api", 15),
    });

    const pr = firstReviewRequest(await service.getReviewQueue());

    expect(pr.threadId).toBeNull();
  });

  it("resolves the PR of a shared environment once per refresh", async () => {
    const resolved: string[] = [];
    const { service } = serviceWith({
      listThreads: async () => [thread("thr_1", "env_1", 1), thread("thr_2", "env_1", 2), thread("thr_3", null, 3)],
      resolveEnvironmentPr: async (environmentId) => {
        resolved.push(environmentId);
        return { kind: "no_pr" };
      },
    });

    await service.getReviewQueue();

    expect(resolved).toEqual(["env_1"]);
  });

  it("links the other threads when the PR lookup of one environment fails", async () => {
    const { service } = serviceWith({
      listThreads: async () => [thread("thr_broken", "env_broken", 2), thread("thr_ok", "env_ok", 1)],
      resolveEnvironmentPr: async (environmentId) => {
        if (environmentId === "env_broken") throw new Error("environment not found");
        return linkedTo("acme", "api", 15);
      },
    });

    const pr = firstReviewRequest(await service.getReviewQueue());

    expect(pr.threadId).toBe("thr_ok");
  });

  it("returns the gh failure together with the last good result", async () => {
    let fail = false;
    const { service } = serviceWith({
      fetchReviewQueue: async () => {
        if (fail) throw new Error("gh not logged in");
        return queueOf([queuePr("acme/api", 15)]);
      },
    });
    const good = await service.getReviewQueue();
    fail = true;

    const result = await service.getReviewQueue();

    if (good.kind !== "ok") throw new Error("expected ok");
    const { kind: _kind, ...lastGood } = good;
    expect(result).toEqual({ kind: "error", message: "gh not logged in", lastGood });
  });

  it("returns the gh failure without a last good result before any good load", async () => {
    const { service } = serviceWith({
      fetchReviewQueue: async () => {
        throw new Error("gh not installed");
      },
    });

    expect(await service.getReviewQueue()).toEqual({ kind: "error", message: "gh not installed", lastGood: null });
  });

  it("reports no host available and calls no host without a primary host", async () => {
    const { service, hostIds } = serviceWith({ primaryHostId: async () => null });

    const result = await service.getReviewQueue();

    expect(result).toEqual({ kind: "error", message: "No host available", lastGood: null });
    expect(hostIds).toEqual([]);
  });

  it("links a review thread by its metadata before its agent checks out the PR", async () => {
    const { service } = serviceWith({
      listThreads: async () => [thread("thr_review", "env_review", 1)],
      listReviewThreads: async () => [reviewThread("thr_review")],
      readPluginMetadata: metadataOf({ thr_review: reviewPrEntry("acme/api", 15) }),
    });

    const pr = firstReviewRequest(await service.getReviewQueue());

    expect(pr.threadId).toBe("thr_review");
  });

  it("links the most recently updated thread across PR and metadata links", async () => {
    const { service } = serviceWith({
      listThreads: async () => [thread("thr_branch", "env_branch", 5)],
      listReviewThreads: async () => [reviewThread("thr_review", { updatedAt: 3 })],
      readPluginMetadata: metadataOf({ thr_review: reviewPrEntry("acme/api", 15) }),
      resolveEnvironmentPr: async () => linkedTo("acme", "api", 15),
    });

    const pr = firstReviewRequest(await service.getReviewQueue());

    expect(pr.threadId).toBe("thr_branch");
  });

  it("lists review threads newest first with their PR and status", async () => {
    const { service } = serviceWith({
      listReviewThreads: async () => [
        reviewThread("thr_old", { createdAt: 1, updatedAt: 9, status: "idle" }),
        reviewThread("thr_new", { createdAt: 3, status: "active", hasPendingInteraction: true }),
        reviewThread("thr_mid", { createdAt: 2, status: "error" }),
      ],
      readPluginMetadata: metadataOf({
        thr_old: reviewPrEntry("acme/api", 1),
        thr_new: reviewPrEntry("acme/api", 3),
        thr_mid: reviewPrEntry("acme/web", 2),
      }),
    });

    const result = await service.getReviewQueue();

    if (result.kind !== "ok") throw new Error(result.message);
    expect(result.myReviews).toEqual([
      { threadId: "thr_new", repo: "acme/api", number: 3, title: "PR 3", url: "https://github.com/acme/api/pull/3", status: "needs_you" },
      { threadId: "thr_mid", repo: "acme/web", number: 2, title: "PR 2", url: "https://github.com/acme/web/pull/2", status: "error" },
      { threadId: "thr_old", repo: "acme/api", number: 1, title: "PR 1", url: "https://github.com/acme/api/pull/1", status: "idle" },
    ]);
  });

  it.each([
    ["active", "running"],
    ["starting", "running"],
    ["pending", "running"],
    ["stopping", "running"],
    ["idle", "idle"],
    ["error", "error"],
  ] as const)("shows a %s review thread as %s", async (status, shown) => {
    const { service } = serviceWith({
      listReviewThreads: async () => [reviewThread("thr_review", { status })],
      readPluginMetadata: metadataOf({ thr_review: reviewPrEntry("acme/api", 15) }),
    });

    const result = await service.getReviewQueue();

    expect(result.kind === "ok" && result.myReviews.map((review) => review.status)).toEqual([shown]);
  });

  it("leaves archived threads and threads without valid metadata out of My reviews", async () => {
    const { service } = serviceWith({
      listThreads: async () => [thread("thr_archived", "env_1", 1, 5)],
      listReviewThreads: async () => [
        reviewThread("thr_archived", { archivedAt: 5 }),
        reviewThread("thr_plain"),
        reviewThread("thr_v2"),
        reviewThread("thr_broken"),
      ],
      readPluginMetadata: async (threadId) => {
        if (threadId === "thr_broken") throw new Error("thread not found");
        if (threadId === "thr_v2") return { "review-pr": { ...reviewPrEntry("acme/api", 15)["review-pr"], v: 2 } };
        if (threadId === "thr_archived") return reviewPrEntry("acme/api", 15);
        return {};
      },
    });

    const result = await service.getReviewQueue();

    if (result.kind !== "ok") throw new Error(result.message);
    expect(result.myReviews).toEqual([]);
    expect(result.reviewRequests.groups[0]!.prs[0]!.threadId).toBeNull();
  });

  it("keeps a review thread in My reviews after its PR leaves the review requests", async () => {
    const { service } = serviceWith({
      fetchReviewQueue: async () => queueOf([]),
      listReviewThreads: async () => [reviewThread("thr_review")],
      readPluginMetadata: metadataOf({ thr_review: reviewPrEntry("acme/api", 15) }),
    });

    const result = await service.getReviewQueue();

    expect(result.kind === "ok" && result.myReviews.map((review) => review.threadId)).toEqual(["thr_review"]);
  });
});

describe("archiveReview", () => {
  it("archives a thread with review-pr metadata", async () => {
    const { service, archived } = serviceWith({
      readPluginMetadata: metadataOf({ thr_review: reviewPrEntry("acme/api", 15) }),
    });

    expect(await service.archiveReview("thr_review")).toEqual({ kind: "ok" });
    expect(archived).toEqual(["thr_review"]);
  });

  it("refuses a thread without review-pr metadata", async () => {
    const { service, archived } = serviceWith({
      readPluginMetadata: metadataOf({ thr_other: { prSummary: {} } }),
    });

    expect(await service.archiveReview("thr_other")).toEqual({
      kind: "error",
      message: "This thread is not a review thread",
    });
    expect(archived).toEqual([]);
  });

  it("reports a failed archive", async () => {
    const { service } = serviceWith({
      readPluginMetadata: metadataOf({ thr_review: reviewPrEntry("acme/api", 15) }),
      archiveThread: async () => {
        throw new Error("thread not found");
      },
    });

    expect(await service.archiveReview("thr_review")).toEqual({ kind: "error", message: "thread not found" });
  });
});
