import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { TasksStore } from "./db";
import { errorMessage } from "./shared/errors";

type Thread = Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["get"]>>;

export function createCreatorThreadTracker(bb: BbPluginApi, tasks: TasksStore) {
  const versions = new Map<string, symbol>();
  const pending = new Map<string, Promise<void>>();
  const knownCreators = new Set(tasks.listCreatorThreadIds());
  let disposed = false;
  bb.onDispose(() => {
    disposed = true;
    versions.clear();
    pending.clear();
  });

  function apply(threadId: string, blocked: boolean): void {
    if (disposed) return;
    for (const task of tasks.setCreatorThreadBlocked(threadId, blocked)) {
      bb.realtime.publish("tasks:changed", { taskId: task.id, projectId: task.projectId });
    }
  }

  function observe(thread: Thread, deleted = false): void {
    if (disposed || !knownCreators.has(thread.id)) return;
    versions.set(thread.id, Symbol());
    apply(thread.id, !deleted && thread.archivedAt === null && thread.deletedAt === null);
  }

  function refreshThread(threadId: string): Promise<void> {
    const existing = pending.get(threadId);
    if (existing) return existing;
    const token = Symbol();
    versions.set(threadId, token);
    const read = (async () => {
      try {
        const thread = await bb.sdk.threads.get({ threadId });
        if (versions.get(threadId) === token) {
          apply(threadId, thread.archivedAt === null && thread.deletedAt === null);
        }
      } catch (error) {
        if (versions.get(threadId) !== token) return;
        const missing =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "thread_not_found";
        apply(threadId, !missing);
        if (!missing)
          bb.log.warn(`Could not resolve creator thread ${threadId}: ${errorMessage(error)}`);
      }
    })().finally(() => pending.delete(threadId));
    pending.set(threadId, read);
    return read;
  }

  async function refresh(threadIds?: readonly string[]): Promise<void> {
    if (disposed) return;
    let next = 0;
    const ids = [...new Set(threadIds ?? tasks.listCreatorThreadIds())];
    for (const id of ids) knownCreators.add(id);
    await Promise.all(
      Array.from({ length: Math.min(4, ids.length) }, async () => {
        while (next < ids.length && !disposed) {
          await refreshThread(ids[next++]!);
        }
      }),
    );
  }

  return { observe, refresh };
}
