import { useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { MyReview, ReviewThreadStatus, rpcContract } from "../contract";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { messageOf } from "./error-message";
import { Notice } from "./feedback";
import { usePullRequestsNavigation } from "./pull-requests-routes";
import { ACTION_CLASS, COUNT_CLASS } from "./queue-styles";

const STATUS_LABEL: Record<ReviewThreadStatus, { text: string; dotClass: string }> = {
  running: { text: "Running", dotClass: "animate-pulse bg-success motion-reduce:animate-none" },
  needs_you: { text: "Needs you", dotClass: "bg-attention" },
  idle: { text: "Idle", dotClass: "bg-muted-foreground" },
  error: { text: "Error", dotClass: "bg-destructive" },
};

interface MyReviewsProps {
  reviews: MyReview[];
  refresh: () => void;
}

export function MyReviews({ reviews, refresh }: MyReviewsProps) {
  const rpc = useRpc<typeof rpcContract>();
  const [expanded, setExpanded] = useState(true);
  const [archiving, setArchiving] = useState<ReadonlySet<string>>(new Set());
  const [archived, setArchived] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const visible = reviews.filter((review) => !archived.has(review.threadId));

  async function archive(threadId: string) {
    setError(null);
    setArchiving((ids) => new Set(ids).add(threadId));
    try {
      const result = await rpc.call("archiveReview", { threadId });
      if (result.kind === "ok") {
        setArchived((ids) => new Set(ids).add(threadId));
        refresh();
      } else {
        setError(result.message);
      }
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setArchiving((ids) => {
        const next = new Set(ids);
        next.delete(threadId);
        return next;
      });
    }
  }

  return (
    <section aria-label="My reviews" className="flex min-w-0 flex-col gap-3">
      <h2 className="text-sm font-semibold">
        <button
          type="button"
          aria-expanded={expanded}
          className="-mx-2 inline-flex h-8 items-center gap-2 rounded-md px-2 transition-colors duration-150 hover:bg-state-hover hover:duration-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => setExpanded((open) => !open)}
        >
          <Icon
            name="ChevronRight"
            className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-90")}
          />
          My reviews
          <span data-testid="queue-count" className={COUNT_CLASS}>
            {visible.length}
          </span>
        </button>
      </h2>
      {expanded && (
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
          {visible.length === 0 ? (
            <Notice>No review threads</Notice>
          ) : (
            <ul className="flex flex-col gap-2">
              {visible.map((review) => (
                <MyReviewRow
                  key={review.threadId}
                  review={review}
                  archiving={archiving.has(review.threadId)}
                  archive={() => void archive(review.threadId)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

interface MyReviewRowProps {
  review: MyReview;
  archiving: boolean;
  archive: () => void;
}

function MyReviewRow({ review, archiving, archive }: MyReviewRowProps) {
  const navigation = usePullRequestsNavigation();
  const status = STATUS_LABEL[review.status];
  return (
    <li
      aria-label={`${review.repo}#${review.number}`}
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-card px-3 py-2"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{review.repo}</span>
          <span className="shrink-0 font-mono tabular-nums">#{review.number}</span>
          <span data-testid="review-status" className="flex shrink-0 items-center gap-1.5">
            <span aria-hidden="true" className={cn("size-2 rounded-full", status.dotClass)} />
            {status.text}
          </span>
        </div>
        <h3 className="min-w-0 truncate text-sm font-semibold">{review.title}</h3>
      </div>
      <div className="-mx-1.5 flex shrink-0 items-center gap-2">
        <button
          type="button"
          className={cn(ACTION_CLASS, "border border-input")}
          onClick={() => navigation.toThread(review.threadId)}
        >
          <Icon name="MessageSquare" className="size-4" />
          Open thread
        </button>
        <button
          type="button"
          className={cn(ACTION_CLASS, "text-muted-foreground hover:text-foreground disabled:opacity-60")}
          onClick={archive}
          disabled={archiving}
        >
          <Icon name="Archive" className="size-4" />
          Archive
        </button>
      </div>
    </li>
  );
}
