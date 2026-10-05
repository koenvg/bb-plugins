import { useMemo } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";

export const PANEL_PATH = "pull-requests";

export type PullRequestsRoute = { kind: "list" } | { kind: "review"; repo: string; number: number };

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function parsePullRequestsRoute(subPath: string): PullRequestsRoute {
  const segments = subPath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(decodeSegment);
  const [head, owner, repo, number] = segments;
  if (
    head === "review" &&
    segments.length === 4 &&
    owner !== undefined &&
    repo !== undefined &&
    number !== undefined &&
    /^[1-9]\d*$/.test(number)
  ) {
    return { kind: "review", repo: `${owner}/${repo}`, number: Number(number) };
  }
  return { kind: "list" };
}

export function pullRequestsRouteToSubPath(route: PullRequestsRoute): string {
  if (route.kind === "list") return "";
  const [owner = "", repo = ""] = route.repo.split("/");
  return `review/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${route.number}`;
}

export function usePullRequestsNavigation() {
  const navigate = useBbNavigate();
  return useMemo(
    () => ({
      go: (route: PullRequestsRoute) =>
        navigate.toPluginPanel(PANEL_PATH, { subPath: pullRequestsRouteToSubPath(route) }),
      toThread: (threadId: string) => navigate.toThread(threadId),
    }),
    [navigate],
  );
}
