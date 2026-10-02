import type { SendToAgentResult } from "../contract";
import { buildAgentPrompt } from "../core/agent-prompt";
import type { Draft, Drafts } from "../core/drafts";
import { parsePrFiles, type ReviewFile } from "../core/pr-files";
import { parsePrHead, type PrHead } from "../core/pr-head";
import type { PullRequestRef } from "../core/pr-ref";
import type { CommentDraft, ListedCommentDraft, SummaryDraft } from "../core/review-drafts";
import { collectReviewThreads } from "../core/review-threads";
import type { ReviewUpdated } from "../core/review-updated";
import { openThreads, placeThreads, type ThreadPlacement } from "../core/thread-placement";
import { GhFailureError, ghFailureText } from "../github/gh-failure";
import type { PrResolution, PrTarget } from "../pr-lookup";
import type { DraftStore } from "./draft-store";

export interface PrReview {
  head: PrHead;
  files: ReviewFile[];
  threads: ThreadPlacement;
  drafts: Drafts;
  commentDrafts: ListedCommentDraft[];
  summaryDraft: SummaryDraft | null;
}

export type ReviewLoad =
  | { kind: "no_pr" }
  | { kind: "error"; message: string }
  | { kind: "ok"; target: PrTarget; allThreadsRead: boolean; review: PrReview };

interface ReviewServiceDeps {
  resolvePr(threadId: string): Promise<PrResolution>;
  fetchPrFiles(target: PrTarget): Promise<unknown>;
  fetchReviewThreadsPage(target: PrTarget, after: string | null): Promise<unknown>;
  fetchPrHead(target: PrTarget): Promise<unknown>;
  drafts: DraftStore;
  publish(update: ReviewUpdated): void;
  sendMessage(threadId: string, text: string): Promise<"sent" | "queued">;
}

export type ReviewService = ReturnType<typeof createReviewService>;

export function createReviewService(deps: ReviewServiceDeps) {
  async function load(threadId: string): Promise<ReviewLoad> {
    const resolution = await deps.resolvePr(threadId);
    if (resolution.kind !== "pr") return resolution;
    const { target } = resolution;
    try {
      const [files, collected, head] = await Promise.all([
        deps.fetchPrFiles(target).then(parsePrFiles),
        collectReviewThreads((after) => deps.fetchReviewThreadsPage(target, after)),
        deps.fetchPrHead(target).then(parsePrHead),
      ]);
      const [drafts, commentDrafts, summaryDraft] = await Promise.all([
        deps.drafts.liveDrafts(target.ref, collected),
        deps.drafts.comments(target.ref),
        deps.drafts.summary(target.ref),
      ]);
      return {
        kind: "ok",
        target,
        allThreadsRead: collected.complete,
        review: {
          head,
          files,
          threads: placeThreads(files, collected.threads),
          drafts,
          commentDrafts,
          summaryDraft,
        },
      };
    } catch (error) {
      if (error instanceof GhFailureError) {
        return { kind: "error", message: ghFailureText(error.failure) };
      }
      throw error;
    }
  }

  async function saveDraft(threadId: string, pr: PullRequestRef, reviewThreadId: string, draft: Draft) {
    await deps.drafts.save(pr, reviewThreadId, draft);
    deps.publish({ threadId });
  }

  async function saveCommentDraft(threadId: string, pr: PullRequestRef, draftId: string, draft: CommentDraft) {
    await deps.drafts.saveComment(pr, draftId, draft);
    deps.publish({ threadId });
  }

  async function saveSummaryDraft(threadId: string, pr: PullRequestRef, draft: SummaryDraft) {
    await deps.drafts.saveSummary(pr, draft);
    deps.publish({ threadId });
  }

  async function sendToAgent(threadId: string, reviewThreadIds: readonly string[]): Promise<SendToAgentResult> {
    const loaded = await load(threadId);
    if (loaded.kind === "no_pr") return { kind: "error", message: "No pull request for this thread" };
    if (loaded.kind === "error") return loaded;
    const selected = new Set(reviewThreadIds);
    const threads = openThreads(loaded.review.threads).filter(({ thread }) => selected.has(thread.id));
    if (threads.length === 0) {
      return { kind: "error", message: "The selected review threads are resolved or gone" };
    }
    const delivery = await deps.sendMessage(threadId, buildAgentPrompt(threads));
    return { kind: "sent", delivery, threadCount: threads.length };
  }

  return { load, saveDraft, saveCommentDraft, saveSummaryDraft, sendToAgent };
}
