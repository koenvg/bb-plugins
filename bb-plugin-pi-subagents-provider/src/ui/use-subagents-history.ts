import { useEffect, useState } from "react";
import { useSdk } from "@get-bb/plugin-sdk/app";
import { parseViewState, VIEW_EXTENSION_KIND, type ViewState } from "../subagents-contract.js";
import { restoreViewHistory } from "../view-history.js";

/** Bounded, read-only history for one SDK thread. Late replies never cross threads. */
export function useSubagentsHistory(threadId: string | undefined) {
  const sdk = useSdk();
  const [data, setData] = useState<{
    sdk: typeof sdk;
    threadId?: string;
    state?: ViewState;
    loading: boolean;
    error?: string;
    warning?: string;
  }>({ sdk, threadId, loading: Boolean(threadId) });
  const matchesRequest = data.sdk === sdk && data.threadId === threadId;
  if (!matchesRequest) {
    setData({ sdk, threadId, loading: Boolean(threadId) });
  }
  useEffect(() => {
    if (!threadId) return;
    const activeThreadId = threadId;
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    async function readHistory() {
      try {
        const events = await sdk.threads.events.list({
          threadId: activeThreadId,
          types: ["thread/extensionState/updated"],
          order: "desc",
          limit: "64",
          signal: abort.signal,
        });
        const values = events.flatMap((event) =>
          event.type === "thread/extensionState/updated" && event.data.kind === VIEW_EXTENSION_KIND
            ? [event.data.payload]
            : [],
        );
        const error =
          values.length && !parseViewState(values[0])
            ? "Latest stored child state is unsupported or malformed."
            : undefined;
        const warning =
          events.length === 64 ? "Older history may be outside this bounded window." : undefined;
        if (!closed) {
          setData((previous) =>
            previous.sdk === sdk && previous.threadId === threadId
              ? {
                  ...previous,
                  state: restoreViewHistory(values, previous.state),
                  loading: false,
                  error,
                  warning,
                }
              : previous,
          );
        }
      } catch {
        if (!closed) {
          setData((previous) =>
            previous.sdk === sdk && previous.threadId === threadId
              ? { ...previous, loading: false, error: "Could not read captured child history." }
              : previous,
          );
        }
      }
    }
    function refresh() {
      void readHistory().finally(() => {
        if (!closed) timer = setTimeout(refresh, 4000);
      });
    }
    refresh();
    return () => {
      closed = true;
      abort.abort();
      clearTimeout(timer);
    };
  }, [sdk, threadId]);
  const { state, loading, error, warning } = data;
  return matchesRequest
    ? { state, loading, error, warning }
    : { state: undefined, loading: Boolean(threadId), error: undefined, warning: undefined };
}
