import { UrlLink } from "@get-bb/plugin-sdk/app";
import type { LinkedQueueList, LinkedQueuePr } from "../contract";
import { relativeTime } from "../core/relative-time";
import type { CiState, QueuePr } from "../core/review-queue";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { Notice, RefreshButton, RefreshError } from "./feedback";
import { MyReviews } from "./my-reviews";
import { usePullRequestsNavigation } from "./pull-requests-routes";
import { ACTION_CLASS, COUNT_CLASS, LABEL_CLASS } from "./queue-styles";
import type { ReviewQueueState } from "./use-review-queue";

const CI_LABEL: Record<CiState, { text: string; icon: IconName | null; className: string }> = {
  passed: { text: "CI passed", icon: "CircleCheck", className: "text-success" },
  failed: { text: "CI failed", icon: "CircleX", className: "text-destructive" },
  running: { text: "CI running", icon: "Spinner", className: "text-attention" },
  none: { text: "No checks", icon: null, className: "text-muted-foreground" },
};

const REVIEW_DECISION_LABEL: Record<
  NonNullable<QueuePr["reviewDecision"]>,
  { text: string; className: string }
> = {
  APPROVED: { text: "Approved", className: "text-success" },
  CHANGES_REQUESTED: { text: "Changes requested", className: "text-destructive" },
  REVIEW_REQUIRED: { text: "Review required", className: "text-muted-foreground" },
};

export function ReviewQueueLists({ queue }: { queue: ReviewQueueState }) {
  const { view, error, refreshing, refresh } = queue;
  return (
    <div className="flex flex-col gap-4">
      {error !== null && (
        <RefreshError
          message={error}
          refreshedAt={view?.loadedAt ?? null}
          retry={refresh}
          busy={refreshing}
        />
      )}
      {view === null ? (
        error === null && <Notice>Loading pull requests…</Notice>
      ) : (
        <>
          <MyReviews
            reviews={view.myReviews}
            headerEnd={
              <>
                <span className="text-xs tabular-nums text-subtle-foreground">
                  Updated{" "}
                  <time
                    dateTime={new Date(view.loadedAt).toISOString()}
                    title={new Date(view.loadedAt).toLocaleString()}
                  >
                    {relativeTime(new Date(view.loadedAt), new Date())}
                  </time>
                </span>
                <RefreshButton refreshing={refreshing} refresh={refresh} />
              </>
            }
          />
          <ReviewRequests list={view.reviewRequests} />
        </>
      )}
    </div>
  );
}

function ReviewRequests({ list }: { list: LinkedQueueList }) {
  const count = list.groups.reduce((sum, group) => sum + group.prs.length, 0);
  return (
    <section aria-label="Review requests" className="flex min-w-0 flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        Review requests
        <span data-testid="queue-count" className={COUNT_CLASS}>
          {count}
        </span>
      </h2>
      {count === 0 ? (
        <Notice>No review requests</Notice>
      ) : (
        list.groups.map((group) => (
          <div key={group.repo} className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 items-baseline gap-2 text-xs">
              <h3 data-testid="queue-group" className="min-w-0 truncate font-medium text-muted-foreground">
                {group.repo}
              </h3>
              {!group.prs.some((pr) => pr.projectIds.length > 0) && (
                <span className="ml-auto shrink-0 text-subtle-foreground">
                  No bb project for this repository
                </span>
              )}
            </div>
            <ul className="flex flex-col gap-2">
              {group.prs.map((pr) => (
                <QueueCard key={pr.number} pr={pr} />
              ))}
            </ul>
          </div>
        ))
      )}
      {list.truncated && <p className="text-xs text-muted-foreground">Showing first 50</p>}
    </section>
  );
}

function QueueCard({ pr }: { pr: LinkedQueuePr }) {
  const ci = CI_LABEL[pr.ci];
  const decision = pr.reviewDecision === null ? null : REVIEW_DECISION_LABEL[pr.reviewDecision];
  return (
    <li
      aria-label={`${pr.repo}#${pr.number}`}
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2.5"
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <h4 className="min-w-0 flex-1 break-words text-sm font-semibold">
          <span className="font-mono font-normal tabular-nums text-muted-foreground">#{pr.number}</span>{" "}
          {pr.title}
        </h4>
        <time
          dateTime={pr.updatedAt}
          title={new Date(pr.updatedAt).toLocaleString()}
          className="shrink-0 text-xs tabular-nums text-subtle-foreground"
        >
          {relativeTime(new Date(pr.updatedAt), new Date())}
        </time>
      </div>
      <div
        data-testid="queue-meta"
        className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
      >
        {pr.author !== null && <span className="min-w-0 truncate">{pr.author}</span>}
        <span data-testid="queue-ci" className="flex shrink-0 items-center gap-1">
          {ci.icon !== null && <Icon name={ci.icon} className={cn("size-3.5", ci.className)} />}
          {ci.text}
        </span>
        {decision !== null && (
          <span data-testid="queue-review-decision" className={cn(LABEL_CLASS, decision.className)}>
            {decision.text}
          </span>
        )}
        {pr.draft && <span className={LABEL_CLASS}>Draft</span>}
        <CardActions pr={pr} />
      </div>
    </li>
  );
}

function CardActions({ pr }: { pr: LinkedQueuePr }) {
  const navigation = usePullRequestsNavigation();
  const threadId = pr.threadId;
  return (
    <div className="-mr-1.5 ml-auto flex flex-wrap items-center justify-end gap-2">
      {threadId !== null ? (
        <button
          type="button"
          className={cn(ACTION_CLASS, "border border-input")}
          onClick={() => navigation.toThread(threadId)}
        >
          <Icon name="MessageSquare" className="size-4" />
          Open thread
        </button>
      ) : (
        pr.projectIds.length > 0 && (
          <button
            type="button"
            className={cn(ACTION_CLASS, "border border-input")}
            onClick={() => navigation.go({ kind: "review", repo: pr.repo, number: pr.number })}
          >
            <Icon name="MessageSquarePlus" className="size-4" />
            Review in thread
          </button>
        )
      )}
      <UrlLink href={pr.url} className={cn(ACTION_CLASS, "text-muted-foreground hover:text-foreground")}>
        Open on GitHub
      </UrlLink>
    </div>
  );
}
