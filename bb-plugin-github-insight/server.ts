import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  hostContract,
  rpcContract,
  type DraftsResult,
  type GhResult,
  type ReviewResult,
} from "./contract";
import { INSIGHT_UPDATED_CHANNEL, type InsightUpdated } from "./core/insight-updated";
import { collectInsight } from "./core/overview";
import { REVIEW_QUEUE_UPDATED_CHANNEL } from "./core/review-queue-updated";
import {
  REVIEW_DRAFTS_UPDATED_CHANNEL,
  REVIEW_UPDATED_CHANNEL,
  type ReviewUpdated,
} from "./core/review-updated";
import { newCommentDraftId } from "./core/review-drafts";
import { reviewPrMetadata } from "./core/review-pr";
import { SUMMARY_METADATA_KEY } from "./core/summary";
import { GhFailureError } from "./github/gh-failure";
import { parseReviewQueue } from "./core/review-queue";
import { createLocalCommitsLookup } from "./merge/local-commits-lookup";
import { createPrWrites } from "./merge/pr-writes";
import { createPrLookup } from "./pr-lookup";
import { createReviewQueueService } from "./queue/review-queue-service";
import { createInsightService } from "./refresh/insight-service";
import { createDraftStore } from "./review/draft-store";
import { createReviewCli } from "./review/review-cli";
import { createReviewService } from "./review/review-service";
import { createReviewWrites } from "./review/review-writes";

export type { rpcContract } from "./contract";

function unwrap(result: GhResult): unknown {
  if (!result.ok) throw new GhFailureError(result.failure);
  return result.data;
}

