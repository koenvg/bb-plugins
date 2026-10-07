import { useEffect, useState, type ReactNode } from "react";
import { UrlLink, useRpc } from "@get-bb/plugin-sdk/app";
import type {
  LinkedQueuePr,
  QueueSection,
  ReturnedReason,
  ReviewThreadStatus,
  rpcContract,
} from "../contract";
import { relativeTime } from "../core/relative-time";
import type { CiState, QueuePr } from "../core/review-queue";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { messageOf } from "./error-message";
import { IconTooltip } from "./icon-tooltip";
import { Notice, RefreshButton, RefreshError } from "./feedback";
import { usePullRequestsNavigation } from "./pull-requests-routes";
import { ACTION_CLASS, COUNT_CLASS, LABEL_CLASS } from "./queue-styles";
import type { ReviewQueueState } from "./use-review-queue";

const CI_MARK: Record<CiState, { text: string; icon: IconName; className: string }> = {
  passed: { text: "CI passed", icon: "CircleCheck", className: "text-success" },
  failed: { text: "CI failed", icon: "CircleX", className: "text-destructive" },
  running: {
    text: "CI running",
    icon: "Spinner",
    className: "animate-spin text-attention [animation-duration:3s] motion-reduce:animate-none",
  },
  none: { text: "No checks", icon: "Circle", className: "text-subtle-foreground" },
};

const REVIEW_DECISION_LABEL: Record<
  NonNullable<QueuePr["reviewDecision"]>,
  { text: string; className: string }
> = {
  APPROVED: { text: "Approved", className: "font-medium text-success" },
  CHANGES_REQUESTED: { text: "Changes requested", className: "font-medium text-destructive" },
  REVIEW_REQUIRED: { text: "Review required", className: "text-subtle-foreground" },
};

interface StatusLabel {
  text: string;
  dotClass: string;
  pillClass?: string;
}

const STATUS_LABEL: Record<ReviewThreadStatus, StatusLabel> = {
  running: { text: "Running", dotClass: "animate-pulse bg-success motion-reduce:animate-none" },
  needs_you: {
    text: "Needs you",
    dotClass: "bg-attention",
    pillClass: "border-attention/50 bg-attention/15 text-foreground",
  },
  idle: { text: "Idle", dotClass: "bg-muted-foreground" },
  error: {
    text: "Error",
    dotClass: "bg-destructive",
    pillClass: "border-destructive/40 bg-destructive/5 text-destructive",
  },
};

const RETURNED_LABEL: Record<ReturnedReason, StatusLabel> = {
  finished: {
    text: "Agent finished",
    dotClass: "bg-primary",
    pillClass: "border-primary/40 bg-primary/10 text-foreground",
  },
  needs_you: STATUS_LABEL.needs_you,
  failed: { ...STATUS_LABEL.error, text: "Failed" },
};

const ICON_ACTION_CLASS =
  "inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md disabled:cursor-default text-muted-foreground transition-colors duration-150 hover:bg-state-hover hover:text-foreground hover:duration-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

function keyOf(pr: LinkedQueuePr): string {
  return `${pr.repo.toLowerCase()}#${pr.number}`;
}

function countOf(section: QueueSection): number {
  return section.reduce((sum, group) => sum + group.prs.length, 0);
}

