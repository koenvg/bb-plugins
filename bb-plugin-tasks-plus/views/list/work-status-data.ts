import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { useInvalidation, useTasksRpc } from "../../shell/data.js";
import { readTasksRefreshGeneration, subscribeTasksRefresh } from "../../shell/refresh.js";
import { WORK_STATUS_TASK_LIMIT, type Task, type TaskWorkStatus } from "../../shared/contract.js";
import { errorMessage } from "../../shared/errors.js";
import { ageRichDetails } from "../../shared/work-status-freshness.js";

export type TaskRowMeta = TaskWorkStatus;

function ageStatus(status: TaskWorkStatus): TaskWorkStatus {
  const items = status.pullRequests.items.map((pr) => ageRichDetails(pr, Date.now()));
  if (items.every((pr, index) => pr === status.pullRequests.items[index])) return status;
  return { ...status, pullRequests: { ...status.pullRequests, items } };
}
function unavailable(previous?: TaskWorkStatus): TaskWorkStatus {
  if (previous) previous = ageStatus(previous);
  return {
    availability: "unavailable",
    threads: (previous?.threads ?? []).map((thread) => ({
      ...thread,
      execution: "unavailable",
      archive: "unknown",
    })),
    observedAt: new Date().toISOString(),
    pullRequests: {
      availability: "unavailable",
      items: (previous?.pullRequests?.items ?? []).map((pr) => ({
        ...pr,
        state: "unknown",
        details: pr.details === "stale" ? "stale" : "unavailable",
        detailsReason: pr.details === "stale" ? "expired" : "refresh_failed",
      })),
      unavailableThreadIds: (previous?.threads ?? []).map((thread) => thread.threadId),
    },
  };
}

interface Observation {
  meta: TaskRowMeta;
  error: string | null;
}

interface ReaderInput {
  scope: string;
  ids: string[];
  rpc: ReturnType<typeof useTasksRpc>;
}

interface ReaderSnapshot {
  input: ReaderInput | null;
  observations: ReadonlyMap<string, Observation>;
  refreshing: boolean;
}

function selectObservations(ids: readonly string[], previous: ReadonlyMap<string, Observation>) {
  return new Map(
    ids.flatMap((id) => {
      const observation = previous.get(id);
      return observation ? [[id, observation] as const] : [];
    }),
  );
}

