import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { hostContract, rpcContract, type GhResult, type ReviewResult } from "./contract";
import {
  INSIGHT_UPDATED_CHANNEL,
  type InsightUpdated,
} from "./core/insight-updated";
import { collectInsight } from "./core/overview";
import { REVIEW_UPDATED_CHANNEL, type ReviewUpdated } from "./core/review-updated";
import { reviewPrMetadata } from "./core/review-pr";
import { SUMMARY_METADATA_KEY } from "./core/summary";
import { GhFailureError } from "./github/gh-failure";
import { parseReviewQueue } from "./core/review-queue";
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
      (await bb.sdk.threads.list({ includeHidden: true })).filter((thread) => thread.archivedAt === null),
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
    warn: (message) => bb.log.warn(message),
  });

  const drafts = createDraftStore(bb.storage.kv);
  const publishReviewUpdate = (update: ReviewUpdated) => bb.realtime.publish(REVIEW_UPDATED_CHANNEL, update);

  const review = createReviewService({
    resolvePr,
    fetchPrFiles: async ({ ref, hostId }) => unwrap(await host.call("fetchPrFiles", ref, { hostId })),
    fetchReviewThreadsPage: async ({ ref, hostId }, after) =>
      unwrap(await host.call("fetchReviewThreads", { ...ref, after }, { hostId })),
    drafts,
    publish: publishReviewUpdate,
    sendMessage: async (threadId, text) => {
      const result = await bb.sdk.threads.send({ threadId, mode: "auto", input: [{ type: "text", text, mentions: [] }] });
      return result.delivery;
    },
  });

  const writes = createReviewWrites({
    resolvePr,
    replyToThread: async ({ hostId }, threadId, body) =>
      unwrap(await host.call("replyToThread", { threadId, body }, { hostId })),
    setThreadResolved: async ({ hostId }, threadId, resolved) =>
      unwrap(await host.call("setThreadResolved", { threadId, resolved }, { hostId })),
    drafts,
    publish: publishReviewUpdate,
    refreshAfterWrite: (threadId) => service.refreshAfterWrite(threadId),
    now: Date.now,
    warn: (message) => bb.log.warn(message),
  });

  const reviewQueue = createReviewQueueService({
    primaryHostId: async () => (await bb.sdk.system.config()).primaryHostId,
    fetchReviewQueue: async (hostId) =>
      parseReviewQueue(unwrap(await host.call("fetchReviewQueue", {}, { hostId }))),
    listProjects: () => bb.sdk.projects.list(),
    listThreads: () => bb.sdk.threads.list({ includeHidden: true }),
    listReviewThreads: () => bb.sdk.threads.list({ includeHidden: true, originPluginId: bb.pluginId }),
    readPluginMetadata: (threadId) => bb.sdk.threads.getPluginMetadata({ threadId }),
    archiveThread: async (threadId) => {
      await bb.sdk.threads.archive({ threadId });
    },
    resolveEnvironmentPr,
    now: Date.now,
  });

  async function getReview(threadId: string): Promise<ReviewResult> {
    const load = await review.load(threadId);
    return load.kind === "ok" ? { kind: "ok", ...load.review } : load;
  }

  bb.rpc.register(rpcContract, {
    getInsight: ({ threadId }) => service.getInsight(threadId),
    refresh: ({ threadId }) => service.refresh(threadId),
    getReview: ({ threadId }) => getReview(threadId),
    sendToAgent: ({ threadId, reviewThreadIds }) => review.sendToAgent(threadId, reviewThreadIds),
    reply: (request) => writes.reply(request),
    setResolved: (request) => writes.setResolved(request),
    saveDraft: (request) => writes.saveDraft(request),
    discardDraft: (request) => writes.discardDraft(request),
    getReviewQueue: () => reviewQueue.getReviewQueue(),
    startReview: async ({ pr, request }) => {
      const thread = await bb.sdk.threads.spawn({
        ...request,
        visibility: "hidden",
        pluginMetadata: reviewPrMetadata(pr),
      });
      return { threadId: thread.id };
    },
    archiveReview: ({ threadId }) => reviewQueue.archiveReview(threadId),
  });

  bb.cli.register(
    createReviewCli({
      review,
      readTextFile: (hostId, request) => host.call("readTextFile", request, { hostId }),
      now: Date.now,
    }),
  );

  bb.background.service("pr-poller", { start: (signal) => service.run(signal) });

  const unloaded = new AbortController();
  bb.onDispose(() => unloaded.abort());
  bb.events.on("thread.idle", ({ thread }) => {
    void service.refreshOnIdle(thread.id, unloaded.signal);
  });
}
