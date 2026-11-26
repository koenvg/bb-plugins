import { isVideoPath } from "../core/video-content";
import type { VideoWireResult } from "../core/video-content";
import { z } from "zod";
import { imageBasisKey, parseImageRefs } from "../core/pr-image-basis";
import type { PrImageBasis, PrImageRefs } from "../core/pr-image-basis";
import { imageError, imagePath, isRasterPath, imageShaSchema } from "../core/image-content";
import type { ImageSide, ImageWireResult } from "../core/image-content";
import type {
  ActionResult,
  DisplayedDrafts,
  MarkCommentsSeenRequest,
  ReviewDrafts,
  SendToAgentResult,
  UpdateViewedRequest,
} from "../contract";
import { buildAgentPrompt } from "../core/agent-prompt";
import { attachmentTag, draftAttachments } from "../core/attachments";
import type { Draft, Drafts } from "../core/drafts";
import { checkAnchor } from "../core/diff-lines";
import type { Anchor } from "../core/diff-lines";
import { checkOneCommit } from "../core/draft-commits";
import { newCommentIds } from "../core/new-comments";
import { collectPrFiles } from "../core/pr-files";
import type { ReviewFile } from "../core/pr-files";
import { changedFilesOf, parsePrHead } from "../core/pr-head";
import type { PrHead } from "../core/pr-head";
import { prKey } from "../core/pr-ref";
import type { PullRequestRef } from "../core/pr-ref";
import { hasText } from "../core/review-drafts";
import type { CommentDraft, ListedCommentDraft, SummaryDraft } from "../core/review-drafts";
import { collectReviewThreads } from "../core/review-threads";
import type { CollectedReviewThreads, ReviewThread } from "../core/review-threads";
import type { SignMedia } from "../core/signed-media";
import type { ReviewUpdated } from "../core/review-updated";
import { openThreads, placeThreads } from "../core/thread-placement";
import type { ThreadPlacement } from "../core/thread-placement";
import type { ViewedMarks } from "../core/viewed-marks";
import { GhFailureError, ghFailureText } from "../github/gh-failure";
import { RECHECK_NO_PR } from "../pr-lookup";
import type { LookupOptions, PrResolution, PrTarget } from "../pr-lookup";
import type { CommentEdit, DraftStore } from "./draft-store";
import type { ViewedMarksStore } from "./viewed-marks-store";
import { createReadCache } from "../refresh/read-cache";

export interface PrReview extends ReviewDrafts {
  head: PrHead;
  imageBasis?: PrImageBasis | null;
  files: ReviewFile[];
  threads: ThreadPlacement;
  viewedMarks: ViewedMarks;
  newCommentIds: string[];
}

export interface ReviewBasis {
  head: PrHead;
  files: ReviewFile[];
  commentDrafts: ListedCommentDraft[];
}

type NewCommentDraft = { anchor: Anchor } & (
  | { source: "agent"; readBody(): Promise<string> }
  | { source: "user" }
);

type CommentDraftCreation =
  | { kind: "created"; draftId: string }
  | { kind: "error"; reason: "anchor" | "commit" | "empty"; message: string };

export type PrLoad<T> =
  | { kind: "no_pr" }
  | { kind: "error"; message: string }
  | ({ kind: "ok"; target: PrTarget } & T);

export type ReviewLoad = PrLoad<{ allThreadsRead: boolean; review: PrReview }>;
export type DisplayedReviewLoad = PrLoad<{
  allThreadsRead: boolean;
  review: PrReview & Pick<DisplayedDrafts, "draftMedia">;
}>;
export type DraftsLoad = PrLoad<{ drafts: DisplayedDrafts }>;
export type BasisLoad = PrLoad<{ basis: ReviewBasis }>;
export type TargetLoad = PrLoad<object>;

interface LoadedPr {
  head: PrHead;
  imageBasis: PrImageBasis | null;
  hostId: string;
  files: ReviewFile[];
  collected: CollectedReviewThreads;
}

