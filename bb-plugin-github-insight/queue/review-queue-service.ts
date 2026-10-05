import type { NewThreadRequest, PluginKvStorage } from "@get-bb/plugin-sdk";
import { z } from "zod";
import type { ActionResult, MarkNeedsReviewRequest, MarkReviewedRequest } from "../contract";
import type { PullRequestRef } from "../core/pr-ref";
import { readReviewPr, type ReviewPr } from "../core/review-pr";
import { parseGithubRepo, type FetchedQueue } from "../core/review-queue";
import {
  loadedReviewQueueSchema,
  type LinkedQueuePr,
  type LinkedThread,
  type LoadedReviewQueue,
  type QueueRow,
  type QueueSection,
  type ReviewQueueResult,
  type ReviewQueueView,
  type ReviewThreadStatus,
} from "../core/review-queue-view";
import { reviewState } from "../core/review-state";
import type { PrResolution } from "../pr-lookup";
import { isSharedEnvironment } from "./review-environment";
import { createReviewedMarks } from "./reviewed-marks";

export const NO_HOST_MESSAGE = "No host available";
export const NOT_A_REVIEW_THREAD_MESSAGE = "This thread is not a review thread";
export const SHARED_ENVIRONMENT_MESSAGE = "Review threads need a new worktree";
export const INVALID_REPOSITORY_MESSAGE = "Repository must be owner/name";
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
  createdAt: number;
  updatedAt: number;
  status: "error" | "active" | "idle" | "pending" | "starting" | "stopping";
  hasPendingInteraction: boolean;
}

export interface ReviewQueueServiceDeps {
  primaryHostId(): Promise<string | null>;
  fetchReviewQueue(hostId: string, tracked: PullRequestRef[]): Promise<FetchedQueue>;
  listProjects(): Promise<QueueProject[]>;
  listThreads(): Promise<QueueThread[]>;
  listReviewThreads(): Promise<QueueThread[]>;
  readPluginMetadata(threadId: string): Promise<unknown>;
  spawnReviewThread(pr: ReviewPr, request: NewThreadRequest): Promise<string>;
  archiveThread(threadId: string): Promise<void>;
  resolveEnvironmentPr(environmentId: string): Promise<PrResolution>;
  kv: Pick<PluginKvStorage, "get" | "set" | "delete" | "list">;
  publish(result: LoadedReviewQueue): void;
  warn(message: string): void;
  now(): number;
}

interface StartedReview {
  thread: QueueThread;
  pr: ReviewPr;
}

function prKey(repo: string, number: number): string {
  return `${repo.toLowerCase()}#${number}`;
}

function refKey({ owner, repo, number }: PullRequestRef): string {
  return prKey(`${owner}/${repo}`, number);
}

