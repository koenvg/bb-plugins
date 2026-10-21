import type { PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import type { PullRequestRef } from "../core/pr-ref";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { PrOverview } from "./overview-tab";
import {
  LIST_ROUTE,
  parsePullRequestsRoute,
  pullRequestsRouteToSubPath,
  usePullRequestsNavigation,
} from "./pull-requests-routes";
import { ICON_ACTION_CLASS } from "./queue-styles";
import { ReviewComposerPage } from "./review-composer";
import { ReviewQueueLists } from "./review-queue-list";
import { usePrInsight } from "./use-pr-insight";
import { useReviewQueue } from "./use-review-queue";

export function PullRequestsPanel({ subPath }: PluginNavPanelProps) {
  const queue = useReviewQueue();
  const route = parsePullRequestsRoute(subPath);
  if (route.kind === "review") {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4">
        <ReviewComposerPage key={pullRequestsRouteToSubPath(route)} route={route} queue={queue} />
      </div>
    );
  }
  const { selected } = route;
  return (
    <div className="@container flex h-full min-h-0">
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-y-auto p-4",
          selected !== null && "hidden @3xl:block",
        )}
      >
        <ReviewQueueLists queue={queue} selected={selected} />
      </div>
      {selected !== null && <PrSidePanel key={pullRequestsRouteToSubPath(route)} pr={selected} />}
    </div>
  );
}

function PrSidePanel({ pr }: { pr: PullRequestRef }) {
  const navigation = usePullRequestsNavigation();
  const insight = usePrInsight(pr);
  return (
    <aside
      aria-label="Pull request overview"
      className="flex min-h-0 w-full min-w-0 shrink-0 flex-col border-border @3xl:w-[440px] @3xl:border-l @6xl:w-[520px]"
    >
      <header className="flex min-w-0 items-center gap-2 border-b border-border py-1 pr-2 pl-4">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
          {pr.owner}/{pr.repo}
        </span>
        <button
          type="button"
          aria-label="Close overview"
          className={ICON_ACTION_CLASS}
          onClick={() => navigation.go(LIST_ROUTE)}
        >
          <Icon name="X" className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <PrOverview insight={insight} noPrText="Pull request not found" controls={null} />
      </div>
    </aside>
  );
}
