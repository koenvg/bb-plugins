import type {
  ActionResult,
  AddCommentRequest,
  AddPrCommentRequest,
  TimelineResult,
} from "../contract";
import { newCommentIds } from "../core/new-comments";
import { prKey } from "../core/pr-ref";
import type { PullRequestRef } from "../core/pr-ref";
import type { ReviewUpdated } from "../core/review-updated";
import type { SignMedia } from "../core/signed-media";
import { parseTimelinePage } from "../core/timeline";
import { GhFailureError, ghFailureText } from "../github/gh-failure";
import { write } from "../github/gh-write";
import type { PrResolution, PrTarget } from "../pr-lookup";
import { createReadCache } from "../refresh/read-cache";

interface TimelineServiceDeps {
  resolvePr: (threadId: string) => Promise<PrResolution>;
  fetchTimelinePage: (target: PrTarget, before: string | null) => Promise<unknown>;
  addComment: (target: PrTarget, request: AddCommentRequest) => Promise<unknown>;
  newCommentBasis: (pr: PullRequestRef) => Promise<{ markedAt: number | null; seen: Set<string> }>;
  signMedia: SignMedia;
  publish: (update: ReviewUpdated) => void;
  now: () => number;
}

const unsigned: SignMedia = (markdown) => markdown;

function sameTimeline(a: unknown, b: unknown): boolean {
  return (
    JSON.stringify(parseTimelinePage(a, unsigned)) ===
    JSON.stringify(parseTimelinePage(b, unsigned))
  );
}

export function createTimelineService(deps: TimelineServiceDeps) {
  const newestPages = createReadCache<unknown>({ now: deps.now, sameData: sameTimeline });
  const viewers = new Map<string, Set<string>>();

  function revalidate(target: PrTarget, threadId: string): void {
    const key = prKey(target.ref);
    const known = viewers.get(key) ?? new Set<string>();
    viewers.set(key, known.add(threadId));
    if (newestPages.isFresh(key)) {
      return;
    }
    void newestPages
      .shared(key, () => deps.fetchTimelinePage(target, null))
      .then(({ changed }) => {
        if (changed) {
          for (const viewer of known) {
            deps.publish({ threadId: viewer });
          }
        }
      })
      .catch(() => {});
  }

  async function readPage(
    threadId: string,
    target: PrTarget,
    before: string | null,
    fresh: boolean,
  ): Promise<unknown> {
    if (before !== null) {
      return deps.fetchTimelinePage(target, before);
    }
    const key = prKey(target.ref);
    const read = () => deps.fetchTimelinePage(target, null);
    if (fresh) {
      return (await newestPages.fetch(key, read)).value;
    }
    const cached = newestPages.peek(key);
    if (cached === null) {
      return (await newestPages.shared(key, read)).value;
    }
    revalidate(target, threadId);
    return cached;
  }

  async function getTimeline(
    threadId: string,
    before: string | null,
    fresh = false,
  ): Promise<TimelineResult> {
    const resolution = await deps.resolvePr(threadId);
    if (resolution.kind !== "pr") {
      return resolution;
    }
    try {
      const [{ othersComments, ownPrRepliedAt, ...page }, { markedAt, seen }] = await Promise.all([
        readPage(threadId, resolution.target, before, fresh).then((response) =>
          parseTimelinePage(response, deps.signMedia),
        ),
        deps.newCommentBasis(resolution.target.ref),
      ]);
      return {
        kind: "ok",
        ...page,
        newCommentIds: newCommentIds(othersComments, markedAt ?? ownPrRepliedAt, seen),
      };
    } catch (error) {
      if (error instanceof GhFailureError) {
        return { kind: "error", message: ghFailureText(error.failure) };
      }
      throw error;
    }
  }

  async function prefetch(threadId: string): Promise<void> {
    const resolution = await deps.resolvePr(threadId);
    if (resolution.kind === "pr") {
      revalidate(resolution.target, threadId);
    }
  }

  async function addPrComment({
    threadId,
    prNodeId,
    body,
  }: AddPrCommentRequest): Promise<ActionResult> {
    const resolution = await deps.resolvePr(threadId);
    if (resolution.kind === "no_pr") {
      return { kind: "error", message: "No pull request for this thread" };
    }
    if (resolution.kind === "error") {
      return resolution;
    }
    const posted = await write(() =>
      deps.addComment(resolution.target, { subjectId: prNodeId, body }),
    );
    return posted.ok ? { kind: "ok" } : { kind: "error", message: posted.message };
  }

  return { getTimeline, prefetch, addPrComment };
}
