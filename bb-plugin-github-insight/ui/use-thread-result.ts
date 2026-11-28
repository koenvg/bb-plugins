import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

export type LoadMode = "load" | "refresh";

interface ErrorResult {
  kind: "error";
  message: string;
}

export interface ThreadResultState<R> {
  result: R | ErrorResult | null;
  refreshing: boolean;
  generation: number;
  revalidating: boolean;
  reload: () => void;
  refresh: () => Promise<R | ErrorResult | null>;
  patch: (change: (result: R | ErrorResult) => R | ErrorResult) => void;
}

type FetchResult<R> = (threadId: string, mode: LoadMode) => Promise<R>;

interface RequestSnapshot<R> {
  loaded: { threadId: string; result: R | ErrorResult } | null;
  loadingThreadId: string | null;
  refreshingThreadId: string | null;
  generation: number;
}

function createThreadRequests<R>() {
  let state: RequestSnapshot<R> = {
    loaded: null,
    loadingThreadId: null,
    refreshingThreadId: null,
    generation: 0,
  };
  const listeners = new Set<() => void>();
  let latestRequest = 0;
  let refreshOwner: { threadId: string; reloadRequested: boolean } | null = null;
  const publish = (patch: Partial<RequestSnapshot<R>>) => {
    state = { ...state, ...patch };
    listeners.forEach((notify) => notify());
  };

  async function load(threadId: string, fetch: FetchResult<R>, mode: LoadMode) {
    const request = ++latestRequest;
    if (mode === "load" && state.loadingThreadId !== threadId) {
      publish({ generation: request, loadingThreadId: threadId });
    } else if (mode === "refresh" && state.refreshingThreadId !== threadId) {
      publish({ generation: request, refreshingThreadId: threadId });
    }
    const result = await fetch(threadId, mode).catch((error: unknown): ErrorResult => ({
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    }));
    if (request !== latestRequest) return null;
    publish({
      loaded: { threadId, result },
      generation: request,
      loadingThreadId: state.loadingThreadId === threadId ? null : state.loadingThreadId,
    });
    return result;
  }

  return {
    getSnapshot: () => state,
    subscribe(notify: () => void) {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    start(threadId: string, fetch: FetchResult<R>) {
      if (state.refreshingThreadId !== null) publish({ refreshingThreadId: null });
      void load(threadId, fetch, "load");
      return () => {
        latestRequest += 1;
        refreshOwner = null;
      };
    },
    reload(threadId: string, fetch: FetchResult<R>) {
      if (refreshOwner?.threadId === threadId) refreshOwner.reloadRequested = true;
      else void load(threadId, fetch, "load");
    },
    async refresh(threadId: string, fetch: FetchResult<R>) {
      const owner = { threadId, reloadRequested: false };
      refreshOwner = owner;
      const finish = () => {
        if (refreshOwner !== owner) return false;
        refreshOwner = null;
        if (state.refreshingThreadId === threadId) publish({ refreshingThreadId: null });
        return true;
      };
      let result: R | ErrorResult | null;
      try {
        result = await load(threadId, fetch, "refresh");
        while (result !== null && refreshOwner === owner && owner.reloadRequested) {
          owner.reloadRequested = false;
          const queuedReload = load(threadId, fetch, "load");
          result = await queuedReload;
        }
      } catch (error) {
        finish();
        throw error;
      }
      return finish() ? result : null;
    },
    patch(threadId: string, change: (result: R | ErrorResult) => R | ErrorResult) {
      if (state.loaded?.threadId === threadId) {
        publish({ loaded: { threadId, result: change(state.loaded.result) } });
      }
    },
  };
}

export function useThreadResult<R>(
  threadId: string,
  fetch: FetchResult<R>,
  snapshot?: (threadId: string) => R | null,
): ThreadResultState<R> {
  const requests = useMemo(() => createThreadRequests<R>(), []);
  const state = useSyncExternalStore(requests.subscribe, requests.getSnapshot);
  useEffect(() => requests.start(threadId, fetch), [requests, threadId, fetch]);

  const reload = useCallback(() => requests.reload(threadId, fetch), [requests, threadId, fetch]);
  const refresh = useCallback(() => requests.refresh(threadId, fetch), [requests, threadId, fetch]);
  const patch = useCallback(
    (change: (result: R | ErrorResult) => R | ErrorResult) => requests.patch(threadId, change),
    [requests, threadId],
  );
  const result =
    state.loaded?.threadId === threadId ? state.loaded.result : (snapshot?.(threadId) ?? null);
  return {
    result,
    generation: state.generation,
    refreshing: state.refreshingThreadId === threadId,
    revalidating: state.loadingThreadId === threadId && result !== null,
    reload,
    refresh,
    patch,
  };
}
