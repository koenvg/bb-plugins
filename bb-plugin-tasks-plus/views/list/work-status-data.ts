import { useCallback, useEffect, useRef, useState } from "react";
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

type Observation = { meta: TaskRowMeta; error: string | null };

/** One coalesced visible-list refresh, independent of task/detail query contracts. */
export function useTaskListMeta(tasks: readonly Task[] | undefined, scope = "") {
  const rpc = useTasksRpc();
  const ids = [...new Set((tasks ?? []).map((task) => task.id))].sort();
  const key = JSON.stringify([scope, ids]);
  const input = useRef({ rpc, ids, key, version: 0 });
  const retained = useRef({ scope, byTaskId: new Map<string, Observation>() });
  if (retained.current.scope !== scope) {
    retained.current = { scope, byTaskId: new Map() };
  } else if (input.current.key !== key) {
    retained.current.byTaskId = new Map(
      ids.flatMap((id) => {
        const observation = retained.current.byTaskId.get(id);
        return observation ? [[id, observation] as const] : [];
      }),
    );
  }
  input.current = {
    rpc,
    ids,
    key,
    version: input.current.version + (input.current.key === key ? 0 : 1),
  };
  const mounted = useRef(false);
  const running = useRef(false);
  const refreshes = useRef({ requested: 0, settled: 0, generation: readTasksRefreshGeneration() });
  const [, setRevision] = useState(0);
  const publish = useCallback(() => {
    for (const [id, observation] of retained.current.byTaskId) {
      const meta = ageStatus(observation.meta);
      if (meta !== observation.meta) retained.current.byTaskId.set(id, { ...observation, meta });
    }
    setRevision((revision) => revision + 1);
  }, []);
  const observeGeneration = useCallback(() => {
    const generation = readTasksRefreshGeneration();
    if (refreshes.current.generation === generation) return false;
    refreshes.current.generation = generation;
    refreshes.current.requested++;
    return true;
  }, []);

  const drain = useCallback(() => {
    if (!mounted.current || running.current) return;
    running.current = true;
    void (async () => {
      try {
        while (mounted.current) {
          observeGeneration();
          const current = input.current;
          const previous = retained.current.byTaskId;
          const { requested, settled, generation } = refreshes.current;
          const full = requested > settled;
          const targetIds = full ? current.ids : current.ids.filter((id) => !previous.has(id));
          if (targetIds.length === 0) {
            refreshes.current.settled = requested;
            publish();
            break;
          }
          publish();
          const observations = new Map<string, Observation>();
          // One bounded observation session for this pass's sequential chunks.
          let refreshId =
            targetIds.length > WORK_STATUS_TASK_LIMIT ? crypto.randomUUID() : undefined;
          try {
            for (let offset = 0; offset < targetIds.length; offset += WORK_STATUS_TASK_LIMIT) {
              if (!mounted.current || input.current.version !== current.version) break;
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
              } catch (cause) {
                const error = errorMessage(cause);
                for (const id of chunk)
                  observations.set(id, { meta: unavailable(previous.get(id)?.meta), error });
              }
            }
          } finally {
            // Scope change/unmount/transport failure can skip the final chunk.
            // This empty, read-only finish releases retained observations early.
            if (refreshId) {
              try {
                await current.rpc.call("listTaskWorkStatus", {
                  taskIds: [],
                  refresh: { id: refreshId, step: "finish" },
                });
              } catch {
                // A lost connection still has the host's fixed expiry as fallback.
              }
            }
          }
          // The shared clock can advance before React renders the new generation.
          observeGeneration();
          if (
            !mounted.current ||
            input.current.version !== current.version ||
            refreshes.current.generation !== generation
          )
            continue;
          for (const [id, observation] of observations)
            retained.current.byTaskId.set(id, observation);
          if (full) refreshes.current.settled = requested;
          publish();
        }
      } finally {
        running.current = false;
      }
    })();
  }, [observeGeneration, publish]);
  const refresh = useCallback(() => {
    if (!mounted.current) return;
    refreshes.current.requested++;
    // Coalescing must not freeze current rich PR claims while an RPC is pending.
    publish();
    drain();
  }, [drain, publish]);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeTasksRefresh(() => {
      if (!observeGeneration()) return;
      publish();
      drain();
    });
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      mounted.current = false;
      input.current = { ...input.current, version: input.current.version + 1 };
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [drain, observeGeneration, publish, refresh]);
  useEffect(drain, [key, drain]);
  useInvalidation(["threads:changed"], refresh);
  const observations = retained.current.byTaskId;
  return {
    data:
      observations.size || ids.length === 0
        ? new Map([...observations].map(([id, observation]) => [id, observation.meta]))
        : undefined,
    error: [...observations.values()].find((observation) => observation.error)?.error ?? null,
    isLoading:
      refreshes.current.requested > refreshes.current.settled ||
      ids.some((id) => !observations.has(id)),
    refresh,
  };
}
