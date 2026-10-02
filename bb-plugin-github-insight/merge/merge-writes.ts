import type { ActionResult, MergePullRequestRequest, RunMergeActionRequest } from "../contract";
import { write, type Written } from "../github/gh-write";
import type { CachedPr } from "../refresh/insight-service";
import type { PrTarget } from "../pr-lookup";

interface MergeWritesDeps {
  cachedPr(threadId: string): Promise<CachedPr>;
  mergePullRequest(target: PrTarget, request: MergePullRequestRequest): Promise<unknown>;
  refreshAfterWrite(threadId: string): Promise<void>;
  warn(message: string): void;
}

interface MergeCall {
  target: PrTarget;
  request: MergePullRequestRequest;
}

const NO_PR_MESSAGE = "No pull request for this thread";
const NOT_READ_MESSAGE = "Refresh the PR and try again.";
const STALE: Written<never> = { ok: false, message: "The PR changed. Refresh and try again." };

function mergeCallOf(cached: CachedPr, request: RunMergeActionRequest): Written<MergeCall> {
  if (cached.kind === "no_pr") return { ok: false, message: NO_PR_MESSAGE };
  if (cached.kind === "error") return { ok: false, message: cached.message };
  if (cached.kind === "not_cached") return { ok: false, message: NOT_READ_MESSAGE };
  const { mergeAction, pr } = cached.insight;
  if (mergeAction.kind !== request.action || pr.headOid !== request.expectedHeadOid) return STALE;
  return {
    ok: true,
    value: {
      target: cached.target,
      request: {
        pullRequestId: cached.pullRequestId,
        mergeMethod: mergeAction.method,
        expectedHeadOid: request.expectedHeadOid,
      },
    },
  };
}

export function createMergeWrites(deps: MergeWritesDeps) {
  async function runMergeAction(request: RunMergeActionRequest): Promise<ActionResult> {
    const call = mergeCallOf(await deps.cachedPr(request.threadId), request);
    if (!call.ok) return { kind: "error", message: call.message };
    const merged = await write(() => deps.mergePullRequest(call.value.target, call.value.request));
    if (!merged.ok) return { kind: "error", message: merged.message };
    await deps.refreshAfterWrite(request.threadId).catch((error: unknown) => {
      deps.warn(`Could not refresh the PR insight of thread ${request.threadId}: ${String(error)}`);
    });
    return { kind: "ok" };
  }

  return { runMergeAction };
}
