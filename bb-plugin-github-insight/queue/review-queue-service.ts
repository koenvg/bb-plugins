import type { NewThreadRequest, PluginKvStorage } from "@get-bb/plugin-sdk";
import { z } from "zod";
import type { ActionResult } from "../contract";
import type { PullRequestRef } from "../core/pr-ref";
import { readReviewPr, type ReviewPr } from "../core/review-pr";
import { parseGithubRepo, type QueueList } from "../core/review-queue";
import {
  loadedReviewQueueSchema,
  type LinkedQueueList,
  type LoadedReviewQueue,
  type MyReview,
  type ReviewQueueResult,
  type ReviewQueueView,
  type ReviewThreadStatus,
} from "../core/review-queue-view";
import type { PrResolution } from "../pr-lookup";

export const NO_HOST_MESSAGE = "No host available";
export const NOT_A_REVIEW_THREAD_MESSAGE = "This thread is not a review thread";
export const REVIEW_QUEUE_INTERVAL_MS = 5 * 60_000;
export const REVIEW_QUEUE_STORAGE_KEY = "review-queue";

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
  fetchReviewQueue(hostId: string): Promise<QueueList>;
  listProjects(): Promise<QueueProject[]>;
  listThreads(): Promise<QueueThread[]>;
  listReviewThreads(): Promise<QueueReviewThread[]>;
  readPluginMetadata(threadId: string): Promise<unknown>;
  spawnReviewThread(pr: ReviewPr, request: NewThreadRequest): Promise<string>;
  archiveThread(threadId: string): Promise<void>;
  resolveEnvironmentPr(environmentId: string): Promise<PrResolution>;
  kv: Pick<PluginKvStorage, "get" | "set">;
  publish(result: LoadedReviewQueue): void;
  warn(message: string): void;
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

const storedReviewQueueSchema = z.object({ v: z.literal(1), result: loadedReviewQueueSchema });

function viewOf(result: LoadedReviewQueue): ReviewQueueView | null {
  if (result.kind === "error") return result.lastGood;
  const { kind: _, ...view } = result;
  return view;
}

function unlinked(list: LinkedQueueList): QueueList {
  return {
    truncated: list.truncated,
    groups: list.groups.map((group) => ({
      repo: group.repo,
      prs: group.prs.map(({ projectIds: _, threadId: __, ...pr }) => pr),
    })),
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}

export function createReviewQueueService(deps: ReviewQueueServiceDeps) {
  let running: Promise<LoadedReviewQueue> | null = null;
  let queued: Promise<LoadedReviewQueue> | null = null;

  async function readStored(): Promise<LoadedReviewQueue | null> {
    const parsed = storedReviewQueueSchema.safeParse(await deps.kv.get(REVIEW_QUEUE_STORAGE_KEY));
    return parsed.success ? parsed.data.result : null;
  }

  async function store(result: LoadedReviewQueue): Promise<void> {
    await deps.kv.set(REVIEW_QUEUE_STORAGE_KEY, { v: 1, result });
    deps.publish(result);
  }

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

  async function linkView(reviewRequests: QueueList, loadedAt: number): Promise<ReviewQueueView> {
    const loadingReviews = startedReviews();
    const [projectIds, reviews, threadIds] = await Promise.all([
      projectIdsByRepo(),
      loadingReviews,
      loadingReviews.then(threadIdsByPr),
    ]);
    return {
      myReviews: reviews.map(toMyReview),
      reviewRequests: link(reviewRequests, projectIds, threadIds),
      loadedAt,
    };
  }

  async function load(): Promise<ReviewQueueView> {
    const hostId = await deps.primaryHostId();
    if (hostId === null) throw new Error(NO_HOST_MESSAGE);
    const reviewRequests = await deps.fetchReviewQueue(hostId);
    return linkView(reviewRequests, deps.now());
  }

  async function runLoad(): Promise<LoadedReviewQueue> {
    let result: LoadedReviewQueue;
    try {
      result = { kind: "ok", ...(await load()) };
    } catch (error) {
      const previous = await readStored().catch(() => null);
      result = { kind: "error", message: errorText(error), lastGood: previous && viewOf(previous) };
    }
    await store(result).catch((error) => deps.warn(`Review queue store failed: ${errorText(error)}`));
    return result;
  }

  function refreshReviewQueue(): Promise<LoadedReviewQueue> {
    if (running === null) {
      running = runLoad().finally(() => {
        running = null;
      });
      return running;
    }
    queued ??= running.then(() => {
      queued = null;
      return refreshReviewQueue();
    });
    return queued;
  }

  async function getReviewQueue(): Promise<ReviewQueueResult> {
    return (await readStored()) ?? { kind: "loading" };
  }

  async function relink(): Promise<void> {
    try {
      await running;
      const stored = await readStored();
      const view = stored && viewOf(stored);
      if (stored === null || view === null) return;
      const next = await linkView(unlinked(view.reviewRequests), view.loadedAt);
      // A load that finished meanwhile has newer GitHub data; keep it over this re-link.
      const current = await readStored();
      if (current === null || viewOf(current)?.loadedAt !== view.loadedAt) return;
      await store(current.kind === "ok" ? { kind: "ok", ...next } : { ...current, lastGood: next });
    } catch (error) {
      deps.warn(`Review queue update failed: ${errorText(error)}`);
    }
  }

  async function startReview(pr: ReviewPr, request: NewThreadRequest): Promise<string> {
    const threadId = await deps.spawnReviewThread(pr, request);
    void relink();
    return threadId;
  }

  async function archiveReview(threadId: string): Promise<ActionResult> {
    try {
      if (readReviewPr(await deps.readPluginMetadata(threadId)) === null) {
        return { kind: "error", message: NOT_A_REVIEW_THREAD_MESSAGE };
      }
      await deps.archiveThread(threadId);
    } catch (error) {
      return { kind: "error", message: errorText(error) };
    }
    void relink();
    return { kind: "ok" };
  }

  async function run(signal: AbortSignal): Promise<void> {
    const aborted = new Promise<void>((resolve) =>
      signal.addEventListener("abort", () => resolve(), { once: true }),
    );
    while (!signal.aborted) {
      await Promise.race([refreshReviewQueue(), aborted]);
      if (signal.aborted) return;
      await sleep(REVIEW_QUEUE_INTERVAL_MS, signal);
    }
  }

  return { getReviewQueue, refreshReviewQueue, startReview, archiveReview, run };
}