function refOf(repo: string, number: number): PullRequestRef | null {
  const [owner, name, ...rest] = repo.split("/");
  if (!owner || !name || rest.length > 0) return null;
  return { owner, repo: name, number };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function threadStatus(thread: QueueThread): ReviewThreadStatus {
  if (thread.hasPendingInteraction) return "needs_you";
  if (thread.status === "idle") return "idle";
  if (thread.status === "error") return "error";
  return "running";
}

const storedReviewQueueSchema = z.object({ v: z.literal(2), result: loadedReviewQueueSchema });

function viewOf(result: LoadedReviewQueue): ReviewQueueView | null {
  if (result.kind === "error") return result.lastGood;
  const { kind: _, ...view } = result;
  return view;
}

function rowsOf(view: ReviewQueueView): QueueRow[] {
  return [...view.needsReview, ...view.reviewed].flatMap((group) =>
    group.prs.map(({ projectIds: _, review: __, thread: ___, ...row }) => row),
  );
}

function mergeRows({ requests, tracked }: FetchedQueue): QueueRow[] {
  const rows = requests.groups.flatMap((group) =>
    group.prs.map((pr) => ({ ...pr, requested: true })),
  );
  const keys = new Set(rows.map((row) => prKey(row.repo, row.number)));
  for (const pr of tracked) {
    const key = prKey(pr.repo, pr.number);
    if (keys.has(key)) continue;
    keys.add(key);
    rows.push({ ...pr, requested: false });
  }
  return rows;
}

function needsYou(pr: LinkedQueuePr): boolean {
  return pr.thread?.status === "needs_you";
}

function byAttentionThenUpdate(a: LinkedQueuePr, b: LinkedQueuePr): number {
  return (
    Number(needsYou(b)) - Number(needsYou(a)) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
  );
}

function sectionOf(prs: LinkedQueuePr[]): QueueSection {
  const byRepo = new Map<string, LinkedQueuePr[]>();
  for (const pr of prs) byRepo.set(pr.repo, [...(byRepo.get(pr.repo) ?? []), pr]);
  return [...byRepo]
    .map(([repo, group]) => ({
      repo,
      prs: group.sort(byAttentionThenUpdate),
      attention: group.some(needsYou),
    }))
    .sort((a, b) => Number(b.attention) - Number(a.attention) || a.repo.localeCompare(b.repo))
    .map(({ repo, prs: group }) => ({ repo, prs: group }));
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
  const marks = createReviewedMarks(deps.kv, deps.now);
  let running: Promise<LoadedReviewQueue> | null = null;
  let queued: Promise<LoadedReviewQueue> | null = null;

  async function readStored(): Promise<LoadedReviewQueue | null> {
    const parsed = storedReviewQueueSchema.safeParse(await deps.kv.get(REVIEW_QUEUE_STORAGE_KEY));
    return parsed.success ? parsed.data.result : null;
  }

  async function store(result: LoadedReviewQueue): Promise<void> {
    await deps.kv.set(REVIEW_QUEUE_STORAGE_KEY, { v: 2, result });
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

  async function readStartedReview(thread: QueueThread): Promise<StartedReview | null> {
    const pr = readReviewPr(await deps.readPluginMetadata(thread.id).catch(() => null));
    return pr === null ? null : { thread, pr };
  }

  async function startedReviews(): Promise<StartedReview[]> {
    const threads = (await deps.listReviewThreads()).filter((thread) => thread.archivedAt === null);
    const reviews = await Promise.all(threads.map(readStartedReview));
    return reviews.filter((review) => review !== null);
  }

  async function threadsByPr(reviews: StartedReview[]): Promise<Map<string, QueueThread>> {
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
    const byPr = new Map<string, QueueThread>();
    for (const { key, thread } of links) {
      if (!byPr.has(key)) byPr.set(key, thread);
    }
    return byPr;
  }

  async function linkView(
    rows: QueueRow[],
    truncated: boolean,
    loadedAt: number,
  ): Promise<ReviewQueueView> {
    const loadingReviews = startedReviews();
    const [projectIds, reviews, threads, marked] = await Promise.all([
      projectIdsByRepo(),
      loadingReviews,
      loadingReviews.then(threadsByPr),
      marks.list(),
    ]);
    const reviewedHeads = new Map(marked.map((mark) => [refKey(mark.ref), mark.headOid]));
    const reviewThreadIds = new Set(reviews.map(({ thread }) => thread.id));
    const prsWithReviewThread = new Set(reviews.map(({ pr }) => prKey(pr.repo, pr.number)));
    const linkThread = (thread: QueueThread | undefined): LinkedThread | null =>
      thread === undefined
        ? null
        : {
            id: thread.id,
            status: threadStatus(thread),
            isReviewThread: reviewThreadIds.has(thread.id),
          };
    const linked = rows.flatMap((row): LinkedQueuePr[] => {
      const key = prKey(row.repo, row.number);
      const reviewedHead = reviewedHeads.get(key) ?? null;
      if (!row.requested && reviewedHead === null && !prsWithReviewThread.has(key)) return [];
      return [
        {
          ...row,
          projectIds: projectIds.get(row.repo.toLowerCase()) ?? [],
          review: reviewState(reviewedHead, row.headOid),
          thread: linkThread(threads.get(key)),
        },
      ];
    });
    return {
      needsReview: sectionOf(linked.filter((pr) => pr.review !== "reviewed")),
      reviewed: sectionOf(linked.filter((pr) => pr.review === "reviewed")),
      truncated,
      loadedAt,
    };
  }

  async function trackedRefs(): Promise<PullRequestRef[]> {
    const [marked, reviews] = await Promise.all([marks.list(), startedReviews()]);
    const refs = [
      ...marked.map((mark) => mark.ref),
      ...reviews.map(({ pr }) => refOf(pr.repo, pr.number)),
    ];
    const byKey = new Map<string, PullRequestRef>();
    for (const ref of refs) {
      if (ref !== null && !byKey.has(refKey(ref))) byKey.set(refKey(ref), ref);
    }
    return [...byKey.values()];
  }

  async function deleteGoneMarks(gone: PullRequestRef[]): Promise<void> {
    await Promise.all(
      gone.map((ref) =>
        marks
          .delete(ref)
          .catch((error) =>
            deps.warn(`Could not delete the reviewed mark of ${refKey(ref)}: ${errorText(error)}`),
          ),
      ),
    );
  }

  async function load(): Promise<ReviewQueueView> {
    const hostId = await deps.primaryHostId();
    if (hostId === null) throw new Error(NO_HOST_MESSAGE);
    const fetched = await deps.fetchReviewQueue(hostId, await trackedRefs());
    await deleteGoneMarks(fetched.gone);
    return linkView(mergeRows(fetched), fetched.requests.truncated, deps.now());
  }

  async function runLoad(): Promise<LoadedReviewQueue> {
    let result: LoadedReviewQueue;
    try {
      result = { kind: "ok", ...(await load()) };
    } catch (error) {
      const previous = await readStored().catch(() => null);
      result = { kind: "error", message: errorText(error), lastGood: previous && viewOf(previous) };
    }
    await store(result).catch((error) =>
      deps.warn(`Review queue store failed: ${errorText(error)}`),
    );
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

  let relinking: Promise<void> = Promise.resolve();

  function relink(): Promise<void> {
    relinking = relinking.then(relinkOnce);
    return relinking;
  }

  async function relinkOnce(): Promise<void> {
    try {
      await running;
      const stored = await readStored();
      const view = stored && viewOf(stored);
      if (stored === null || view === null) return;
      const next = await linkView(rowsOf(view), view.truncated, view.loadedAt);
      // A load that finished meanwhile has newer GitHub data; keep it over this re-link.
      const current = await readStored();
      if (current === null || viewOf(current)?.loadedAt !== view.loadedAt) return;
      await store(current.kind === "ok" ? { kind: "ok", ...next } : { ...current, lastGood: next });
    } catch (error) {
      deps.warn(`Review queue update failed: ${errorText(error)}`);
    }
  }

  async function startReview(pr: ReviewPr, request: NewThreadRequest): Promise<string> {
    if (isSharedEnvironment(request.environment)) throw new Error(SHARED_ENVIRONMENT_MESSAGE);
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

  async function isListed(ref: PullRequestRef): Promise<boolean> {
    const stored = await readStored();
    const view = stored && viewOf(stored);
    return view !== null && rowsOf(view).some((row) => prKey(row.repo, row.number) === refKey(ref));
  }

  async function markReviewed({
    repo,
    number,
    headOid,
  }: MarkReviewedRequest): Promise<ActionResult> {
    const ref = refOf(repo, number);
    if (ref === null) return { kind: "error", message: INVALID_REPOSITORY_MESSAGE };
    try {
      await marks.save(ref, headOid);
    } catch (error) {
      return { kind: "error", message: errorText(error) };
    }
    if (await isListed(ref).catch(() => false)) await relink();
    else void refreshReviewQueue();
    return { kind: "ok" };
  }

  async function markNeedsReview({ repo, number }: MarkNeedsReviewRequest): Promise<ActionResult> {
    const ref = refOf(repo, number);
    if (ref === null) return { kind: "error", message: INVALID_REPOSITORY_MESSAGE };
    try {
      await marks.delete(ref);
    } catch (error) {
      return { kind: "error", message: errorText(error) };
    }
    await relink();
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

  return {
    getReviewQueue,
    refreshReviewQueue,
    startReview,
    archiveReview,
    markReviewed,
    markNeedsReview,
    run,
  };
}