export function ReviewQueueLists({ queue }: { queue: ReviewQueueState }) {
  const { view, error, refreshing, refresh } = queue;
  const rpc = useRpc<typeof rpcContract>();
  const [archived, setArchived] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setArchived(new Set());
  }, [view]);

  useEffect(() => {
    if (!view?.hasUnseen) return;
    const prs = view.needsReview.flatMap((group) =>
      group.prs.map(({ repo, number }) => ({ repo, number })),
    );
    rpc.call("markQueueSeen", { prs }).catch(() => {});
  }, [rpc, view]);

  function setBusyKey(key: string, on: boolean) {
    setBusy((keys) => {
      const next = new Set(keys);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function mark(pr: LinkedQueuePr, reviewed: boolean) {
    const key = keyOf(pr);
    setActionError(null);
    setBusyKey(key, true);
    const { repo, number, headOid } = pr;
    const result = await (
      reviewed
        ? rpc.call("markReviewed", { repo, number, headOid })
        : rpc.call("markNeedsReview", { repo, number })
    ).catch((failure: unknown) => ({ kind: "error" as const, message: messageOf(failure) }));
    if (result.kind === "error") setActionError(result.message);
    setBusyKey(key, false);
  }

  async function archive(pr: LinkedQueuePr, threadId: string) {
    const key = keyOf(pr);
    setActionError(null);
    setBusyKey(key, true);
    try {
      const result = await rpc.call("archiveReview", { threadId });
      if (result.kind === "ok") setArchived((ids) => new Set(ids).add(threadId));
      else setActionError(result.message);
    } catch (failure) {
      setActionError(messageOf(failure));
    } finally {
      setBusyKey(key, false);
    }
  }

  const withoutArchivedThreads = (section: QueueSection): QueueSection =>
    section.map((group) => ({
      repo: group.repo,
      prs: group.prs.map((pr) =>
        pr.thread !== null && archived.has(pr.thread.id) ? { ...pr, thread: null } : pr,
      ),
    }));
  const needsReview = withoutArchivedThreads(view?.needsReview ?? []);
  const reviewed = withoutArchivedThreads(view?.reviewed ?? []);
  const actions: CardHandlers = {
    busy: (pr) => busy.has(keyOf(pr)),
    mark: (pr, value) => void mark(pr, value),
    archive: (pr, threadId) => void archive(pr, threadId),
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      {error !== null && (
        <RefreshError
          message={error}
          refreshedAt={view?.loadedAt ?? null}
          retry={refresh}
          busy={refreshing}
        />
      )}
      {actionError !== null && <ActionError message={actionError} />}
      {view === null ? (
        error === null && <Notice>Loading pull requests…</Notice>
      ) : (
        <>
          <QueueSectionView
            label="Needs review"
            section={needsReview}
            empty={<CaughtUp />}
            actions={actions}
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
            footer={
              view.truncated && (
                <p className="px-1 text-xs text-muted-foreground">Showing first 50</p>
              )
            }
          />
          <QueueSectionView
            label="Reviewed"
            section={reviewed}
            empty={<Notice>No reviewed pull requests</Notice>}
            actions={actions}
            collapsible
          />
        </>
      )}
    </div>
  );
}

function CaughtUp() {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center"
    >
      <span className="grid size-10 place-items-center rounded-full bg-success/10 duration-500 ease-out animate-in fade-in zoom-in-50 motion-reduce:animate-none">
        <Icon name="CircleCheck" className="size-5 text-success" />
      </span>
      <p className="text-sm font-medium">Nothing to review</p>
      <p className="text-xs text-muted-foreground">
        New review requests and new pushes show up here.
      </p>
    </div>
  );
}

function ActionError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
    >
      <Icon name="AlertCircle" className="size-4 shrink-0 text-destructive" />
      <span className="break-words text-destructive">{message}</span>
    </div>
  );
}

interface CardHandlers {
  busy(pr: LinkedQueuePr): boolean;
  mark(pr: LinkedQueuePr, reviewed: boolean): void;
  archive(pr: LinkedQueuePr, threadId: string): void;
}

interface QueueSectionViewProps {
  label: string;
  section: QueueSection;
  empty: ReactNode;
  actions: CardHandlers;
  headerEnd?: ReactNode;
  footer?: ReactNode;
  collapsible?: boolean;
}

function QueueSectionView({
  label,
  section,
  empty,
  actions,
  headerEnd,
  footer,
  collapsible = false,
}: QueueSectionViewProps) {
  const [expanded, setExpanded] = useState(!collapsible);
  const count = countOf(section);
  const title = (
    <>
      {label}
      <span data-testid="queue-count" className={COUNT_CLASS}>
        {count}
      </span>
    </>
  );
  return (
    <section aria-label={label} className="@container flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          {collapsible ? (
            <button
              type="button"
              aria-expanded={expanded}
              className="-mx-2 inline-flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 transition-colors duration-150 hover:bg-state-hover hover:duration-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => setExpanded((open) => !open)}
            >
              <Icon
                name="ChevronRight"
                className={cn(
                  "size-4 text-muted-foreground transition-transform duration-200",
                  expanded && "rotate-90",
                )}
              />
              {title}
            </button>
          ) : (
            title
          )}
        </h2>
        {headerEnd !== undefined && (
          <div className="ml-auto flex shrink-0 items-center gap-2">{headerEnd}</div>
        )}
      </div>
      {expanded &&
        (count === 0
          ? empty
          : section.map((group) => (
              <div key={group.repo} className="flex min-w-0 flex-col gap-1.5">
                <div className="flex min-w-0 items-center gap-1.5 px-1 text-xs">
                  <Icon name="FolderGit" className="size-3.5 shrink-0 text-subtle-foreground" />
                  <h3
                    data-testid="queue-group"
                    className="min-w-0 truncate font-medium text-muted-foreground"
                  >
                    {group.repo}
                  </h3>
                  <span className="shrink-0 tabular-nums text-subtle-foreground">
                    {group.prs.length}
                  </span>
                  {!group.prs.some((pr) => pr.projectIds.length > 0) && (
                    <span className="min-w-0 truncate text-subtle-foreground">
                      <span aria-hidden="true">· </span>
                      No bb project for this repository
                    </span>
                  )}
                </div>
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                  {group.prs.map((pr) => (
                    <QueueRow
                      key={pr.number}
                      pr={pr}
                      actions={actions}
                      quiet={label === "Reviewed"}
                    />
                  ))}
                </ul>
              </div>
            )))}
      {footer}
    </section>
  );
}

function Separator() {
  return (
    <span aria-hidden="true" className="text-subtle-foreground">
      ·
    </span>
  );
}

