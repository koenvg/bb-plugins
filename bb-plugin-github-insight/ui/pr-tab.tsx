import { useEffect, useState, type ReactNode } from "react";
import { UrlLink, useBbNavigate } from "@get-bb/plugin-sdk/app";
import { countOf, type Blocker } from "../core/blockers";
import type { Check, CheckStatus } from "../core/checks";
import type { CheckFailure } from "../core/failure";
import type { PrInsight } from "../core/overview";
import { relativeTime } from "../core/relative-time";
import { reviewerKey, type Reviewer } from "../core/reviewers";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { blockerTone } from "./blocker-tone";
import { useCommandIntent, type IntentOf } from "./command-intents";
import { AutoMergeButton } from "./auto-merge-button";
import { BranchUpdateButton, PullReminder } from "./branch-update-button";
import { MergeActionButton } from "./merge-action-button";
import { useInsight } from "./use-insight";
import { Notice, RefreshButton, RefreshError } from "./feedback";
import { prStatusView, prSummaryLine, type StatusRow, type SummaryLine } from "./pr-status-view";

const OPEN_STATUSES: readonly CheckStatus[] = ["failed", "cancelled", "running"];

const COLLAPSED_STATUSES: readonly CheckStatus[] = ["passed", "skipped"];

const STATUS_ICON: Record<CheckStatus, { name: IconName; className: string }> = {
  failed: { name: "CircleX", className: "text-destructive" },
  cancelled: { name: "Unavailable", className: "text-muted-foreground" },
  running: { name: "Spinner", className: "text-attention" },
  passed: { name: "CircleCheck", className: "text-success" },
  skipped: { name: "Circle", className: "text-muted-foreground" },
};

const REVIEWER_STATE_LABEL: Record<Reviewer["state"], string> = {
  pending: "Pending",
  approved: "Approved",
  changes_requested: "Changes requested",
  commented: "Commented",
  dismissed: "Dismissed",
};

function usePrCommands(
  threadId: string,
  { result, refreshing, refresh }: ReturnType<typeof useInsight>,
) {
  const navigate = useBbNavigate();
  const [intent, setIntent] = useState<IntentOf<"pr"> | null>(null);
  useCommandIntent(threadId, "pr", setIntent);

  useEffect(() => {
    if (intent === null || result === null || refreshing) return;
    setIntent(null);
    if (intent === "refresh") {
      refresh();
      return;
    }
    if (result.kind !== "ok") return;
    if (intent === "open-on-github") navigate.openUrl(result.insight.pr.url);
  }, [intent, result, refreshing, refresh, navigate]);
}

export function PrTab({ threadId }: { threadId: string }) {
  return <PrTabContent key={threadId} threadId={threadId} />;
}

function PrTabContent({ threadId }: { threadId: string }) {
  const insight = useInsight(threadId);
  const { result, refreshing, revalidating, refresh } = insight;
  const [branchUpdated, setBranchUpdated] = useState(false);
  usePrCommands(threadId, insight);
  if (result === null) return <Notice>Loading pull request…</Notice>;
  if (result.kind === "no_pr") {
    return <Notice>No pull request for this thread</Notice>;
  }
  if (result.kind === "error") {
    return (
      <RefreshError message={result.message} refreshedAt={null} retry={refresh} busy={refreshing} />
    );
  }
  const status = prStatusView(result.insight);
  const { autoMergeAction } = result.insight;
  return (
    <div className="flex flex-col gap-4">
      <PrHeader
        pr={result.insight.pr}
        lifecycle={status.lifecycle}
        age={<DataAge refreshedAt={result.refreshedAt} updating={revalidating} />}
        action={<RefreshButton refreshing={refreshing} refresh={refresh} />}
      />
      <PrSummary
        line={prSummaryLine(result.insight)}
        action={
          autoMergeAction.kind === "disable" && (
            <AutoMergeButton threadId={threadId} pr={result.insight.pr} action={autoMergeAction} />
          )
        }
      />
      {result.error !== null && (
        <RefreshError
          message={result.error}
          refreshedAt={result.refreshedAt}
          retry={refresh}
          busy={refreshing}
        />
      )}
      {branchUpdated && <PullReminder dismiss={() => setBranchUpdated(false)} />}
      {status.action !== null && (
        <MergeActionButton threadId={threadId} pr={result.insight.pr} action={status.action} />
      )}
      {autoMergeAction.kind === "enable" && (
        <AutoMergeButton threadId={threadId} pr={result.insight.pr} action={autoMergeAction} />
      )}
      {result.insight.canUpdateBranch && (
        <BranchUpdateButton
          threadId={threadId}
          pr={result.insight.pr}
          onUpdated={() => setBranchUpdated(true)}
        />
      )}
      <BlockerList blockers={status.blockers} />
      <ReviewerList reviewers={result.insight.reviewers} />
      <CheckList checks={result.insight.checks} />
    </div>
  );
}

