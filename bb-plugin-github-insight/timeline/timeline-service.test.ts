import { describe, expect, it } from "vitest";
import timelines from "../test/fixtures/pr-timelines.json";
import { createMediaSigner } from "../core/signed-media";
import { GhFailureError } from "../github/gh-failure";
import { ATTACHMENT_BODY, ATTACHMENT_HTML, SIGNED_ATTACHMENT_URL } from "../test/attachment";
import type { PrResolution } from "../pr-lookup";
import { createTimelineService } from "./timeline-service";

const target = {
  ref: { owner: "cli", repo: "cli", number: 14578 },
  hostId: "host-1",
  openOnBb: true,
};

type Deps = Parameters<typeof createTimelineService>[0];

function serviceWith(overrides: Partial<Deps> = {}) {
  const pages: unknown[] = [];
  const comments: unknown[] = [];
  const published: unknown[] = [];
  const clock = { now: 0 };
  const service = createTimelineService({
    publish: (update) => published.push(update),
    now: () => clock.now,
    resolvePr: async (): Promise<PrResolution> => ({ kind: "pr", target }),
    fetchTimelinePage: async (prTarget, before) => {
      pages.push([prTarget, before]);
      return timelines["cli-14578"];
    },
    addComment: async (prTarget, request) => {
      comments.push([prTarget, request]);
      return { data: {} };
    },
    newCommentBasis: async () => ({ markedAt: null, seen: new Set<string>() }),
    signMedia: (markdown) => markdown,
    ...overrides,
  });
  return { service, pages, comments, published, clock };
}

function withoutLastReply() {
  const page = structuredClone(timelines["cli-14578"]);
  const { timelineItems } = page.data.repository.pullRequest;
  timelineItems.nodes = timelineItems.nodes.filter(
    (node) => node.id !== "IC_kwDODKw3uc8AAAABaMAhXA",
  );
  return page;
}

const rateLimited = new GhFailureError({ kind: "rate_limited", resetAt: null });

