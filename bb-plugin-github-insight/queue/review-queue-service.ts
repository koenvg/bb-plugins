import type {
  ActionResult,
  LinkedQueueList,
  MyReview,
  ReviewQueueResult,
  ReviewQueueView,
  ReviewThreadStatus,
} from "../contract";
import type { PullRequestRef } from "../core/pr-ref";
import { readReviewPr, type ReviewPr } from "../core/review-pr";
import { parseGithubRepo, type QueueList, type ReviewQueue } from "../core/review-queue";
import type { PrResolution } from "../pr-lookup";

export const NO_HOST_MESSAGE = "No host available";
export const NOT_A_REVIEW_THREAD_MESSAGE = "This thread is not a review thread";

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

export interface QueueReviewThread {
  id: string;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
  status: "error" | "active" | "idle" | "pending" | "starting" | "stopping";
  hasPendingInteraction: boolean;
}

export interface ReviewQueueServiceDeps {
  primaryHostId(): Promise<string | null>;
  fetchReviewQueue(hostId: string): Promise<ReviewQueue>;
  listProjects(): Promise<QueueProject[]>;
  listThreads(): Promise<QueueThread[]>;
  listReviewThreads(): Promise<QueueReviewThread[]>;
  readPluginMetadata(threadId: string): Promise<unknown>;
  archiveThread(threadId: string): Promise<void>;
  resolveEnvironmentPr(environmentId: string): Promise<PrResolution>;
  now(): number;
}

interface StartedReview {
  thread: QueueReviewThread;
  pr: ReviewPr;
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

function reviewThreadStatus(thread: QueueReviewThread): ReviewThreadStatus {
  if (thread.hasPendingInteraction) return "needs_you";
  if (thread.status === "idle") return "idle";
  if (thread.status === "error") return "error";
  return "running";
}

function toMyReview({ thread, pr }: StartedReview): MyReview {
  return { ...pr, threadId: thread.id, status: reviewThreadStatus(thread) };
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

  async function readStartedReview(thread: QueueReviewThread): Promise<StartedReview | null> {
    const pr = readReviewPr(await deps.readPluginMetadata(thread.id).catch(() => null));
    return pr === null ? null : { thread, pr };
  }

  async function startedReviews(): Promise<StartedReview[]> {
    const threads = (await deps.listReviewThreads()).filter((thread) => thread.archivedAt === null);
    const reviews = await Promise.all(threads.map(readStartedReview));
    return reviews
      .filter((review) => review !== null)
      .sort((a, b) => b.thread.createdAt - a.thread.createdAt);
  }

  async function threadIdsByPr(reviews: StartedReview[]): Promise<Map<string, string>> {
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
    const links = [
      ...linked.flatMap(({ thread, resolution }) =>
        resolution.kind === "pr" ? [{ key: refKey(resolution.target.ref), thread }] : [],
      ),
      ...reviews.map(({ thread, pr }) => ({ key: prKey(pr.repo, pr.number), thread })),
    ].sort((a, b) => b.thread.updatedAt - a.thread.updatedAt);
    const byPr = new Map<string, string>();
    for (const { key, thread } of links) {
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
    const loadingReviews = startedReviews();
    const [queue, projectIds, reviews, threadIds] = await Promise.all([
      deps.fetchReviewQueue(hostId),
      projectIdsByRepo(),
      loadingReviews,
      loadingReviews.then(threadIdsByPr),
    ]);
    return {
      myReviews: reviews.map(toMyReview),
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

  async function archiveReview(threadId: string): Promise<ActionResult> {
    try {
      if (readReviewPr(await deps.readPluginMetadata(threadId)) === null) {
        return { kind: "error", message: NOT_A_REVIEW_THREAD_MESSAGE };
      }
      await deps.archiveThread(threadId);
      return { kind: "ok" };
    } catch (error) {
      return { kind: "error", message: errorText(error) };
    }
  }

  return { getReviewQueue, archiveReview };
}