function PrHeader({
  pr,
  lifecycle,
  age,
  action,
}: {
  pr: PrInsight["pr"];
  lifecycle: StatusRow;
  age: ReactNode;
  action: ReactNode;
}) {
  const merged = pr.state === "merged";
  return (
    <header className={cn("flex min-w-0 flex-col", merged ? "gap-2" : "gap-1")}>
      {merged && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md bg-violet-500/10 px-3 py-3 text-violet-700 [.dark_&]:text-violet-300"
        >
          <Icon name="GitMerge" aria-hidden="true" className="size-5 shrink-0" />
          <h2 className="text-sm font-semibold">{lifecycle.text}</h2>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">#{pr.number}</span>
        {!merged && (
          <span className="rounded-full border border-border px-2 py-0.5">{lifecycle.text}</span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {age}
          <UrlLink href={pr.url} className="underline-offset-2 hover:underline">
            Open on GitHub
          </UrlLink>
          {action}
        </div>
      </div>
      <h2 className="break-words text-sm font-semibold">{pr.title}</h2>
      <PrMeta pr={pr} />
    </header>
  );
}

function branchLabel(pr: PrInsight["pr"]): string {
  const head = pr.headOwner === null ? pr.headRefName : `${pr.headOwner}:${pr.headRefName}`;
  return `${head} → ${pr.baseRefName}`;
}

function PrMeta({ pr }: { pr: PrInsight["pr"] }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex min-w-0 items-center gap-1">
        <Icon name="GitBranch" className="size-3.5 shrink-0" />
        <span className="truncate font-mono">{branchLabel(pr)}</span>
      </span>
      <span className="inline-flex gap-1 font-mono tabular-nums">
        <span className="text-success">+{pr.additions}</span>
        <span className="text-destructive">-{pr.deletions}</span>
      </span>
      <span className="tabular-nums">{countOf(pr.changedFiles, "file")}</span>
      {pr.author !== null && <span>{pr.author}</span>}
    </div>
  );
}

function PrSummary({ line, action }: { line: SummaryLine | null; action: ReactNode }) {
  if (line === null) return null;
  return (
    <div
      role="status"
      aria-label="Merge status"
      className="flex items-center gap-2 text-sm font-medium"
    >
      <Icon name={line.icon} className={cn("size-4 shrink-0", line.iconClassName)} />
      <span className={line.textClassName}>{line.text}</span>
      {line.more > 0 && (
        <span className="text-xs font-normal text-muted-foreground">+{line.more} more</span>
      )}
      {action}
    </div>
  );
}

function DataAge({ refreshedAt, updating }: { refreshedAt: number; updating: boolean }) {
  const readAt = new Date(refreshedAt);
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      {updating && (
        <span role="status" aria-label="Updating">
          <Icon name="Spinner" className="size-3 text-muted-foreground" />
        </span>
      )}
      Updated{" "}
      <time dateTime={readAt.toISOString()} title={readAt.toLocaleString()}>
        {relativeTime(readAt, new Date())}
      </time>
    </span>
  );
}

const SECTION_HEADING_CLASS = "text-xs font-medium text-muted-foreground";

const LABEL_CLASS =
  "shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground";

function BlockerList({ blockers }: { blockers: readonly Blocker[] }) {
  if (blockers.length < 2) return null;
  return (
    <section aria-label="Merge blockers" className="flex flex-col gap-1">
      <h3 className={SECTION_HEADING_CLASS}>Merge blockers</h3>
      <ul className="flex flex-col">
        {blockers.map((blocker) => (
          <li key={blocker.code} className="flex items-center gap-2 py-0.5 text-sm">
            <Icon name="AlertCircle" className={cn("size-4 shrink-0", blockerTone(blocker.code))} />
            {blocker.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReviewerList({ reviewers }: { reviewers: readonly Reviewer[] }) {
  if (reviewers.length === 0) return null;
  return (
    <section aria-label="Reviewers" className="flex flex-col gap-1">
      <h3 className={SECTION_HEADING_CLASS}>Reviewers</h3>
      <ul className="flex flex-col">
        {reviewers.map((reviewer) => (
          <li
            key={reviewerKey(reviewer)}
            className="flex min-w-0 items-center gap-2 py-0.5 text-sm"
          >
            <span className="truncate">
              {reviewer.kind === "team" ? `${reviewer.name} (team)` : reviewer.name}
            </span>
            <span className={cn(LABEL_CLASS, "ml-auto")}>
              {REVIEWER_STATE_LABEL[reviewer.state]}
            </span>
            {reviewer.codeOwner && <span className={LABEL_CLASS}>code owner</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CheckList({ checks }: { checks: readonly Check[] }) {
  if (checks.length === 0) return <Notice>No checks on the head commit</Notice>;
  const byStatus = (status: CheckStatus) => checks.filter((check) => check.status === status);
  return (
    <section aria-label="Checks" className="flex flex-col gap-3">
      {OPEN_STATUSES.map((status) => {
        const group = byStatus(status);
        if (group.length === 0) return null;
        return (
          <div key={status}>
            <h3 className={SECTION_HEADING_CLASS}>
              <span data-testid="check-group-heading" className="tabular-nums">
                {group.length} {status}
              </span>
            </h3>
            <CheckRows checks={group} />
          </div>
        );
      })}
      <CollapsedChecks groups={COLLAPSED_STATUSES.map((status) => [status, byStatus(status)])} />
    </section>
  );
}

function CollapsedChecks({
  groups,
}: {
  groups: readonly (readonly [CheckStatus, readonly Check[]])[];
}) {
  const [open, setOpen] = useState(false);
  const shown = groups.filter(([, group]) => group.length > 0);
  if (shown.length === 0) return null;
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary
        className={cn(
          SECTION_HEADING_CLASS,
          "flex w-fit cursor-pointer list-none items-center gap-1 select-none rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
      >
        <Icon name={open ? "ChevronDown" : "ChevronRight"} className="size-3.5" />
        <span data-testid="check-group-heading" className="tabular-nums">
          {shown.map(([status, group]) => `${group.length} ${status}`).join(", ")}
        </span>
      </summary>
      {shown.map(([status, group]) => (
        <CheckRows key={status} checks={group} />
      ))}
    </details>
  );
}

function CheckRows({ checks }: { checks: readonly Check[] }) {
  return (
    <ul className="mt-1 flex flex-col">
      {checks.map((check) => (
        <CheckRow key={check.name} check={check} />
      ))}
    </ul>
  );
}

function CheckRow({ check }: { check: Check }) {
  const icon = STATUS_ICON[check.status];
  return (
    <li className="flex min-w-0 flex-col gap-1 py-1 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <Icon name={icon.name} className={cn("size-4 shrink-0", icon.className)} />
        {check.url === null ? (
          <span className="truncate">{check.name}</span>
        ) : (
          <UrlLink href={check.url} className="truncate underline-offset-2 hover:underline">
            {check.name}
          </UrlLink>
        )}
        {check.required && <span className={LABEL_CLASS}>required</span>}
      </div>
      {check.failure !== null && <CheckFailureDetail failure={check.failure} />}
    </li>
  );
}

function CheckFailureDetail({ failure }: { failure: CheckFailure }) {
  const hiddenCount = failure.annotationCount - failure.annotations.length;
  return (
    <div className="flex min-w-0 flex-col gap-1 pl-6 text-xs text-muted-foreground">
      {failure.reason !== "" && (
        <p data-testid="check-reason" className="line-clamp-3 break-words">
          {failure.reason}
        </p>
      )}
      {failure.annotations.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {failure.annotations.map((annotation, index) => (
            <li key={index} data-testid="check-annotation" className="min-w-0 break-words">
              <span className="font-mono">
                {annotation.path}:{annotation.line}
              </span>{" "}
              {annotation.message}
            </li>
          ))}
        </ul>
      )}
      {hiddenCount > 0 && <p>{hiddenCount} more</p>}
    </div>
  );
}
