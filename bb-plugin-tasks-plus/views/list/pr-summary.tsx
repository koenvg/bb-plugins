import { useRef, useState } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import type { TaskWorkStatus } from "../../shared/contract.js";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Icon } from "@/components/ui/icon";
import { COARSE_POINTER_TEXT_SM_CLASS } from "@/components/ui/coarse-pointer-sizing";
import { ageRichDetails } from "../../shared/work-status-freshness.js";
import {
  aggregatePrs,
  currentConditions,
  LIFECYCLE_LABELS as LABELS,
  primaryBucket,
  qualityLabel,
  type WorkPr,
} from "./pr-presentation.js";
import { PrRichDetail } from "./pr-rich-detail.js";

const CHIP = `relative z-10 flex max-w-full flex-wrap items-center gap-x-1 rounded-md border border-border px-1.5 py-px text-muted-foreground tabular-nums hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${COARSE_POINTER_TEXT_SM_CLASS}`;
const stopActivation = (event: React.KeyboardEvent) => {
  if (event.key === "Enter" || event.key === " ") event.stopPropagation();
};
function identity(pr: WorkPr) {
  return `${new URL(pr.url).pathname.split("/").slice(1, 3).join("/")} #${pr.number}`;
}
function GitHubLink({ pr, compact = false }: { pr: WorkPr; compact?: boolean }) {
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open GitHub PR ${identity(pr)}, ${[LABELS[pr.state], ...currentConditions(pr)].join(", ")}`}
      className={
        compact
          ? CHIP
          : "break-words text-sm underline decoration-border underline-offset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      }
      onClick={(event) => event.stopPropagation()}
      onKeyDown={stopActivation}
    >
      {compact ? (
        <>
          <Icon name="GitPullRequest" className="size-3 shrink-0" />
          <span>
            PR #{pr.number} ·{" "}
            <span className={primaryBucket(pr).problem ? "text-destructive" : undefined}>
              {primaryBucket(pr).label}
            </span>
          </span>
        </>
      ) : (
        identity(pr)
      )}
    </a>
  );
}

/** Read-only lifecycle, check/review conditions, bounded aggregates and drill-down. */
export function PrSummary({
  taskKey,
  meta,
}: {
  taskKey: string;
  meta: TaskWorkStatus | undefined;
}) {
  const navigate = useBbNavigate();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  if (!meta)
    return (
      <span className={CHIP} aria-busy="true">
        PRs loading
      </span>
    );
  const prs = meta.pullRequests;
  // Older/missing wire data is uncertainty, never authoritative absence.
  const items = (prs?.items ?? []).map((pr) => ageRichDetails(pr, Date.now()));
  const unavailable = prs?.unavailableThreadIds ?? [];
  if (prs?.availability === "available" && items.length === 0) return null;
  const buckets = aggregatePrs(items);
  const detailGaps = (["stale", "unavailable", "incomplete"] as const).flatMap((quality) => {
    const count = items.filter((pr) => pr.details === quality).length;
    return count ? [`${count} details ${quality}`] : [];
  });
  const incomplete = unavailable.length
    ? `${unavailable.length} lookup${unavailable.length === 1 ? "" : "s"} unavailable`
    : prs?.availability !== "available"
      ? "Lookup unavailable"
      : null;
  const single = items.length === 1 ? items[0]! : null;
  const qualityLabels = [
    ...new Set(items.filter((pr) => pr.details !== "available").map(qualityLabel)),
  ];
  const compactQuality =
    items.length === 0
      ? null
      : incomplete || qualityLabels.length > 1
        ? "Details incomplete"
        : (qualityLabels[0] ?? (single ? "Details" : null));
  const summary = items.length
    ? `${items.length} PR${items.length === 1 ? "" : "s"}`
    : "PRs unavailable";
  const description = [
    summary,
    ...buckets.map((bucket) => `${bucket.count} ${bucket.label}`),
    incomplete,
    ...detailGaps,
  ]
    .filter(Boolean)
    .join(", ");
  const overflow = buckets.slice(2).reduce((count, bucket) => count + bucket.count, 0);
  const threadLink = (threadId: string) => {
    const thread = meta.threads.find((thread) => thread.threadId === threadId);
    if (thread?.execution === "removed")
      return (
        <span className="block break-words text-xs">
          {thread.title} · {threadId} · Removed
        </span>
      );
    return (
      <a
        href={`/threads/${threadId}`}
        aria-label={`Open thread ${thread?.title ?? threadId}, ${threadId}`}
        className="block break-words text-xs underline decoration-border underline-offset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={(event) => {
          event.stopPropagation();
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          navigate.toThread(threadId);
          setOpen(false);
        }}
      >
        {thread?.title ?? threadId} · {threadId}
      </a>
    );
  };
  return (
    <>
      {single ? <GitHubLink pr={single} compact /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={trigger}
            type="button"
            className={CHIP}
            aria-label={`${single ? "PR details" : "PRs"} for ${taskKey}: ${description}`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={stopActivation}
          >
            {single ? (
              <span>{compactQuality}</span>
            ) : (
              <>
                <Icon name="GitPullRequest" className="size-3 shrink-0" />
                <span className="whitespace-nowrap">{summary}</span>
                {buckets.slice(0, 2).map((bucket) => (
                  <span
                    key={bucket.key}
                    className={`whitespace-nowrap ${bucket.problem ? "text-destructive" : ""}`}
                  >
                    · {bucket.count} {bucket.label}
                  </span>
                ))}
                {overflow ? <span className="whitespace-nowrap">· +{overflow} more</span> : null}
              </>
            )}
            {!single && compactQuality ? (
              <span className="whitespace-nowrap">· {compactQuality}</span>
            ) : null}
            <Icon name="ChevronDown" className="size-3 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          aria-label={`PRs for ${taskKey}`}
          mobileTitle={`PRs for ${taskKey}`}
          className="max-h-96 w-96 max-w-[calc(100vw-2rem)] overflow-y-auto p-3"
          onClick={(event) => event.stopPropagation()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <h3 className="mb-2 text-sm font-semibold">PRs for {taskKey}</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Merge readiness requires fresh complete evidence with no blockers or queue activity.
          </p>
          <ul className="space-y-4">
            {items.map((pr) => (
              <li key={pr.url} className="min-w-0">
                <GitHubLink pr={pr} />
                <div className="break-words text-xs">{pr.title}</div>
                <div className="mb-1 text-xs text-muted-foreground">{LABELS[pr.state]}</div>
                <PrRichDetail pr={pr} />
                <ul className="space-y-1">
                  {pr.threadIds.map((id) => (
                    <li key={id}>{threadLink(id)}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {incomplete ? (
            <div className="mt-3 text-xs text-muted-foreground">
              <p>{incomplete}.</p>
              <p>PR lookup unavailable. Known PRs do not cover every attachment.</p>
              <ul className="mt-1 space-y-1">
                {unavailable.map((id) => (
                  <li key={id}>{threadLink(id)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </>
  );
}
