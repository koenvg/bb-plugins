import type { LinkedQueueList, ReviewQueueResult, ReviewQueueView } from "../contract";
import type { PullRequestRef } from "../core/pr-ref";
import { parseGithubRepo, type QueueList, type ReviewQueue } from "../core/review-queue";
import type { PrResolution } from "../pr-lookup";

export const NO_HOST_MESSAGE = "No host available";

export interface QueueProject {
  id: string;
  kind: "personal" | "standard";
  gitRemoteUrl: string | null;
  updatedAt: number;
}

export interface QueueThread {
  id: string;
  environmentId: string | null;
  archivedAt: number | null;
  updatedAt: number;
}

export interface ReviewQueueServiceDeps {
  primaryHostId(): Promise<string | null>;
  fetchReviewQueue(hostId: string): Promise<ReviewQueue>;
  listProjects(): Promise<QueueProject[]>;
  listThreads(): Promise<QueueThread[]>;
  resolveEnvironmentPr(environmentId: string): Promise<PrResolution>;
  now(): number;
}

function prKey(repo: string, number: number): string {
  return `${repo.toLowerCase()}#${number}`;
}

function refKey({ owner, repo, number }: PullRequestRef): string {
  return prKey(`${owner}/${repo}`, number);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createReviewQueueService(deps: ReviewQueueServiceDeps) {
  let lastGood: ReviewQueueView | null = null;

  async function projectIdsByRepo(): Promise<Map<string, string[]>> {
    const projects = (await deps.listProjects())
      .filter((project) => project.kind === "standard")
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const byRepo = new Map<string, string[]>();
    for (const project of projects) {
      const repo = parseGithubRepo(project.gitRemoteUrl);
      if (repo !== null) byRepo.set(repo, [...(byRepo.get(repo) ?? []), project.id]);
    }
    return byRepo;
  }

  async function threadIdsByPr(): Promise<Map<string, string>> {
    const threads = (await deps.listThreads())
      .filter((thread) => thread.archivedAt === null && thread.environmentId !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const resolutions = new Map<string, Promise<PrResolution>>();
    const resolve = (environmentId: string) => {
      if (!resolutions.has(environmentId)) {
        resolutions.set(
          environmentId,
          deps.resolveEnvironmentPr(environmentId).catch((): PrResolution => ({ kind: "no_pr" })),
        );
      }
      return resolutions.get(environmentId)!;
    };
    const linked = await Promise.all(
      threads.map(async (thread) => ({ thread, resolution: await resolve(thread.environmentId!) })),
    );
    const byPr = new Map<string, string>();
    for (const { thread, resolution } of linked) {
      if (resolution.kind !== "pr") continue;
      const key = refKey(resolution.target.ref);
      if (!byPr.has(key)) byPr.set(key, thread.id);
    }
    return byPr;
  }

  function link(
    list: QueueList,
    projectIds: Map<string, string[]>,
    threadIds: Map<string, string>,
  ): LinkedQueueList {
    return {
      truncated: list.truncated,
      groups: list.groups.map((group) => ({
        repo: group.repo,
        prs: group.prs.map((pr) => ({
          ...pr,
          projectIds: projectIds.get(pr.repo.toLowerCase()) ?? [],
          threadId: threadIds.get(prKey(pr.repo, pr.number)) ?? null,
        })),
      })),
    };
  }

  async function load(): Promise<ReviewQueueView> {
    const hostId = await deps.primaryHostId();
    if (hostId === null) throw new Error(NO_HOST_MESSAGE);
    const [queue, projectIds, threadIds] = await Promise.all([
      deps.fetchReviewQueue(hostId),
      projectIdsByRepo(),
      threadIdsByPr(),
    ]);
    return {
      reviewRequests: link(queue.reviewRequests, projectIds, threadIds),
      myPrs: link(queue.myPrs, projectIds, threadIds),
      loadedAt: deps.now(),
    };
  }

  async function getReviewQueue(): Promise<ReviewQueueResult> {
    try {
      lastGood = await load();
      return { kind: "ok", ...lastGood };
    } catch (error) {
      return { kind: "error", message: errorText(error), lastGood };
    }
  }

  return { getReviewQueue };
}
