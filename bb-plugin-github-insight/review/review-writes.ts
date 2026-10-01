import type {
  ActionResult,
  DiscardDraftRequest,
  ReplyRequest,
  ReplyResult,
  SaveDraftRequest,
  SetResolvedRequest,
} from "../contract";
import { pullRequestUrl } from "../core/pr-ref";
import type { ReviewUpdated } from "../core/review-updated";
import { GhFailureError, ghFailureText } from "../github/gh-failure";
import { isPendingReply } from "../github/review-thread-mutations";
import type { PrResolution, PrTarget } from "../pr-lookup";
import type { DraftStore } from "./draft-store";

interface ReviewWritesDeps {
  resolvePr(threadId: string): Promise<PrResolution>;
  replyToThread(target: PrTarget, reviewThreadId: string, body: string): Promise<unknown>;
  setThreadResolved(target: PrTarget, reviewThreadId: string, resolved: boolean): Promise<unknown>;
  drafts: DraftStore;
  publish(update: ReviewUpdated): void;
  refreshAfterWrite(threadId: string): Promise<void>;
  now(): number;
  warn(message: string): void;
}

type Written<T> = { ok: true; value: T } | { ok: false; message: string };

async function write<T>(run: () => Promise<T>): Promise<Written<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (error instanceof GhFailureError) return { ok: false, message: ghFailureText(error.failure) };
    if (error instanceof Error) return { ok: false, message: error.message };
    throw error;
  }
}

const NO_PR_MESSAGE = "No pull request for this thread";

export function createReviewWrites(deps: ReviewWritesDeps) {
  async function targetOf(threadId: string): Promise<Written<PrTarget>> {
    const resolution = await deps.resolvePr(threadId);
    if (resolution.kind === "pr") return { ok: true, value: resolution.target };
    return { ok: false, message: resolution.kind === "error" ? resolution.message : NO_PR_MESSAGE };
  }

  async function refreshAfterWrite(threadId: string) {
    await deps.refreshAfterWrite(threadId).catch((error: unknown) => {
      deps.warn(`Could not refresh the PR insight of thread ${threadId}: ${String(error)}`);
    });
  }

  async function reply({ threadId, reviewThreadId, body, resolve }: ReplyRequest): Promise<ReplyResult> {
    const target = await targetOf(threadId);
    if (!target.ok) return { kind: "post_failed", message: target.message };
    const posted = await write(() => deps.replyToThread(target.value, reviewThreadId, body));
    if (!posted.ok) return { kind: "post_failed", message: posted.message };
    await deps.drafts.delete(target.value.ref, reviewThreadId).catch((error: unknown) => {
      deps.warn(`Posted a reply to ${reviewThreadId}, but could not delete its draft: ${String(error)}`);
    });
    const pendingReviewUrl = isPendingReply(posted.value) ? pullRequestUrl(target.value.ref) : null;
    if (!resolve) return { kind: "posted", pendingReviewUrl, resolveError: null };
    const resolved = await write(() => deps.setThreadResolved(target.value, reviewThreadId, true));
    if (resolved.ok) await refreshAfterWrite(threadId);
    return { kind: "posted", pendingReviewUrl, resolveError: resolved.ok ? null : resolved.message };
  }

  async function setResolved({ threadId, reviewThreadId, resolved }: SetResolvedRequest): Promise<ActionResult> {
    const target = await targetOf(threadId);
    if (!target.ok) return { kind: "error", message: target.message };
    const written = await write(() => deps.setThreadResolved(target.value, reviewThreadId, resolved));
    if (written.ok) await refreshAfterWrite(threadId);
    return written.ok ? { kind: "ok" } : { kind: "error", message: written.message };
  }

  async function saveDraft({ threadId, reviewThreadId, body }: SaveDraftRequest): Promise<ActionResult> {
    const target = await targetOf(threadId);
    if (!target.ok) return { kind: "error", message: target.message };
    await deps.drafts.save(target.value.ref, reviewThreadId, { body, updatedAt: deps.now(), source: "user" });
    return { kind: "ok" };
  }

  async function discardDraft({ threadId, reviewThreadId }: DiscardDraftRequest): Promise<ActionResult> {
    const target = await targetOf(threadId);
    if (!target.ok) return { kind: "error", message: target.message };
    await deps.drafts.delete(target.value.ref, reviewThreadId);
    deps.publish({ threadId });
    return { kind: "ok" };
  }

  return { reply, setResolved, saveDraft, discardDraft };
}
