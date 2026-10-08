import type {
  ActionResult,
  ReviewDrafts,
  SendToAgentResult,
  UpdateViewedRequest,
} from "../contract";
import { buildAgentPrompt } from "../core/agent-prompt";
import type { Draft, Drafts } from "../core/drafts";
import { parsePrFiles, type ReviewFile } from "../core/pr-files";
import { parsePrHead, type PrHead } from "../core/pr-head";
import { prKey, type PullRequestRef } from "../core/pr-ref";
import type { CommentDraft, ListedCommentDraft, SummaryDraft } from "../core/review-drafts";
import { collectReviewThreads, type CollectedReviewThreads } from "../core/review-threads";
import type { ReviewUpdated } from "../core/review-updated";
import { openThreads, placeThreads, type ThreadPlacement } from "../core/thread-placement";
import type { ViewedMarks } from "../core/viewed-marks";
import { GhFailureError, ghFailureText } from "../github/gh-failure";
import type { PrResolution, PrTarget } from "../pr-lookup";
import type { DraftStore } from "./draft-store";
import type { ViewedMarksStore } from "./viewed-marks-store";

export interface PrReview extends ReviewDrafts {
  head: PrHead;
  files: ReviewFile[];
  threads: ThreadPlacement;
  viewedMarks: ViewedMarks;
}

export interface ReviewBasis {
  head: PrHead;
  files: ReviewFile[];
  commentDrafts: ListedCommentDraft[];
}

type PrLoad<T> =
  | { kind: "no_pr" }
  | { kind: "error"; message: string }
  | ({ kind: "ok"; target: PrTarget } & T);

export type ReviewLoad = PrLoad<{ allThreadsRead: boolean; review: PrReview }>;
export type DraftsLoad = PrLoad<{ drafts: ReviewDrafts }>;
export type BasisLoad = PrLoad<{ basis: ReviewBasis }>;

interface LoadedPr {
  head: PrHead;
  files: ReviewFile[];
  collected: CollectedReviewThreads;
}

interface ReviewServiceDeps {
  resolvePr(threadId: string): Promise<PrResolution>;
  fetchPrFiles(target: PrTarget): Promise<unknown>;
  fetchReviewThreadsPage(target: PrTarget, after: string | null): Promise<unknown>;
  fetchPrHead(target: PrTarget): Promise<unknown>;
  drafts: DraftStore;
  viewed: ViewedMarksStore;
  publishDrafts(update: ReviewUpdated): void;
  sendMessage(threadId: string, text: string): Promise<"sent" | "queued">;
}

export type ReviewService = ReturnType<typeof createReviewService>;

export function createReviewService(deps: ReviewServiceDeps) {
  const loadedPrs = new Map<string, LoadedPr>();

  async function withPr<T>(
    threadId: string,
    read: (target: PrTarget) => Promise<T>,
  ): Promise<PrLoad<T>> {
    const resolution = await deps.resolvePr(threadId);
    if (resolution.kind !== "pr") return resolution;
    try {
      return { kind: "ok", target: resolution.target, ...(await read(resolution.target)) };
    } catch (error) {
      if (error instanceof GhFailureError) {
        return { kind: "error", message: ghFailureText(error.failure) };
      }
      throw error;
    }
  }

  async function fetchPr(target: PrTarget): Promise<LoadedPr> {
    const [files, collected, head] = await Promise.all([
      deps.fetchPrFiles(target).then(parsePrFiles),
      collectReviewThreads((after) => deps.fetchReviewThreadsPage(target, after)),
      deps.fetchPrHead(target).then(parsePrHead),
    ]);
    const loaded = { head, files, collected };
    loadedPrs.set(prKey(target.ref), loaded);
    return loaded;
  }

  async function loadedPr(target: PrTarget): Promise<LoadedPr> {
    return loadedPrs.get(prKey(target.ref)) ?? fetchPr(target);
  }

  async function readDrafts(pr: PullRequestRef, replyDrafts: Promise<Drafts>) {
    const [drafts, commentDrafts, summaryDraft] = await Promise.all([
      replyDrafts,
      deps.drafts.comments(pr),
      deps.drafts.summary(pr),
    ]);
    return { drafts, commentDrafts, summaryDraft };
  }

  function load(threadId: string): Promise<ReviewLoad> {
    return withPr(threadId, async (target) => {
      const { head, files, collected } = await fetchPr(target);
      const [drafts, viewedMarks] = await Promise.all([
        readDrafts(target.ref, deps.drafts.liveDrafts(target.ref, collected)),
        deps.viewed.get(target.ref),
      ]);
      const threads = placeThreads(files, collected.threads);
      return {
        allThreadsRead: collected.complete,
        review: { head, files, threads, viewedMarks, ...drafts },
      };
    });
  }

  function loadDrafts(threadId: string): Promise<DraftsLoad> {
    return withPr(threadId, async (target) => {
      const { collected } = await loadedPr(target);
      return {
        drafts: await readDrafts(target.ref, deps.drafts.knownDrafts(target.ref, collected)),
      };
    });
  }

  function loadBasis(threadId: string): Promise<BasisLoad> {
    return withPr(threadId, async (target) => {
      const [{ head, files }, commentDrafts] = await Promise.all([
        loadedPr(target),
        deps.drafts.comments(target.ref),
      ]);
      return { basis: { head, files, commentDrafts } };
    });
  }

  async function saveDraft(
    threadId: string,
    pr: PullRequestRef,
    reviewThreadId: string,
    draft: Draft,
  ) {
    await deps.drafts.save(pr, reviewThreadId, draft);
    deps.publishDrafts({ threadId });
  }

  async function saveCommentDraft(
    threadId: string,
    pr: PullRequestRef,
    draftId: string,
    draft: CommentDraft,
  ) {
    await deps.drafts.saveComment(pr, draftId, draft);
    deps.publishDrafts({ threadId });
  }

  async function saveSummaryDraft(threadId: string, pr: PullRequestRef, draft: SummaryDraft) {
    await deps.drafts.saveSummary(pr, draft);
    deps.publishDrafts({ threadId });
  }

  async function updateViewed({
    threadId,
    set,
    remove,
  }: UpdateViewedRequest): Promise<ActionResult> {
    const resolution = await deps.resolvePr(threadId);
    if (resolution.kind === "error") return resolution;
    if (resolution.kind === "no_pr")
      return { kind: "error", message: "No pull request for this thread" };
    return deps.viewed.update(resolution.target.ref, set, remove);
  }

  async function sendToAgent(
    threadId: string,
    reviewThreadIds: readonly string[],
  ): Promise<SendToAgentResult> {
    const loaded = await load(threadId);
    if (loaded.kind === "no_pr")
      return { kind: "error", message: "No pull request for this thread" };
    if (loaded.kind === "error") return loaded;
    const selected = new Set(reviewThreadIds);
    const threads = openThreads(loaded.review.threads).filter(({ thread }) =>
      selected.has(thread.id),
    );
    if (threads.length === 0) {
      return { kind: "error", message: "The selected review threads are resolved or gone" };
    }
    const delivery = await deps.sendMessage(threadId, buildAgentPrompt(threads));
    return { kind: "sent", delivery, threadCount: threads.length };
  }

  return {
    load,
    loadDrafts,
    loadBasis,
    saveDraft,
    saveCommentDraft,
    saveSummaryDraft,
    sendToAgent,
    updateViewed,
  };
}
