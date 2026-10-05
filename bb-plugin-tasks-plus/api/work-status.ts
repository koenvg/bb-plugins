import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { TasksStore } from "../db/index.js";
import type { TaskWorkStatus, ThreadExecution, WorkStatusRefresh } from "../shared/contract.js";
import { normalizeHostPr, taskPullRequests, type PrObservation } from "./work-status-pr.js";

import {
  normalizeRichMetadata,
  type RichObservation,
  type RichReason,
} from "./work-status-rich.js";
// Bounds apply only to observations retained between visible-list chunks.
export const WORK_STATUS_REFRESH_TTL = 60_000;
export const WORK_STATUS_REFRESH_LIMIT = 8;
export const WORK_STATUS_REFRESH_THREAD_LIMIT = 4096;

type RefreshSession = {
  id: string;
  expiresAt: number;
  reads: Map<string, Promise<ThreadObservation>>;
  environmentReads: Map<string, Promise<PrObservation>>;
  metadataReads: Map<string, Promise<RichObservation>>;
  integration?: Promise<RichReason | null>;
  timer: ReturnType<typeof setTimeout>;
};
type ThreadObservation = {
  title: string | null;
  execution: ThreadExecution;
  archive: TaskWorkStatus["threads"][number]["archive"];
  environmentId?: string | null;
} | null;

