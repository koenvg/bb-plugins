import { useState } from "react";
import {
  experimental_NewThreadComposer as NewThreadComposer,
  useRpc,
  type NewThreadComposerProps,
  type NewThreadRequest,
} from "@get-bb/plugin-sdk/app";
import type { LinkedQueuePr, ReviewQueueView, rpcContract } from "../contract";
import { buildReviewPrompt } from "../core/review-prompt";
import { Icon } from "@/components/ui/icon";
import { messageOf } from "./error-message";
import { Notice } from "./feedback";
import { usePullRequestsNavigation, type PullRequestsRoute } from "./pull-requests-routes";
import type { ReviewQueueState } from "./use-review-queue";

const REVIEW_ENVIRONMENT: NonNullable<NewThreadComposerProps["defaultEnvironment"]> = {
  type: "host",
  workspace: { type: "managed-worktree", baseBranch: { kind: "default" } },
};

type ReviewRoute = Extract<PullRequestsRoute, { kind: "review" }>;

function findReviewRequest(view: ReviewQueueView | null, route: ReviewRoute): LinkedQueuePr | null {
  const repo = route.repo.toLowerCase();
  for (const group of view?.reviewRequests.groups ?? []) {
    if (group.repo.toLowerCase() !== repo) continue;
    const pr = group.prs.find((candidate) => candidate.number === route.number);
    if (pr !== undefined) return pr;
  }
  return null;
}

export function ReviewComposerPage({ route, queue }: { route: ReviewRoute; queue: ReviewQueueState }) {
  const navigation = usePullRequestsNavigation();
  const pr = findReviewRequest(queue.view, route);
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors duration-150 hover:bg-state-hover hover:duration-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => navigation.go({ kind: "list" })}
        >
          <Icon name="ChevronLeft" className="size-4" />
          Back
        </button>
        <h1 className="min-w-0 truncate text-sm font-semibold">
          Review {route.repo}
          <span className="font-mono tabular-nums"> #{route.number}</span>
        </h1>
      </header>
      {pr === null ? (
        <Notice>
          {queue.view === null && queue.error === null
            ? "Loading pull request…"
            : "This pull request is not in your review requests"}
        </Notice>
      ) : pr.projectIds.length === 0 ? (
        <Notice>No bb project for this repository</Notice>
      ) : (
        <ReviewComposer pr={pr} projectId={pr.projectIds[0]!} />
      )}
    </div>
  );
}

function ReviewComposer({ pr, projectId }: { pr: LinkedQueuePr; projectId: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const navigation = usePullRequestsNavigation();
  const [error, setError] = useState<string | null>(null);

  async function submit(request: NewThreadRequest) {
    setError(null);
    try {
      const { threadId } = await rpc.call("startReview", request);
      navigation.toThread(threadId);
    } catch (failure) {
      setError(messageOf(failure));
      throw failure;
    }
  }

  return (
    <>
      {error !== null && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
        >
          <Icon name="AlertCircle" className="size-4 shrink-0 text-destructive" />
          <span className="break-words text-destructive">{error}</span>
        </div>
      )}
      <NewThreadComposer
        className="min-h-0 flex-1"
        defaultProjectId={projectId}
        defaultEnvironment={REVIEW_ENVIRONMENT}
        initialPrompt={buildReviewPrompt(pr)}
        draftKey={`github-insight:review:${pr.repo}#${pr.number}`}
        onSubmit={submit}
      />
    </>
  );
}
