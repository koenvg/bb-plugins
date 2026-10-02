import { describe, expect, it } from "vitest";
import fixture from "../test/fixtures/review-queue.json";
import { parseGithubRepo, parseReviewQueue, type QueueList, type QueuePr } from "./review-queue";

function prs(list: QueueList): QueuePr[] {
  return list.groups.flatMap((group) => group.prs);
}

function byNumber(list: QueueList, number: number): QueuePr {
  return prs(list).find((pr) => pr.number === number)!;
}

describe("parseGithubRepo", () => {
  it.each([
    ["https://github.com/acme/api", "acme/api"],
    ["https://github.com/acme/api.git", "acme/api"],
    ["https://token@github.com/acme/api.git", "acme/api"],
    ["git@github.com:acme/api.git", "acme/api"],
    ["ssh://git@github.com/acme/api.git", "acme/api"],
    ["git@github.com:Acme/API.git", "acme/api"],
    ["HTTPS://GitHub.com/Acme/API/", "acme/api"],
  ])("reads %s as %s", (remote, repo) => {
    expect(parseGithubRepo(remote)).toBe(repo);
  });

  it.each([
    "https://gitlab.com/acme/api.git",
    "git@bitbucket.org:acme/api.git",
    "https://github.com/acme",
    "not a url",
  ])("returns null for %s", (remote) => {
    expect(parseGithubRepo(remote)).toBeNull();
  });

  it("returns null for a null remote", () => {
    expect(parseGithubRepo(null)).toBeNull();
  });
});

describe("parseReviewQueue", () => {
  const queue = parseReviewQueue(fixture);

  it("maps a node to a QueuePr", () => {
    expect(byNumber(queue.reviewRequests, 12)).toEqual({
      repo: "acme/api",
      number: 12,
      title: "Add retries",
      author: "alice",
      createdAt: "2026-09-30T08:00:00Z",
      updatedAt: "2026-10-02T09:00:00Z",
      draft: false,
      ci: "passed",
      reviewDecision: "REVIEW_REQUIRED",
      headRefName: "alice/retries",
      url: "https://github.com/acme/api/pull/12",
    });
  });

  it.each([
    [12, "passed"],
    [7, "failed"],
    [15, "running"],
  ] as const)("maps the CI state of #%i to %s", (number, ci) => {
    expect(byNumber(queue.reviewRequests, number).ci).toBe(ci);
  });

  it("maps a missing status rollup to no CI state", () => {
    expect(byNumber(queue.myPrs, 3).ci).toBe("none");
  });

  it.each([
    [12, "REVIEW_REQUIRED"],
    [7, "CHANGES_REQUESTED"],
    [15, "APPROVED"],
  ] as const)("keeps the review decision of #%i", (number, decision) => {
    expect(byNumber(queue.reviewRequests, number).reviewDecision).toBe(decision);
  });

  it("keeps a missing review decision as null", () => {
    expect(byNumber(queue.myPrs, 3).reviewDecision).toBeNull();
  });

  it("marks drafts", () => {
    expect(byNumber(queue.reviewRequests, 7).draft).toBe(true);
    expect(byNumber(queue.reviewRequests, 12).draft).toBe(false);
  });

  it("maps a deleted author to null", () => {
    expect(byNumber(queue.reviewRequests, 15).author).toBeNull();
  });

  it("orders groups by repo and PRs inside a group newest update first", () => {
    expect(
      queue.reviewRequests.groups.map((group) => [group.repo, group.prs.map((pr) => pr.number)]),
    ).toEqual([
      ["acme/api", [15, 12]],
      ["acme/web", [7]],
    ]);
  });

  it("flags a list as truncated only when GitHub reports more than 50", () => {
    expect(queue.reviewRequests.truncated).toBe(false);
    expect(queue.myPrs.truncated).toBe(true);
  });

  it("flags 50 results as complete", () => {
    const fifty = { data: { ...fixture.data, myPrs: { ...fixture.data.myPrs, issueCount: 50 } } };

    expect(parseReviewQueue(fifty).myPrs.truncated).toBe(false);
  });

  it("rejects a response without both searches", () => {
    expect(() => parseReviewQueue({ data: { reviewRequests: fixture.data.reviewRequests } })).toThrow();
  });
});