describe("timeline service", () => {
  it("reads the newest page of the thread's PR", async () => {
    const { service, pages } = serviceWith();

    const result = await service.getTimeline("thr_1", null);

    expect(pages).toEqual([[target, null]]);
    expect(result).toMatchObject({ kind: "ok", olderCursor: null, locked: false });
    expect(result.kind === "ok" && result.events.at(-1)?.kind).toBe("merged");
  });

  it("shows the description and comments with the signed URLs of their attachments", async () => {
    const page = structuredClone(timelines["cli-14578"]);
    const { pullRequest } = page.data.repository;
    Object.assign(pullRequest, { body: ATTACHMENT_BODY, bodyHTML: ATTACHMENT_HTML });
    for (const node of pullRequest.timelineItems.nodes) {
      if (node.__typename === "IssueComment") {
        Object.assign(node, { body: ATTACHMENT_BODY, bodyHTML: ATTACHMENT_HTML });
      }
    }
    const { service } = serviceWith({
      fetchTimelinePage: async () => page,
      signMedia: createMediaSigner(Date.now),
    });

    const result = await service.getTimeline("thr_1", null);

    if (result.kind !== "ok") {
      throw new Error(`expected ok, got ${result.kind}`);
    }
    const signedBody = `![shot](${SIGNED_ATTACHMENT_URL})`;
    expect(result.description.body).toBe(signedBody);
    expect(result.events.find((event) => event.kind === "comment")).toMatchObject({
      body: signedBody,
    });
  });

  it("returns the PR comments from other people after the mark as new", async () => {
    const { service } = serviceWith({
      newCommentBasis: async () => ({
        markedAt: Date.parse("2026-10-06T00:00:00Z"),
        seen: new Set(["IC_kwDODKw3uc8AAAABaFQoVw"]),
      }),
    });

    const result = await service.getTimeline("thr_1", null);

    expect(result).toMatchObject({ kind: "ok", newCommentIds: ["IC_kwDODKw3uc8AAAABZwikEw"] });
    expect(result).not.toHaveProperty("othersComments");
  });

  it("returns no new comments on another person's PR with no mark", async () => {
    const page = structuredClone(timelines["cli-14578"]);
    page.data.viewer.login = "me";
    const { service } = serviceWith({ fetchTimelinePage: async () => page });

    expect(await service.getTimeline("thr_1", null)).toMatchObject({ newCommentIds: [] });
  });

  it("returns no new comments on your own PR when you replied after them", async () => {
    const { service } = serviceWith();

    expect(await service.getTimeline("thr_1", null)).toMatchObject({ newCommentIds: [] });
  });

  it("returns the PR comments from other people after your last reply on your own PR", async () => {
    const { service } = serviceWith({ fetchTimelinePage: async () => withoutLastReply() });

    expect(await service.getTimeline("thr_1", null)).toMatchObject({
      newCommentIds: ["IC_kwDODKw3uc8AAAABaFQoVw"],
    });
  });

  it("counts your submitted review as a reply on your own PR", async () => {
    const page = withoutLastReply();
    for (const node of page.data.repository.pullRequest.timelineItems.nodes) {
      if (node.id === "PRR_kwDODKw3uc8AAAABRK-09w") {
        Object.assign(node, { author: { __typename: "User", login: "williammartin" } });
      }
    }
    const { service } = serviceWith({ fetchTimelinePage: async () => page });

    expect(await service.getTimeline("thr_1", null)).toMatchObject({ newCommentIds: [] });
  });

  it("skips a seen comment on your own PR", async () => {
    const { service } = serviceWith({
      fetchTimelinePage: async () => withoutLastReply(),
      newCommentBasis: async () => ({
        markedAt: null,
        seen: new Set(["IC_kwDODKw3uc8AAAABaFQoVw"]),
      }),
    });

    expect(await service.getTimeline("thr_1", null)).toMatchObject({ newCommentIds: [] });
  });

  it("passes the cursor for older events", async () => {
    const { service, pages } = serviceWith();

    await service.getTimeline("thr_1", "Y3Vy");

    expect(pages).toEqual([[target, "Y3Vy"]]);
  });

  it.each([
    [{ kind: "no_pr" }, { kind: "no_pr" }],
    [
      { kind: "error", message: "no remote" },
      { kind: "error", message: "no remote" },
    ],
  ] as const)("returns %o from the PR lookup as %o", async (resolution, expected) => {
    const { service, pages } = serviceWith({ resolvePr: async () => resolution });

    expect(await service.getTimeline("thr_1", null)).toEqual(expected);
    expect(pages).toEqual([]);
  });

  it("returns a GitHub failure as an error", async () => {
    const { service } = serviceWith({
      fetchTimelinePage: async () => {
        throw rateLimited;
      },
    });

    expect(await service.getTimeline("thr_1", null)).toEqual({
      kind: "error",
      message: expect.stringMatching(/rate limit/i),
    });
  });

  it("posts one comment on the PR node", async () => {
    const { service, comments } = serviceWith();

    const result = await service.addPrComment({
      threadId: "thr_1",
      prNodeId: "PR_1",
      body: "Thanks, fixed",
    });

    expect(result).toEqual({ kind: "ok" });
    expect(comments).toEqual([[target, { subjectId: "PR_1", body: "Thanks, fixed" }]]);
  });

  it("returns a GitHub rejection of a comment as an error", async () => {
    const { service } = serviceWith({
      addComment: async () => {
        throw rateLimited;
      },
    });

    expect(
      await service.addPrComment({ threadId: "thr_1", prNodeId: "PR_1", body: "Thanks" }),
    ).toEqual({ kind: "error", message: expect.stringMatching(/rate limit/i) });
  });

  it("posts nothing for a thread without a PR", async () => {
    const { service, comments } = serviceWith({ resolvePr: async () => ({ kind: "no_pr" }) });

    expect(
      await service.addPrComment({ threadId: "thr_1", prNodeId: "PR_1", body: "Thanks" }),
    ).toEqual({ kind: "error", message: "No pull request for this thread" });
    expect(comments).toEqual([]);
  });

  describe("newest page cache", () => {
    function changingTimeline() {
      let current: unknown = timelines["cli-14578"];
      const reads: (string | null)[] = [];
      const deps = serviceWith({
        fetchTimelinePage: async (_target, before) => {
          reads.push(before);
          return current;
        },
      });
      return { ...deps, reads, change: () => (current = withoutLastReply()) };
    }

    async function settle() {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    it("returns the stored page within a minute without a GitHub read", async () => {
      const { service, reads, clock } = changingTimeline();
      await service.getTimeline("thr_1", null);
      clock.now = 59_999;

      await service.getTimeline("thr_1", null);
      await settle();

      expect(reads).toEqual([null]);
    });

    it("returns the stored page at once after a minute and tells viewers when GitHub changed", async () => {
      const { service, reads, clock, change, published } = changingTimeline();
      const first = await service.getTimeline("thr_1", null);
      change();
      clock.now = 60_000;

      const second = await service.getTimeline("thr_1", null);
      await settle();
      const third = await service.getTimeline("thr_1", null);

      expect(second).toEqual(first);
      expect(reads).toEqual([null, null]);
      expect(published).toEqual([{ threadId: "thr_1" }]);
      expect(third).not.toEqual(first);
    });

    it("tells no one when the page read again is the same", async () => {
      const { service, reads, clock, published } = changingTimeline();
      await service.getTimeline("thr_1", null);
      clock.now = 60_000;

      await service.getTimeline("thr_1", null);
      await settle();

      expect(reads).toEqual([null, null]);
      expect(published).toEqual([]);
    });

    it("reads GitHub for a fresh read even when the stored page is new", async () => {
      const { service, reads, change } = changingTimeline();
      const first = await service.getTimeline("thr_1", null);
      change();

      const fresh = await service.getTimeline("thr_1", null, true);

      expect(reads).toEqual([null, null]);
      expect(fresh).not.toEqual(first);
    });

    it("always reads older pages from GitHub", async () => {
      const { service, reads } = changingTimeline();

      await service.getTimeline("thr_1", "cursor");
      await service.getTimeline("thr_1", "cursor");

      expect(reads).toEqual(["cursor", "cursor"]);
    });

    it("shares one GitHub read between a prefetch and the first load", async () => {
      const { service, reads } = changingTimeline();

      await Promise.all([service.prefetch("thr_1"), service.getTimeline("thr_1", null)]);
      await settle();

      expect(reads).toEqual([null]);
    });
  });
});
