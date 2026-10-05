import type {
  ActionResult,
  EnqueuePullRequestRequest,
  MergePullRequestRequest,
  RunMergeActionRequest,
} from "../contract";
import { write, type Written } from "../github/gh-write";
import type { CachedPr } from "../refresh/insight-service";
import type { PrTarget } from "../pr-lookup";

interface MergeWritesDeps {
  cachedPr(threadId: string): Promise<CachedPr>;
  mergePullRequest(target: PrTarget, request: MergePullRequestRequest): Promise<unknown>;
  enqueuePullRequest(target: PrTarget, request: EnqueuePullRequestRequest): Promise<unknown>;
  refreshAfterWrite(threadId: string): Promise<void>;
  warn(message: string): void;
}

type GitHubWrite =
  | { action: "merge"; target: PrTarget; request: MergePullRequestRequest }
  | { action: "enqueue"; target: PrTarget; request: EnqueuePullRequestRequest };

const NO_PR_MESSAGE = "No pull request for this thread";
const NOT_READ_MESSAGE = "Refresh the PR and try again.";
const STALE: Written<never> = { ok: false, message: "The PR changed. Refresh and try again." };

function gitHubWriteOf(cached: CachedPr, request: RunMergeActionRequest): Written<GitHubWrite> {
  if (cached.kind === "no_pr") return { ok: false, message: NO_PR_MESSAGE };
  if (cached.kind === "error") return { ok: false, message: cached.message };
  if (cached.kind === "not_cached") return { ok: false, message: NOT_READ_MESSAGE };
  const { mergeAction, pr } = cached.insight;
  if (mergeAction.kind !== request.action || pr.headOid !== request.expectedHeadOid) return STALE;
  const { target, pullRequestId } = cached;
  const { expectedHeadOid } = request;
  if (mergeAction.kind === "enqueue") {
    return {
      ok: true,
      value: { action: "enqueue", target, request: { pullRequestId, expectedHeadOid } },
    };
  }
  if (mergeAction.kind === "merge") {
    return {
      ok: true,
      value: {
        action: "merge",
        target,
        request: { pullRequestId, mergeMethod: mergeAction.method, expectedHeadOid },
      },
    };
  }
  return STALE;
}

export function createMergeWrites(deps: MergeWritesDeps) {
  function send(call: GitHubWrite): Promise<unknown> {
    return call.action === "merge"
      ? deps.mergePullRequest(call.target, call.request)
      : deps.enqueuePullRequest(call.target, call.request);
  }

  async function runMergeAction(request: RunMergeActionRequest): Promise<ActionResult> {
    const call = gitHubWriteOf(await deps.cachedPr(request.threadId), request);
    if (!call.ok) return { kind: "error", message: call.message };
    const written = await write(() => send(call.value));
    if (!written.ok) return { kind: "error", message: written.message };
    await deps.refreshAfterWrite(request.threadId).catch((error: unknown) => {
      deps.warn(`Could not refresh the PR insight of thread ${request.threadId}: ${String(error)}`);
    });
    return { kind: "ok" };
  }

  return { runMergeAction };
}
