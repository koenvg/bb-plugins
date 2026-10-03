import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { NativeWorker } from "./status-store";
import { STATUS_LIMITS, type WorkerStatus } from "./status-contract";
import { excerpt } from "./status-values";

type Thread = Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["get"]>>;
type Interactions = Awaited<
  ReturnType<BbPluginApi["sdk"]["threads"]["interactions"]["list"]>
>;
interface Observation {
  activity: Pick<
    WorkerStatus["activity"],
    "state" | "value" | "observedAt" | "attemptedAt" | "reason"
  >;
  decisions: WorkerStatus["decisions"];
}
function unknownDecisions(reason: string): WorkerStatus["decisions"] {
  return {
    state: "unknown",
    observedAt: null,
    reason,
    items: [],
    total: null,
    omitted: null,
  };
}
export function unobservedWorker(
  worker: NativeWorker,
  reason: string,
): WorkerStatus {
  return {
    associationId: worker.id,
    threadId: worker.threadId,
    activity: {
      state: "unknown",
      value: "unknown",
      observedAt: null,
      attemptedAt: null,
      cachedAt: worker.updatedAt,
      cachedValue: worker.liveStatus,
      reason,
    },
    decisions: unknownDecisions(reason),
  };
}
export function observedWorker(
  worker: NativeWorker,
  observations: ReadonlyMap<string, Observation>,
): WorkerStatus {
  const observation = observations.get(worker.threadId);
  if (!observation) return unobservedWorker(worker, "external_lookup_limit");
  return {
    associationId: worker.id,
    threadId: worker.threadId,
    activity: {
      ...observation.activity,
      cachedAt: worker.updatedAt,
      cachedValue: worker.liveStatus,
    },
    decisions: {
      ...observation.decisions,
      items: observation.decisions.items.map((item) => ({
        ...item,
        taskId: worker.taskId,
      })),
    },
  };
}
function activity(thread: Thread): WorkerStatus["activity"]["value"] {
  if (thread.deletedAt !== null) return "deleted";
  return thread.status === "error" ? "failed" : thread.status;
}
function question(payload: Interactions[number]["payload"]): string {
  if ("title" in payload) return payload.title;
  if ("questions" in payload)
    return payload.questions.map((q) => q.prompt).join("\n");
  if ("reason" in payload) return payload.reason ?? payload.kind;
  return "Pending interaction";
}
async function lookup<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("lookup_timeout"));
        }, STATUS_LIMITS.lookupTimeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function observe(
  bb: BbPluginApi,
  threadId: string,
): Promise<Observation> {
  const attemptedAt = new Date().toISOString();
  let thread: Thread;
  try {
    thread = await lookup((signal) => bb.sdk.threads.get({ threadId, signal }));
    if (thread.id !== threadId) throw new Error("thread_identity_mismatch");
  } catch (error) {
    const missing =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "thread_not_found";
    return {
      activity: {
        state: missing ? "fresh" : "stale",
        value: missing ? "missing" : "unknown",
        observedAt: missing ? new Date().toISOString() : null,
        attemptedAt,
        reason: missing ? null : "external_lookup_failed",
      },
      decisions: unknownDecisions(
        missing ? "worker_missing" : "external_lookup_failed",
      ),
    };
  }
  const observedAt = new Date().toISOString();
  const currentActivity = {
    state: "fresh" as const,
    value: activity(thread),
    observedAt,
    attemptedAt,
    reason: null,
  };
  if (currentActivity.value === "deleted")
    return {
      activity: currentActivity,
      decisions: unknownDecisions("worker_deleted"),
    };
  try {
    const interactions = await lookup((signal) =>
      bb.sdk.threads.interactions.list({ threadId, signal }),
    );
    // Never attribute a mismatched SDK row to this task/worker.
    if (interactions.some((item) => item.threadId !== threadId))
      throw new Error("interaction_identity_mismatch");
    const pending = interactions.filter(
      (item) => item.status === "pending" || item.status === "resolving",
    );
    const items = pending
      .slice(0, STATUS_LIMITS.decisionsPerWorker)
      .map((item) => ({
        id: item.id,
        taskId: "",
        threadId,
        kind: item.payload.kind,
        state: item.status as "pending" | "resolving",
        createdAt: new Date(item.createdAt).toISOString(),
        question: excerpt(question(item.payload)),
      }));
    return {
      activity: currentActivity,
      decisions: {
        state: "fresh",
        observedAt: new Date().toISOString(),
        reason: null,
        items,
        total: pending.length,
        omitted: pending.length - items.length,
      },
    };
  } catch {
    return {
      activity: currentActivity,
      decisions: unknownDecisions("interaction_lookup_failed"),
    };
  }
}
export async function observeWorkers(
  bb: BbPluginApi,
  workers: readonly NativeWorker[],
): Promise<Map<string, Observation>> {
  const ids = [...new Set(workers.map((worker) => worker.threadId))].slice(
    0,
    STATUS_LIMITS.externalWorkers,
  );
  const observations = new Map<string, Observation>();
  let next = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(ids.length, STATUS_LIMITS.lookupConcurrency) },
      async () => {
        while (next < ids.length) {
          const id = ids[next++]!;
          observations.set(id, await observe(bb, id));
        }
      },
    ),
  );
  return observations;
}