function createWorkStatusReader() {
  let input: ReaderInput | null = null;
  let version = 0;
  let byTaskId = new Map<string, Observation>();
  let mounted = false;
  let running = false;
  const refreshes = { requested: 0, settled: 0, generation: 0 };
  let snapshot: ReaderSnapshot = { input, observations: byTaskId, refreshing: false };
  const listeners = new Set<() => void>();

  function publish() {
    for (const [id, observation] of byTaskId) {
      const meta = ageStatus(observation.meta);
      if (meta !== observation.meta) {
        if (byTaskId === snapshot.observations) byTaskId = new Map(byTaskId);
        byTaskId.set(id, { ...observation, meta });
      }
    }
    const refreshing = refreshes.requested > refreshes.settled;
    if (
      snapshot.input === input &&
      snapshot.observations === byTaskId &&
      snapshot.refreshing === refreshing
    )
      return;
    snapshot = { input, observations: byTaskId, refreshing };
    for (const listener of listeners) listener();
  }

  function observeGeneration() {
    const generation = readTasksRefreshGeneration();
    if (refreshes.generation === generation) return false;
    refreshes.generation = generation;
    refreshes.requested++;
    return true;
  }

  function drain() {
    if (!mounted || running) return;
    running = true;
    const fail = (cause: unknown) => {
      running = false;
      throw cause;
    };
    const refreshPass = (): Promise<void> =>
      Promise.try(() => {
        if (!mounted) {
          running = false;
          return;
        }
        observeGeneration();
        const current = input;
        const passVersion = version;
        if (current === null) {
          running = false;
          return;
        }
        const previous = byTaskId;
        const { requested, settled, generation } = refreshes;
        const full = requested > settled;
        const targetIds = full ? current.ids : current.ids.filter((id) => !previous.has(id));
        if (targetIds.length === 0) {
          refreshes.settled = requested;
          publish();
          running = false;
          return;
        }
        publish();
        const observations = new Map<string, Observation>();
        // One bounded observation session for this pass's sequential chunks.
        let refreshId = targetIds.length > WORK_STATUS_TASK_LIMIT ? crypto.randomUUID() : undefined;
        const releaseRefresh = async (id: string) => {
          try {
            // Scope change/unmount/transport failure can skip the final chunk.
            await current.rpc.call("listTaskWorkStatus", {
              taskIds: [],
              refresh: { id, step: "finish" },
            });
          } catch {
            // A lost connection still has the host's fixed expiry as fallback.
          }
        };
        const readChunk = async (offset: number) => {
          if (offset >= targetIds.length || !mounted || version !== passVersion) {
            if (refreshId) await releaseRefresh(refreshId);
            // The shared clock can advance before React renders the new generation.
            observeGeneration();
            if (mounted && version === passVersion && refreshes.generation === generation) {
              byTaskId = new Map([...byTaskId, ...observations]);
              if (full) refreshes.settled = requested;
              publish();
            }
            void refreshPass().catch(fail);
            return;
          }
          try {
            const chunk = targetIds.slice(offset, offset + WORK_STATUS_TASK_LIMIT);
            const step =
              offset === 0
                ? "start"
                : offset + WORK_STATUS_TASK_LIMIT >= targetIds.length
                  ? "finish"
                  : "continue";
            try {
              const result = await current.rpc.call("listTaskWorkStatus", {
                taskIds: chunk,
                ...(refreshId ? { refresh: { id: refreshId, step } } : {}),
              });
              if (step === "finish") refreshId = undefined;
              for (const id of chunk)
                observations.set(id, {
                  meta: result.byTaskId[id] ?? unavailable(previous.get(id)?.meta),
                  error: null,
                });
            } catch (error) {
              const message = errorMessage(error);
              for (const id of chunk)
                observations.set(id, { meta: unavailable(previous.get(id)?.meta), error: message });
            }
          } catch (error) {
            if (refreshId) await releaseRefresh(refreshId);
            throw error;
          }
          void readChunk(offset + WORK_STATUS_TASK_LIMIT).catch(fail);
        };
        return readChunk(0);
      });
    void refreshPass().catch(fail);
  }
  function refresh() {
    if (!mounted) return;
    refreshes.requested++;
    // Coalescing must not freeze current rich PR claims while an RPC is pending.
    publish();
    drain();
  }

  function mount() {
    mounted = true;
    const unsubscribe = subscribeTasksRefresh(() => {
      if (!observeGeneration()) return;
      publish();
      drain();
    });
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      mounted = false;
      version++;
      unsubscribe();
      window.clearInterval(timer);
    };
  }

  return {
    read: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    commit(next: ReaderInput) {
      if (input === next) return;
      if (input === null) refreshes.generation = readTasksRefreshGeneration();
      if (input?.scope !== next.scope || input.rpc !== next.rpc) {
        byTaskId = new Map();
      } else {
        byTaskId = selectObservations(next.ids, byTaskId);
      }
      input = next;
      version++;
      publish();
    },
    mount,
    start(committed: ReaderInput) {
      if (input === committed) drain();
    },
    refresh,
  };
}

export function useTaskListMeta(tasks: readonly Task[] | undefined, scope = "") {
  const rpc = useTasksRpc();
  const idsKey = JSON.stringify([...new Set((tasks ?? []).map((task) => task.id))].sort());
  const input = useMemo<ReaderInput>(
    () => ({ rpc, scope, ids: JSON.parse(idsKey) as string[] }),
    [rpc, scope, idsKey],
  );
  const reader = useMemo(() => createWorkStatusReader(), []);
  const snapshot = useSyncExternalStore(reader.subscribe, reader.read);
  useLayoutEffect(() => {
    reader.commit(input);
  }, [reader, input]);
  useEffect(() => reader.mount(), [reader]);
  useEffect(() => {
    reader.start(input);
  }, [reader, input]);
  useInvalidation(["threads:changed"], reader.refresh);

  const observations = useMemo(() => {
    if (snapshot.input === input) return snapshot.observations;
    if (snapshot.input?.scope !== input.scope || snapshot.input.rpc !== input.rpc)
      return new Map<string, Observation>();
    return selectObservations(input.ids, snapshot.observations);
  }, [snapshot, input]);
  return {
    data:
      observations.size || input.ids.length === 0
        ? new Map([...observations].map(([id, observation]) => [id, observation.meta]))
        : undefined,
    error: [...observations.values()].find((observation) => observation.error)?.error ?? null,
    isLoading: snapshot.refreshing || input.ids.some((id) => !observations.has(id)),
    refresh: reader.refresh,
  };
}