function QueueRow({
  pr,
  actions,
  quiet,
}: {
  pr: LinkedQueuePr;
  actions: CardHandlers;
  quiet: boolean;
}) {
  const ci = CI_MARK[pr.ci];
  const decision = pr.reviewDecision === null ? null : REVIEW_DECISION_LABEL[pr.reviewDecision];
  const thread = pr.thread;
  const status =
    thread === null
      ? null
      : thread.returned !== null
        ? RETURNED_LABEL[thread.returned]
        : STATUS_LABEL[thread.status];
  return (
    <li
      aria-label={`${pr.repo}#${pr.number}`}
      className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-3 py-3 transition-colors duration-150 hover:bg-state-hover hover:duration-0 @lg:grid-cols-[1rem_minmax(0,1fr)_auto]"
    >
      <IconTooltip label={ci.text}>
        <span
          data-testid="queue-ci"
          role="img"
          aria-label={ci.text}
          tabIndex={0}
          className="mt-0.5 flex size-4 items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Icon name={ci.icon} className={cn("size-4", ci.className)} />
        </span>
      </IconTooltip>
      <div className="flex min-w-0 flex-col gap-1">
        <h4
          className={cn(
            "min-w-0 break-words text-sm font-semibold",
            quiet && "font-medium text-muted-foreground",
          )}
        >
          <span className="font-mono text-xs font-normal tabular-nums text-subtle-foreground">
            #{pr.number}
          </span>{" "}
          {pr.title}
        </h4>
        <div
          data-testid="queue-meta"
          className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground"
        >
          {pr.author !== null && (
            <>
              <span className="min-w-0 truncate">{pr.author}</span>
              <Separator />
            </>
          )}
          <time
            dateTime={pr.updatedAt}
            title={new Date(pr.updatedAt).toLocaleString()}
            className="shrink-0 tabular-nums"
          >
            {relativeTime(new Date(pr.updatedAt), new Date())}
          </time>
          {decision !== null && (
            <>
              <Separator />
              <span
                data-testid="queue-review-decision"
                className={cn("shrink-0", decision.className)}
              >
                {decision.text}
              </span>
            </>
          )}
          {(pr.draft || pr.review === "updated_since_review" || status !== null) && (
            <span className="w-1" />
          )}
          {pr.draft && <span className={LABEL_CLASS}>Draft</span>}
          {pr.review === "updated_since_review" && (
            <span
              className={cn(
                LABEL_CLASS,
                "flex items-center gap-1 border-attention/50 bg-attention/10 text-foreground",
              )}
            >
              <Icon name="ArrowUp" className="size-3 text-attention" />
              Updated since review
            </span>
          )}
          {status !== null && (
            <span
              data-testid="review-status"
              className={cn(LABEL_CLASS, "flex items-center gap-1.5", status.pillClass)}
            >
              <span aria-hidden="true" className={cn("size-1.5 rounded-full", status.dotClass)} />
              {status.text}
            </span>
          )}
        </div>
      </div>
      <RowActions pr={pr} actions={actions} />
    </li>
  );
}

function RowActions({ pr, actions }: { pr: LinkedQueuePr; actions: CardHandlers }) {
  const navigation = usePullRequestsNavigation();
  const thread = pr.thread;
  const busy = actions.busy(pr);
  const reviewed = pr.review === "reviewed";
  const markLabel = reviewed ? "Mark as needs review" : "Mark reviewed";
  return (
    <div className="col-start-2 -ml-2 flex flex-wrap items-center gap-0.5 @lg:col-start-3 @lg:row-start-1 @lg:-mr-1.5 @lg:ml-0 @lg:self-center">
      {thread !== null ? (
        <button
          type="button"
          className={cn(ACTION_CLASS, "mr-1 border border-input")}
          onClick={() => navigation.toThread(thread.id)}
        >
          <Icon name="MessageSquare" className="size-4" />
          Open thread
        </button>
      ) : (
        pr.projectIds.length > 0 && (
          <button
            type="button"
            className={cn(ACTION_CLASS, "mr-1 border border-input")}
            onClick={() => navigation.go({ kind: "review", repo: pr.repo, number: pr.number })}
          >
            <Icon name="MessageSquarePlus" className="size-4" />
            Review in thread
          </button>
        )
      )}
      {thread?.isReviewThread && (
        <IconTooltip label="Archive thread">
          <button
            type="button"
            aria-label="Archive thread"
            className={ICON_ACTION_CLASS}
            onClick={() => actions.archive(pr, thread.id)}
            disabled={busy}
          >
            <Icon name="Archive" className="size-4" />
          </button>
        </IconTooltip>
      )}
      <IconTooltip label={markLabel}>
        <button
          type="button"
          aria-label={markLabel}
          className={cn(ICON_ACTION_CLASS, !reviewed && "hover:text-success")}
          onClick={() => actions.mark(pr, !reviewed)}
          disabled={busy}
        >
          <Icon
            name={busy ? "Loading" : reviewed ? "RotateCcw" : "Check"}
            className={cn("size-4", busy && "animate-spin motion-reduce:animate-none")}
          />
        </button>
      </IconTooltip>
      <IconTooltip label="Open on GitHub">
        <UrlLink href={pr.url} aria-label="Open on GitHub" className={ICON_ACTION_CLASS}>
          <Icon name="Github" className="size-4" />
        </UrlLink>
      </IconTooltip>
    </div>
  );
}