interface ReviewServiceDeps {
  resolvePr(threadId: string, options?: LookupOptions): Promise<PrResolution>;
  fetchPrFilesPage(target: PrTarget, page: number): Promise<unknown>;
  fetchReviewThreadsPage(target: PrTarget, after: string | null): Promise<unknown>;
  fetchPrHead(target: PrTarget): Promise<unknown>;
  fetchImageMergeBase?(target: PrTarget, refs: PrImageRefs): Promise<unknown>;
  readPrVideo?(
    target: PrTarget,
    request: { owner: string; repo: string; sha: string; path: string },
  ): Promise<VideoWireResult>;
  readPrImage?(
    target: PrTarget,
    request: { owner: string; repo: string; sha: string; path: string },
  ): Promise<ImageWireResult>;
  drafts: DraftStore;
  viewed: ViewedMarksStore;
  newCommentBasis(pr: PullRequestRef): Promise<{ markedAt: number | null; seen: Set<string> }>;
  markCommentsSeen(pr: PullRequestRef, ids: readonly string[]): Promise<ActionResult>;
  publishDrafts(update: ReviewUpdated): void;
  publishReview(update: ReviewUpdated): void;
  sendMessage(threadId: string, text: string): Promise<"sent" | "queued">;
  renderMarkdown(target: PrTarget, text: string): Promise<string>;
  signMedia: SignMedia;
  now(): number;
  newDraftId(): string;
}

export type ReviewService = ReturnType<typeof createReviewService>;

function prDataKey({ head, files, collected, imageBasis }: LoadedPr): string {
  const { threads, othersComments, complete } = collected;
  return JSON.stringify({ head, files, threads, othersComments, complete, imageBasis });
}

function samePr(a: LoadedPr, b: LoadedPr): boolean {
  return prDataKey(a) === prDataKey(b);
}

