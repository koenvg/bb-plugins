import { useCallback, useEffect, useRef, useState } from "react";
import { useInvalidation, useTasksRpc } from "../../shell/data.js";
import { useTasksRefresh } from "../../shell/refresh.js";
import {
  WORK_STATUS_TASK_LIMIT,
  type Task,
  type TaskWorkStatus,
} from "../../shared/contract.js";
import { errorMessage } from "../../shared/errors.js";
import { ageRichDetails } from "../../shared/work-status-freshness.js";

export type TaskRowMeta = TaskWorkStatus;

function ageStatus(status: TaskWorkStatus): TaskWorkStatus {
  return {
    ...status,
    pullRequests: {
      ...status.pullRequests,
      items: status.pullRequests.items.map((pr) =>
        ageRichDetails(pr, Date.now()),
      ),
    },
  };
}
function ageData(data: Map<string, TaskRowMeta>): Map<string, TaskRowMeta> {
  return new Map([...data].map(([id, status]) => [id, ageStatus(status)]));
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
      unavailableThreadIds: (previous?.threads ?? []).map(
        (thread) => thread.threadId,
      ),
    },
  };
}

/** One coalesced visible-list refresh, independent of task/detail query contracts. */
export function useTaskListMeta(
  tasks: readonly Task[] | undefined,
  scope = "",
) {
  const rpc = useTasksRpc();
  const { generation } = useTasksRefresh();
  const previousGeneration = useRef(generation);
  const ids = [...new Set((tasks ?? []).map((task) => task.id))].sort();
  const key = JSON.stringify([scope, ids]);
  const input = useRef({ rpc, ids, key, version: 0 });
  input.current = {
    rpc,
    ids,
    key,
    version: input.current.version + (input.current.key === key ? 0 : 1),
  };
  const mounted = useRef(false);
  const running = useRef(false);
  const queued = useRef(false);
  const retained = useRef<{
    key: string;
    data: Map<string, TaskRowMeta>;
  } | null>(null);
  const [state, setState] = useState<{
    key: string;
    data: Map<string, TaskRowMeta> | undefined;
    isLoading: boolean;
    error: string | null;
  }>({ key, data: undefined, isLoading: true, error: null });

  const refresh = useCallback(() => {
    if (!mounted.current) return;
    // Age even while an RPC is pending. Coalescing cannot freeze current claims.
    if (retained.current?.key === input.current.key) {
      const data = ageData(retained.current.data);
      retained.current = { key: input.current.key, data };
      setState((state) =>
        state.key === input.current.key ? { ...state, data } : state,
      );
    }
    queued.current = true;
    if (running.current) return;
    running.current = true;
    void (async () => {
      try {
        while (mounted.current && queued.current) {
          queued.current = false;
          const current = input.current;
          const previous =
            retained.current?.key === current.key
              ? retained.current.data
              : undefined;
          setState({
            key: current.key,
            data: previous,
            isLoading: true,
            error: null,
          });
          const data = new Map<string, TaskRowMeta>();
          let error: string | null = null;
          // One bounded observation session for this refresh's sequential chunks.
          let refreshId =
            current.ids.length > WORK_STATUS_TASK_LIMIT
              ? crypto.randomUUID()
              : undefined;
          try {
            for (
              let offset = 0;
              offset < current.ids.length;
              offset += WORK_STATUS_TASK_LIMIT
            ) {
              if (!mounted.current || input.current.version !== current.version)
                break;
              const chunk = current.ids.slice(
                offset,
                offset + WORK_STATUS_TASK_LIMIT,
              );
              const step =
                offset === 0
                  ? "start"
                  : offset + WORK_STATUS_TASK_LIMIT >= current.ids.length
                    ? "finish"
                    : "continue";
              try {
                const result = await current.rpc.call("listTaskWorkStatus", {
                  taskIds: chunk,
                  ...(refreshId ? { refresh: { id: refreshId, step } } : {}),
                });
                if (step === "finish") refreshId = undefined;
                for (const id of chunk)
                  data.set(
                    id,
                    result.byTaskId[id]
                      ? ageStatus(result.byTaskId[id]!)
                      : unavailable(previous?.get(id)),
                  );
              } catch (cause) {
                error = errorMessage(cause);
                for (const id of chunk)
                  data.set(id, unavailable(previous?.get(id)));
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
          if (!mounted.current || input.current.version !== current.version)
            continue;
          retained.current = { key: current.key, data };
          setState({ key: current.key, data, error, isLoading: false });
        }
      } finally {
        running.current = false;
      }
    })();
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      mounted.current = false;
      queued.current = false;
      window.clearInterval(timer);
    };
  }, [key, refresh]);
  useEffect(() => {
    if (previousGeneration.current === generation) return;
    previousGeneration.current = generation;
    refresh();
  }, [generation, refresh]);
  useInvalidation(["threads:changed", "tasks:changed"], refresh);
  return {
    data: state.key === key ? state.data : undefined,
    error: state.key === key ? state.error : null,
    isLoading: state.key !== key || state.isLoading,
    refresh,
  };
}
