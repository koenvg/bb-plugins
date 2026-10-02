import { describe, expect, it } from "vitest";
import type { LinkedQueuePr, ReviewQueueResult } from "../contract";
import type { QueuePr, ReviewQueue } from "../core/review-queue";
import type { PrResolution } from "../pr-lookup";
import {
  createReviewQueueService,
  type QueueProject,
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

function linkedTo(owner: string, repo: string, number: number): PrResolution {
  return { kind: "pr", target: { ref: { owner, repo, number }, hostId: "host-1", openOnBb: true } };
}

function serviceWith(overrides: Partial<ReviewQueueServiceDeps> = {}) {
  const hostIds: string[] = [];
  const service = createReviewQueueService({
    primaryHostId: async () => "host-1",
    fetchReviewQueue: async (hostId) => {
      hostIds.push(hostId);
      return queueOf([queuePr("Acme/API", 15)]);
    },
    listProjects: async () => [],
    listThreads: async () => [],
    resolveEnvironmentPr: async () => ({ kind: "no_pr" }),
    now: () => 1_000,
    ...overrides,
  });
  return { service, hostIds };
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
});
