import { describe, expect, it } from "vitest";
import recordedHead from "../test/fixtures/pr-43-head.json";
import { changedFilesOf, parsePrHead } from "./pr-head";

describe("parsePrHead", () => {
  it("reads the recorded response", () => {
    expect(parsePrHead(recordedHead)).toEqual({
      prNodeId: "PR_kwDOUoz3mM8AAAABGSCovQ",
      oid: "04b72695435c99fa6191dabebcd37de55730d7c1",
      state: "MERGED",
      viewerIsAuthor: true,
      viewerReview: null,
    });
  });

  it("reads the viewer's latest submitted review", () => {
    const head = parsePrHead(
      withLatestReview({
        state: "APPROVED",
        submittedAt: "2026-10-07T09:00:00Z",
        commit: { oid: "abc123" },
      }),
    );

    expect(head.viewerReview).toEqual({
      state: "APPROVED",
      submittedAt: "2026-10-07T09:00:00Z",
      commitOid: "abc123",
    });
  });

  it("ignores the viewer's pending review", () => {
    const head = parsePrHead(
      withLatestReview({ state: "PENDING", submittedAt: null, commit: { oid: "abc123" } }),
    );

    expect(head.viewerReview).toBeNull();
  });

  it("rejects a response without a pull request", () => {
    expect(() => parsePrHead({ data: { repository: { pullRequest: null } } })).toThrow();
  });
});

function withLatestReview(viewerLatestReview: unknown) {
  const { pullRequest } = recordedHead.data.repository;
  return { data: { repository: { pullRequest: { ...pullRequest, viewerLatestReview } } } };
}

describe("changedFilesOf", () => {
  it("reads the number of changed files", () => {
    expect(changedFilesOf(recordedHead)).toBe(40);
  });

  it("knows no count when the response has none", () => {
    expect(changedFilesOf({ data: { repository: { pullRequest: {} } } })).toBeNull();
  });
});