export default async function plugin(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({ contract: hostContract });
  const { resolvePr, resolveEnvironmentPr } = createPrLookup(bb.sdk);

  const service = createInsightService({
    listThreads: async () =>
      (await bb.sdk.threads.list({ includeHidden: true })).filter(
        (thread) => thread.archivedAt === null,
      ),
    resolvePr,
    resolveEnvironmentPr,
    fetchInsight: ({ ref, hostId }) =>
      collectInsight({
        fetchOverviewPage: async (after) =>
          unwrap(await host.call("fetchOverviewPage", { ...ref, after }, { hostId })),
        fetchCheckRunDetails: async (ids) =>
          unwrap(await host.call("fetchCheckRunDetails", { ids }, { hostId })),
      }),
    publish: (threadIds) =>
      bb.realtime.publish(INSIGHT_UPDATED_CHANNEL, { threadIds } satisfies InsightUpdated),
    writeSummary: async (threadId, summary) => {
      await bb.sdk.threads.updatePluginMetadata({
        threadId,
        set: { [SUMMARY_METADATA_KEY]: summary },
      });
    },
    removeSummary: async (threadId) => {
      await bb.sdk.threads.updatePluginMetadata({ threadId, remove: [SUMMARY_METADATA_KEY] });
    },
    kv: bb.storage.kv,
    warn: (message) => bb.log.warn(message),
  });

  const drafts = createDraftStore(bb.storage.kv);
  const publishReviewUpdate = (update: ReviewUpdated) =>
    bb.realtime.publish(REVIEW_UPDATED_CHANNEL, update);
  const publishDraftsUpdate = (update: ReviewUpdated) =>
    bb.realtime.publish(REVIEW_DRAFTS_UPDATED_CHANNEL, update);

  const review = createReviewService({
    resolvePr,
    fetchPrFiles: async ({ ref, hostId }) =>
      unwrap(await host.call("fetchPrFiles", ref, { hostId })),
    fetchReviewThreadsPage: async ({ ref, hostId }, after) =>
      unwrap(await host.call("fetchReviewThreads", { ...ref, after }, { hostId })),
    fetchPrHead: async ({ ref, hostId }) => unwrap(await host.call("fetchPrHead", ref, { hostId })),
    drafts,
    publishDrafts: publishDraftsUpdate,
    sendMessage: async (threadId, text) => {
      const result = await bb.sdk.threads.send({
        threadId,
        mode: "auto",
        input: [{ type: "text", text, mentions: [] }],
      });
      return result.delivery;
    },
  });

  const writes = createReviewWrites({
    resolvePr,
    replyToThread: async ({ hostId }, threadId, body) =>
      unwrap(await host.call("replyToThread", { threadId, body }, { hostId })),
    setThreadResolved: async ({ hostId }, threadId, resolved) =>
      unwrap(await host.call("setThreadResolved", { threadId, resolved }, { hostId })),
    loadReview: (threadId) => review.load(threadId),
    loadBasis: (threadId) => review.loadBasis(threadId),
    submitReview: async ({ hostId }, request) =>
      unwrap(await host.call("submitReview", request, { hostId })),
    drafts,
    publish: publishReviewUpdate,
    publishDrafts: publishDraftsUpdate,
    refreshAfterWrite: (threadId) => service.refreshAfterWrite(threadId),
    markReviewed: ({ owner, repo, number }, headOid) =>
      reviewQueue.markReviewed({ repo: `${owner}/${repo}`, number, headOid }),
    now: Date.now,
    newDraftId: newCommentDraftId,
    warn: (message) => bb.log.warn(message),
  });

  const reviewQueue = createReviewQueueService({
    primaryHostId: async () => (await bb.sdk.system.config()).primaryHostId,
    fetchReviewQueue: async (hostId, tracked) =>
      parseReviewQueue(
        unwrap(await host.call("fetchReviewQueue", { tracked }, { hostId })),
        tracked,
      ),
    listProjects: () => bb.sdk.projects.list(),
    listThreads: () => bb.sdk.threads.list({ includeHidden: true }),
    listReviewThreads: () =>
      bb.sdk.threads.list({ includeHidden: true, originPluginId: bb.pluginId }),
    readPluginMetadata: (threadId) => bb.sdk.threads.getPluginMetadata({ threadId }),
    spawnReviewThread: async (pr, request) => {
      const thread = await bb.sdk.threads.spawn({
        ...request,
        visibility: "hidden",
        pluginMetadata: reviewPrMetadata(pr),
      });
      return thread.id;
    },
    archiveThread: async (threadId) => {
      await bb.sdk.threads.archive({ threadId });
    },
    resolveEnvironmentPr,
    kv: bb.storage.kv,
    publish: (result) => bb.realtime.publish(REVIEW_QUEUE_UPDATED_CHANNEL, result),
    warn: (message) => bb.log.warn(message),
    now: Date.now,
  });

  const prWrites = createPrWrites({
    cachedPr: (threadId) => service.cachedPr(threadId),
    mergePullRequest: async ({ hostId }, request) =>
      unwrap(await host.call("mergePullRequest", request, { hostId })),
    enqueuePullRequest: async ({ hostId }, request) =>
      unwrap(await host.call("enqueuePullRequest", request, { hostId })),
    updatePullRequestBranch: async ({ hostId }, request) =>
      unwrap(await host.call("updatePullRequestBranch", request, { hostId })),
    enablePullRequestAutoMerge: async ({ hostId }, request) =>
      unwrap(await host.call("enablePullRequestAutoMerge", request, { hostId })),
    disablePullRequestAutoMerge: async ({ hostId }, request) =>
      unwrap(await host.call("disablePullRequestAutoMerge", request, { hostId })),
    refreshAfterWrite: (threadId) => service.refreshAfterWrite(threadId),
    warn: (message) => bb.log.warn(message),
  });

  const localCommits = createLocalCommitsLookup({
    cachedPr: (threadId) => service.cachedPr(threadId),
    environmentIdOf: async (threadId) => (await bb.sdk.threads.get({ threadId })).environmentId,
    environment: async (environmentId) => {
      const { hostId, path } = await bb.sdk.environments.get({ environmentId });
      return { hostId, path: path ?? null };
    },
    countLocalCommitsAhead: (hostId, request) =>
      host.call("countLocalCommitsAhead", request, { hostId }),
    warn: (message) => bb.log.warn(message),
  });

  async function getReview(threadId: string): Promise<ReviewResult> {
    const load = await review.load(threadId);
    return load.kind === "ok" ? { kind: "ok", ...load.review } : load;
  }

  async function getDrafts(threadId: string): Promise<DraftsResult> {
    const load = await review.loadDrafts(threadId);
    return load.kind === "ok" ? { kind: "ok", ...load.drafts } : load;
  }

  bb.rpc.register(rpcContract, {
    getInsight: ({ threadId }) => service.getInsight(threadId),
    refresh: ({ threadId }) => service.refresh(threadId),
    getReview: ({ threadId }) => getReview(threadId),
    getDrafts: ({ threadId }) => getDrafts(threadId),
    sendToAgent: ({ threadId, reviewThreadIds }) => review.sendToAgent(threadId, reviewThreadIds),
    reply: (request) => writes.reply(request),
    setResolved: (request) => writes.setResolved(request),
    saveDraft: (request) => writes.saveDraft(request),
    discardDraft: (request) => writes.discardDraft(request),
    createCommentDraft: (request) => writes.createCommentDraft(request),
    saveCommentDraft: (request) => writes.saveCommentDraft(request),
    deleteCommentDraft: (request) => writes.deleteCommentDraft(request),
    saveSummaryDraft: (request) => writes.saveSummaryDraft(request),
    submitReview: (request) => writes.submitReview(request),
    getReviewQueue: () => reviewQueue.getReviewQueue(),
    refreshReviewQueue: () => reviewQueue.refreshReviewQueue(),
    startReview: async ({ pr, request }) => ({
      threadId: await reviewQueue.startReview(pr, request),
    }),
    getPrimaryHost: async () => ({ hostId: (await bb.sdk.system.config()).primaryHostId }),
    archiveReview: ({ threadId }) => reviewQueue.archiveReview(threadId),
    markReviewed: (request) => reviewQueue.markReviewed(request),
    markNeedsReview: (request) => reviewQueue.markNeedsReview(request),
    markQueueSeen: (request) => reviewQueue.markQueueSeen(request),
    markThreadOpened: (request) => reviewQueue.markThreadOpened(request),
    runPrAction: (request) => prWrites.runPrAction(request),
    localCommitsAhead: ({ threadId }) => localCommits.localCommitsAhead(threadId),
  });

  bb.cli.register(
    createReviewCli({
      review,
      readTextFile: (hostId, request) => host.call("readTextFile", request, { hostId }),
      now: Date.now,
      newDraftId: newCommentDraftId,
    }),
  );

  bb.background.service("pr-poller", { start: (signal) => service.run(signal) });
  bb.background.service("review-queue", { start: (signal) => reviewQueue.run(signal) });

  const unloaded = new AbortController();
  bb.onDispose(() => unloaded.abort());
  bb.events.on("thread.idle", ({ thread }) => {
    void service.refreshOnIdle(thread.id, unloaded.signal);
    void reviewQueue.threadStopped(thread.id);
  });
  bb.events.on("thread.failed", ({ thread }) => {
    void reviewQueue.threadStopped(thread.id);
  });
}