/** List-only hydration. Never writes lifecycle data or trusts cached execution. */
export function createWorkStatusReader({
  store,
  threads,
  environments,
  plugins,
  metadata,
  now,
}: {
  store: Pick<TasksStore, "getTask" | "listTaskThreads">;
  threads: Pick<BbPluginApi["sdk"]["threads"], "get">;
  environments?: Pick<BbPluginApi["sdk"]["environments"], "pullRequest">;
  plugins?: Pick<BbPluginApi["sdk"]["plugins"], "list">;
  metadata?: Pick<BbPluginApi["sdk"]["threads"], "getPluginMetadata">;
  now: () => Date;
}) {
  // Legacy single-batch callers share unsettled reads, never settled results.
  const inFlight = new Map<string, Promise<ThreadObservation>>();
  const environmentsInFlight = new Map<string, Promise<PrObservation>>();
  const metadataInFlight = new Map<string, Promise<RichObservation>>();
  let integrationInFlight: Promise<RichReason | null> | undefined;
  const sessions = new Map<string, RefreshSession>();
  let disposed = false;
  const closeRefresh = (id: string) => {
    const session = sessions.get(id);
    if (!session) return;
    clearTimeout(session.timer);
    session.reads.clear();
    session.environmentReads.clear();
    session.metadataReads.clear();
    sessions.delete(id);
  };
  const refreshSession = (refresh: WorkStatusRefresh): RefreshSession | null => {
    for (const session of sessions.values())
      if (now().getTime() >= session.expiresAt) closeRefresh(session.id);
    if (disposed) return null;
    if (refresh.step !== "start") return sessions.get(refresh.id) ?? null;
    // Reject collisions and saturation rather than evicting a live refresh.
    if (sessions.has(refresh.id) || sessions.size >= WORK_STATUS_REFRESH_LIMIT) return null;
    const timer = setTimeout(() => closeRefresh(refresh.id), WORK_STATUS_REFRESH_TTL);
    timer.unref?.();
    const session: RefreshSession = {
      id: refresh.id,
      expiresAt: now().getTime() + WORK_STATUS_REFRESH_TTL,
      reads: new Map(),
      environmentReads: new Map(),
      metadataReads: new Map(),
      timer,
    };
    sessions.set(refresh.id, session);
    return session;
  };
  let active = 0;
  const waiting: (() => void)[] = [];
  const schedule = async <T>(
    read: () => Promise<T>,
    fallback: T,
    session?: RefreshSession,
  ): Promise<T> => {
    if (active >= 8) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      // Both thread and environment reads share one global eight-read budget.
      if (
        disposed ||
        (session && (sessions.get(session.id) !== session || now().getTime() >= session.expiresAt))
      )
        return fallback;
      return await read();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
  const hydrate = (threadId: string, session?: RefreshSession): Promise<ThreadObservation> =>
    schedule(
      async () => {
        try {
          const thread = await threads.get({ threadId });
          if (
            typeof thread.deletedAt === "number" &&
            Number.isFinite(thread.deletedAt) &&
            thread.deletedAt >= 0
          )
            return {
              title: thread.title,
              execution: "removed",
              archive: "unknown",
            };
          if (thread.deletedAt !== null) return null;
          const execution: ThreadExecution = (() => {
            switch (thread.status) {
              case "pending":
              case "starting":
                return "starting";
              case "active":
              case "stopping":
                return "working";
              case "idle":
                return "idle";
              case "error":
                return "failed";
              default:
                return "unavailable";
            }
          })();
          return {
            title: thread.title,
            execution,
            environmentId: thread.environmentId,
            archive:
              thread.archivedAt === null
                ? "unarchived"
                : typeof thread.archivedAt === "number" &&
                    Number.isFinite(thread.archivedAt) &&
                    thread.archivedAt >= 0
                  ? "archived"
                  : "unknown",
          };
        } catch (error) {
          // Only the SDK's explicit code proves absence, never message text.
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "thread_not_found"
          )
            return { title: null, execution: "removed", archive: "unknown" };
          return null;
        }
      },
      null,
      session,
    );
  const readThread = (threadId: string, session: RefreshSession | null | undefined) => {
    if (disposed || session === null) return Promise.resolve(null);
    const reads = session?.reads ?? inFlight;
    const existing = reads.get(threadId);
    if (existing) return existing;
    if (
      session &&
      reads.size + session.environmentReads.size >=
        WORK_STATUS_REFRESH_THREAD_LIMIT - session.metadataReads.size
    )
      return Promise.resolve(null);
    const result = hydrate(threadId, session);
    reads.set(threadId, result);
    if (!session) void result.finally(() => reads.delete(threadId));
    return result;
  };
  const readEnvironment = (
    environmentId: string,
    session: RefreshSession | null | undefined,
  ): Promise<PrObservation> => {
    const unavailable: PrObservation = { outcome: "unavailable" };
    if (disposed || session === null || !environments) return Promise.resolve(unavailable);
    const reads = session?.environmentReads ?? environmentsInFlight;
    const existing = reads.get(environmentId);
    if (existing) return existing;
    if (
      session &&
      session.reads.size + reads.size >=
        WORK_STATUS_REFRESH_THREAD_LIMIT - session.metadataReads.size
    )
      return Promise.resolve(unavailable);
    const result = schedule(
      async () => {
        try {
          return normalizeHostPr(await environments.pullRequest({ environmentId }));
        } catch {
          return unavailable;
        }
      },
      unavailable,
      session,
    );
    reads.set(environmentId, result);
    if (!session) void result.finally(() => reads.delete(environmentId));
    return result;
  };

  const detectIntegration = (
    session: RefreshSession | null | undefined,
  ): Promise<RichReason | null> => {
    if (disposed || session === null) return Promise.resolve("integration_error");
    if (!plugins || !metadata) return Promise.resolve("integration_absent");
    const existing = session?.integration ?? integrationInFlight;
    if (existing) return existing;
    const result = schedule<RichReason | null>(
      async () => {
        try {
          const plugin = (await plugins.list()).plugins.find((p) => p.id === "github-insight");
          if (!plugin) return "integration_absent";
          if (!plugin.enabled) return "integration_disabled";
          return ["running", "starting", "degraded"].includes(plugin.status)
            ? null
            : "integration_error";
        } catch {
          return "integration_error";
        }
      },
      "integration_error",
      session ?? undefined,
    );
    if (session) session.integration = result;
    else {
      integrationInFlight = result;
      void result.finally(() => {
        if (integrationInFlight === result) integrationInFlight = undefined;
      });
    }
    return result;
  };
  const readMetadata = (
    threadId: string,
    session: RefreshSession | null | undefined,
  ): Promise<RichObservation> => {
    if (disposed || session === null || !metadata)
      return Promise.resolve({ reason: "metadata_error" });
    const reads = session?.metadataReads ?? metadataInFlight;
    const existing = reads.get(threadId);
    if (existing) return existing;
    if (
      session &&
      session.reads.size + session.environmentReads.size + reads.size >=
        WORK_STATUS_REFRESH_THREAD_LIMIT
    )
      return Promise.resolve({ reason: "budget_exceeded" });
    const result = schedule<RichObservation>(
      async () => {
        try {
          return normalizeRichMetadata(
            await metadata.getPluginMetadata({
              threadId,
              pluginId: "github-insight",
            }),
          );
        } catch {
          return { reason: "metadata_error" };
        }
      },
      { reason: "metadata_error" },
      session ?? undefined,
    );
    reads.set(threadId, result);
    if (!session) void result.finally(() => reads.delete(threadId));
    return result;
  };

  const read = async (
    taskIds: readonly string[],
    refresh?: WorkStatusRefresh,
  ): Promise<{ byTaskId: Record<string, TaskWorkStatus> }> => {
    const session = refresh ? refreshSession(refresh) : undefined;
    try {
      const byTaskId: Record<string, TaskWorkStatus> = {};
      const attachments = new Map<string, ReturnType<TasksStore["listTaskThreads"]>>();
      const threadReads = new Map<string, Promise<ThreadObservation>>();
      for (const taskId of new Set(taskIds)) {
        byTaskId[taskId] = {
          availability: "unavailable",
          threads: [],
          observedAt: now().toISOString(),
          pullRequests: {
            availability: "unavailable",
            items: [],
            unavailableThreadIds: [],
          },
        };
        try {
          if (!store.getTask(taskId)) continue;
          const attached = store.listTaskThreads(taskId);
          attachments.set(taskId, attached);
          for (const { threadId } of attached) {
            if (!threadReads.has(threadId))
              threadReads.set(threadId, readThread(threadId, session));
          }
        } catch {
          // One missing task or failed attachment read does not reject other rows.
        }
      }
      const observations = new Map(
        await Promise.all([...threadReads].map(async ([id, read]) => [id, await read] as const)),
      );
      const prReads = new Map<string, Promise<PrObservation>>();
      // Keep settled promises locally too: fast host reads must not duplicate within a batch.
      const environmentReads = new Map<string, Promise<PrObservation>>();
      for (const [threadId, observation] of observations) {
        if (observation?.environmentId === null)
          prReads.set(threadId, Promise.resolve({ outcome: "absent" }));
        else if (observation?.environmentId) {
          const id = observation.environmentId;
          if (!environmentReads.has(id)) environmentReads.set(id, readEnvironment(id, session));
          prReads.set(threadId, environmentReads.get(id)!);
        }
      }
      const prObservations = new Map(
        await Promise.all([...prReads].map(async ([id, read]) => [id, await read] as const)),
      );
      const integration = threadReads.size
        ? await detectIntegration(session)
        : "integration_absent";
      const richObservations = new Map(
        await Promise.all(
          [...threadReads.keys()].map(
            async (id) =>
              [
                id,
                integration ? { reason: integration } : await readMetadata(id, session),
              ] as const,
          ),
        ),
      );
      const observedAt = now().toISOString();
      for (const [taskId, attached] of attachments) {
        byTaskId[taskId] = {
          availability: session === null ? "unavailable" : "available",
          observedAt,
          pullRequests: taskPullRequests(
            attached.map((a) => a.threadId),
            prObservations,
            richObservations,
            now().getTime(),
          ),
          threads: attached.map((attachment) => {
            const observation = observations.get(attachment.threadId);
            return {
              threadId: attachment.threadId,
              title: observation?.title || attachment.title,
              presetName: attachment.presetName,
              execution: observation?.execution ?? "unavailable",
              archive: observation?.archive ?? "unknown",
            };
          }),
        };
      }
      return { byTaskId };
    } finally {
      if (refresh?.step === "finish" && session) closeRefresh(refresh.id);
    }
  };
  return Object.assign(read, {
    dispose: () => {
      disposed = true;
      for (const id of sessions.keys()) closeRefresh(id);
      inFlight.clear();
      environmentsInFlight.clear();
      metadataInFlight.clear();
      integrationInFlight = undefined;
    },
  });
}
