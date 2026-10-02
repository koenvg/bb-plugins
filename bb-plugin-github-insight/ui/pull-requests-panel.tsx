import type { PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { parsePullRequestsRoute, pullRequestsRouteToSubPath } from "./pull-requests-routes";
import { ReviewComposerPage } from "./review-composer";
import { ReviewQueueLists } from "./review-queue-list";
import { useReviewQueue } from "./use-review-queue";

export function PullRequestsPanel({ subPath }: PluginNavPanelProps) {
  const queue = useReviewQueue();
  const route = parsePullRequestsRoute(subPath);
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4">
      {route.kind === "review" ? (
        <ReviewComposerPage key={pullRequestsRouteToSubPath(route)} route={route} queue={queue} />
      ) : (
        <ReviewQueueLists queue={queue} />
      )}
    </div>
  );
}