export function createReviewService(deps: ReviewServiceDeps) {
  const loadedPrs = createReadCache<LoadedPr>({ now: deps.now, sameData: samePr });
  const viewers = new Map<string, Set<string>>();

  async function withPr<T>(
    threadId: string,
    read: (target: PrTarget) => Promise<T>,
  ): Promise<PrLoad<T>> {
    const resolution = await deps.resolvePr(threadId, RECHECK_NO_PR);
    if (resolution.kind !== "pr") {
      return resolution;
    }
    try {
      return { kind: "ok", target: resolution.target, ...(await read(resolution.target)) };
    } catch (error) {
      if (error instanceof GhFailureError) {
        return { kind: "error", message: ghFailureText(error.failure) };
      }
      throw error;
    }
  }

  function hasPreviewFiles(files: readonly ReviewFile[]): boolean {
    return files.some(
      (file) =>
        isRasterPath(file.path) ||
        isRasterPath(file.previousPath ?? "") ||
        isVideoPath(file.path) ||
        isVideoPath(file.previousPath ?? ""),
    );
  }

  async function readImageBasis(target: PrTarget, refs: PrImageRefs): Promise<PrImageBasis | null> {
    try {
      const compared = await deps.fetchImageMergeBase?.(target, refs);
      const { merge_base_commit } = z
        .object({ merge_base_commit: z.object({ sha: imageShaSchema }) })
        .parse(compared);
      return { ...refs, mergeBaseSha: merge_base_commit.sha, hostId: target.hostId };
    } catch {
      return null;
    }
  }

  async function readHeadAndFiles(target: PrTarget) {
    const readFiles = (fileCount?: Promise<number | null>) =>
      collectPrFiles((page) => deps.fetchPrFilesPage(target, page), fileCount);
    const headRead = deps.fetchPrHead(target);
    let [rawHead, files] = await Promise.all([
      headRead,
      readFiles(headRead.then(changedFilesOf, () => null)),
    ]);
    let refs = parseImageRefs(rawHead);
    if (refs === null || !hasPreviewFiles(files)) {
      return { head: parsePrHead(rawHead), files, imageBasis: null };
    }
    // Previews need files read strictly between two equal head reads, so they show the head's revisions.
    files = await readFiles();
    let imageBasis: PrImageBasis | null = null;
    for (let attempt = 0; attempt < 2 && refs !== null; attempt += 1) {
      if (!hasPreviewFiles(files)) {
        break;
      }
      const nextRaw = await deps.fetchPrHead(target).catch(() => null);
      const nextRefs = parseImageRefs(nextRaw);
      if (JSON.stringify(refs) === JSON.stringify(nextRefs)) {
        imageBasis = await readImageBasis(target, refs);
        break;
      }
      if (attempt === 1 || nextRefs === null) {
        break;
      }
      rawHead = nextRaw;
      refs = nextRefs;
      files = await readFiles();
    }
    return { head: parsePrHead(rawHead), files, imageBasis };
  }

  async function readPr(target: PrTarget): Promise<LoadedPr> {
    const [{ head, files, imageBasis }, collected] = await Promise.all([
      readHeadAndFiles(target),
      collectReviewThreads((after) => deps.fetchReviewThreadsPage(target, after)),
    ]);
    return { head, files, collected, imageBasis, hostId: target.hostId };
  }

  async function fetchPr(target: PrTarget): Promise<LoadedPr> {
    return (await loadedPrs.fetch(prKey(target.ref), () => readPr(target))).value;
  }

  async function loadedPr(target: PrTarget): Promise<LoadedPr> {
    const key = prKey(target.ref);
    return loadedPrs.peek(key) ?? (await loadedPrs.shared(key, () => readPr(target))).value;
  }

  function revalidate(target: PrTarget, threadId: string): void {
    const key = prKey(target.ref);
    viewersOf(key).add(threadId);
    if (loadedPrs.isFresh(key)) {
      return;
    }
    void loadedPrs
      .shared(key, () => readPr(target))
      .then(async ({ value, changed }) => {
        if (changed) {
          for (const viewer of viewersOf(key)) {
            deps.publishReview({ threadId: viewer });
          }
        }
        await deps.drafts.liveDrafts(target.ref, value.collected);
      })
      .catch(() => {});
  }

  function viewersOf(key: string): Set<string> {
    const known = viewers.get(key);
    if (known !== undefined) {
      return known;
    }
    const created = new Set<string>();
    viewers.set(key, created);
    return created;
  }

  async function prefetch(threadId: string): Promise<void> {
    const resolution = await deps.resolvePr(threadId);
    if (resolution.kind === "pr") {
      revalidate(resolution.target, threadId);
    }
  }

  async function readDrafts(pr: PullRequestRef, replyDrafts: Promise<Drafts>) {
    const [drafts, commentDrafts, summaryDraft] = await Promise.all([
      replyDrafts,
      deps.drafts.comments(pr),
      deps.drafts.summary(pr),
    ]);
    return { drafts, commentDrafts, summaryDraft };
  }

  function signedThreads({ threads, bodyHtml }: CollectedReviewThreads): ReviewThread[] {
    return threads.map((thread) => ({
      ...thread,
      comments: thread.comments.map((comment) => ({
        ...comment,
        body: deps.signMedia(comment.body, bodyHtml.get(comment.id) ?? ""),
      })),
    }));
  }

  async function draftMedia(
    target: PrTarget,
    commentDrafts: readonly ListedCommentDraft[],
  ): Promise<DisplayedDrafts["draftMedia"]> {
    const urls = [
      ...new Set(commentDrafts.flatMap(({ body }) => draftAttachments(body).map(({ url }) => url))),
    ];
    if (urls.length === 0) {
      return {};
    }
    try {
      const tags = urls.map((url) => attachmentTag({ alt: "", url })).join("\n");
      const signed = deps.signMedia(urls.join("\n"), await deps.renderMarkdown(target, tags));
      return Object.fromEntries(
        signed
          .split("\n")
          .map((url, index) => [urls[index]!, url] as const)
          .filter(([original, url]) => url !== original),
      );
    } catch {
      return {};
    }
  }

  function load(threadId: string): Promise<ReviewLoad> {
    return loadReview(threadId, ({ threads }) => threads);
  }

  async function loadForDisplay(
    threadId: string,
    { fresh = false }: { fresh?: boolean } = {},
  ): Promise<DisplayedReviewLoad> {
    const load = await withPr(threadId, async (target) => {
      const cached = fresh ? null : loadedPrs.peek(prKey(target.ref));
      if (cached === null) {
        const loaded = fresh ? await fetchPr(target) : await loadedPr(target);
        return reviewOf(target, loaded, signedThreads, deps.drafts.liveDrafts);
      }
      revalidate(target, threadId);
      return reviewOf(target, cached, signedThreads, deps.drafts.knownDrafts);
    });
    if (load.kind !== "ok") {
      return load;
    }
    const media = await draftMedia(load.target, load.review.commentDrafts);
    return { ...load, review: { ...load.review, draftMedia: media } };
  }

  function loadReview(
    threadId: string,
    threadsOf: (collected: CollectedReviewThreads) => ReviewThread[],
  ): Promise<ReviewLoad> {
    return withPr(threadId, async (target) =>
      reviewOf(target, await fetchPr(target), threadsOf, deps.drafts.liveDrafts),
    );
  }

  async function reviewOf(
    target: PrTarget,
    { head, files, collected, imageBasis }: LoadedPr,
    threadsOf: (collected: CollectedReviewThreads) => ReviewThread[],
    replyDrafts: (pr: PullRequestRef, collected: CollectedReviewThreads) => Promise<Drafts>,
  ): Promise<{ allThreadsRead: boolean; review: PrReview }> {
    const [drafts, viewedMarks, { markedAt, seen }] = await Promise.all([
      readDrafts(target.ref, replyDrafts(target.ref, collected)),
      deps.viewed.get(target.ref),
      deps.newCommentBasis(target.ref),
    ]);
    const threads = placeThreads(files, threadsOf(collected));
    const newIds = newCommentIds(collected.othersComments, markedAt, seen);
    return {
      allThreadsRead: collected.complete,
      review: { head, files, imageBasis, threads, viewedMarks, newCommentIds: newIds, ...drafts },
    };
  }

  function loadDrafts(threadId: string): Promise<DraftsLoad> {
    return withPr(threadId, async (target) => {
      const { collected } = await loadedPr(target);
      const drafts = await readDrafts(target.ref, deps.drafts.knownDrafts(target.ref, collected));
      return { drafts: { ...drafts, draftMedia: await draftMedia(target, drafts.commentDrafts) } };
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

  async function createCommentDraft(
    threadId: string,
    pr: PullRequestRef,
    basis: ReviewBasis,
    input: NewCommentDraft,
  ): Promise<CommentDraftCreation> {
    const placed = checkAnchor(basis.files, input.anchor);
    if (!placed.ok) {
      return { kind: "error", reason: "anchor", message: placed.reason };
    }
    const oneCommit = checkOneCommit(basis.commentDrafts, basis.head.oid);
    if (!oneCommit.ok) {
      return { kind: "error", reason: "commit", message: oneCommit.message };
    }
    const body = input.source === "agent" ? await input.readBody() : "";
    if (input.source === "agent" && !hasText(body)) {
      return { kind: "error", reason: "empty", message: "Comment is empty" };
    }
    const draftId = deps.newDraftId();
    await deps.drafts.saveComment(pr, draftId, {
      ...input.anchor,
      body,
      commitOid: basis.head.oid,
      updatedAt: deps.now(),
      source: input.source,
    });
    deps.publishDrafts({ threadId });
    return { kind: "created", draftId };
  }

  function loadTarget(threadId: string): Promise<TargetLoad> {
    return withPr(threadId, async () => ({}));
  }

  async function editCommentDraft(
    threadId: string,
    pr: PullRequestRef,
    draftId: string,
    edit: CommentEdit,
  ): Promise<boolean> {
    const edited = await deps.drafts.editComment(pr, draftId, edit);
    if (edited) {
      deps.publishDrafts({ threadId });
    }
    return edited;
  }

  function commentDraft(pr: PullRequestRef, draftId: string): Promise<CommentDraft | null> {
    return deps.drafts.comment(pr, draftId);
  }

  async function deleteCommentDraft(
    threadId: string,
    pr: PullRequestRef,
    draftId: string,
  ): Promise<boolean> {
    if ((await deps.drafts.comment(pr, draftId)) === null) {
      return false;
    }
    await deps.drafts.deleteComment(pr, draftId);
    deps.publishDrafts({ threadId });
    return true;
  }

  async function saveSummaryDraft(threadId: string, pr: PullRequestRef, draft: SummaryDraft) {
    await deps.drafts.saveSummary(pr, draft);
    deps.publishDrafts({ threadId });
  }

  async function withPrRef(
    threadId: string,
    write: (pr: PullRequestRef) => Promise<ActionResult>,
  ): Promise<ActionResult> {
    const resolution = await deps.resolvePr(threadId, RECHECK_NO_PR);
    if (resolution.kind === "error") {
      return resolution;
    }
    if (resolution.kind === "no_pr") {
      return { kind: "error", message: "No pull request for this thread" };
    }
    return write(resolution.target.ref);
  }

  async function updateViewed({
    threadId,
    set,
    remove,
  }: UpdateViewedRequest): Promise<ActionResult> {
    return withPrRef(threadId, (pr) => deps.viewed.update(pr, set, remove));
  }

  async function markCommentsSeen({
    threadId,
    commentIds,
  }: MarkCommentsSeenRequest): Promise<ActionResult> {
    return withPrRef(threadId, (pr) => deps.markCommentsSeen(pr, commentIds));
  }

  async function sendToAgent(
    threadId: string,
    reviewThreadIds: readonly string[],
  ): Promise<SendToAgentResult> {
    const loaded = await load(threadId);
    if (loaded.kind === "no_pr") {
      return { kind: "error", message: "No pull request for this thread" };
    }
    if (loaded.kind === "error") {
      return loaded;
    }
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

  function getPrContent(
    kind: "image",
    threadId: string,
    expectedBasisKey: string,
    path: string,
    side: ImageSide,
  ): Promise<ImageWireResult>;
  function getPrContent(
    kind: "video",
    threadId: string,
    expectedBasisKey: string,
    path: string,
    side: ImageSide,
  ): Promise<VideoWireResult>;
  async function getPrContent(
    kind: "image" | "video",
    threadId: string,
    expectedBasisKey: string,
    path: string,
    side: ImageSide,
  ): Promise<ImageWireResult | VideoWireResult> {
    const resolution = await deps.resolvePr(threadId, RECHECK_NO_PR);
    if (resolution.kind !== "pr") {
      return imageError("stale", "Pull request changed. Refresh the review.");
    }
    const target = resolution.target;
    const loaded = loadedPrs.peek(prKey(target.ref));
    const basis = loaded?.imageBasis;
    if (
      !basis ||
      basis.hostId !== target.hostId ||
      imageBasisKey(basis) !== expectedBasisKey ||
      basis.baseRepo.owner.toLowerCase() !== target.ref.owner.toLowerCase() ||
      basis.baseRepo.repo.toLowerCase() !== target.ref.repo.toLowerCase()
    ) {
      return imageError("stale", "Preview revisions changed. Refresh the review.");
    }
    const file = loaded.files.find((file) => file.path === path);
    if (!file) {
      return imageError("stale", "File changed. Refresh the review.");
    }
    try {
      const sidePath = imagePath(file, side);
      if (sidePath === null) {
        return { kind: "absent" };
      }
      const repo = side === "before" ? basis.baseRepo : basis.headRepo;
      const sha = side === "before" ? basis.mergeBaseSha : basis.headSha;
      if (kind === "video" && !isVideoPath(file.path) && !isVideoPath(file.previousPath ?? "")) {
        return imageError("unsupported", "This side is not an MP4 or WebM video");
      }
      const reader = kind === "video" ? deps.readPrVideo : deps.readPrImage;
      const result =
        (await reader?.(target, { ...repo, sha, path: sidePath })) ??
        imageError("read", "Preview reader unavailable");
      const current = loadedPrs.peek(prKey(target.ref))?.imageBasis;
      return current && imageBasisKey(current) === expectedBasisKey
        ? result
        : imageError("stale", "Review refreshed. Retry the preview.");
    } catch {
      return imageError("read", "Could not read preview at this revision");
    }
  }

  return {
    getPrImage: (threadId: string, key: string, path: string, side: ImageSide) =>
      getPrContent("image", threadId, key, path, side),
    getPrVideo: (threadId: string, key: string, path: string, side: ImageSide) =>
      getPrContent("video", threadId, key, path, side),
    load,
    loadForDisplay,
    prefetch,
    loadDrafts,
    loadBasis,
    loadTarget,
    saveDraft,
    createCommentDraft,
    commentDraft,
    editCommentDraft,
    deleteCommentDraft,
    saveSummaryDraft,
    sendToAgent,
    updateViewed,
    markCommentsSeen,
  };
}
