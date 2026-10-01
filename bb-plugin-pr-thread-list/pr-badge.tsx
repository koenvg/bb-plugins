import { experimental_Icon as Icon, type PluginSidebarThreadPullRequestState } from "@get-bb/plugin-sdk/app";
import type { PrInsight } from "./pr-insight";
import { presentPullRequest } from "./pr-status";
import { Tip } from "./tip";

const CHECKS_TONE = { passed: "text-success", running: "text-warning-text", failed: "text-destructive", unknown: "text-muted-foreground" };
const TONE = { merged: "text-violet-600 dark:text-violet-400", problem: "text-destructive", ready: "text-primary", waiting: "text-muted-foreground", neutral: "text-muted-foreground" };

export function PrBadgeView({ isLoading, pullRequest, insight }: PluginSidebarThreadPullRequestState & { insight: PrInsight | null }) {
  if (isLoading || !pullRequest) return <span data-testid="pr-hook-consumer" hidden />;
  const view = presentPullRequest(pullRequest, insight);
  const content = <>
    <span className="sr-only">{view.label}</span>
    <span aria-hidden className="contents">
      <Tip text={view.leadTitle} side="end" className="inline-flex items-center">
        <Icon name={view.lead} className={`size-3 shrink-0 ${view.tone === "merged" ? TONE.merged : CHECKS_TONE[view.checks]}`} />
      </Tip>
      {view.marks.map((mark) => <Tip key={mark.icon} text={mark.title} side="end"
        className={`inline-flex items-center gap-0.5 tabular-nums ${TONE[mark.tone]}`}>
        <Icon name={mark.icon} className={`size-3 ${mark.spin ? "motion-safe:animate-spin" : ""}`} />
        {mark.count ?? null}
      </Tip>)}
      {view.word ? <span className={`truncate font-medium ${TONE[view.tone]}`}>{view.word}</span> : null}
    </span>
  </>;
  const badge = "inline-flex max-w-48 items-center gap-1 rounded px-1 text-[11px] leading-4";
  const safeUrl = /^https?:\/\//i.test(pullRequest.url) ? pullRequest.url : null;
  return <span data-testid="pr-hook-consumer" className="flex min-w-0 shrink-0">
    {safeUrl ? <a href={safeUrl} target="_blank" rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      className={`${badge} hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
      {content}
    </a> : <span className={badge}>{content}</span>}
  </span>;
}
