import { useEffect, useState } from "react";
import { useSdk, type PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import { parseViewState, type ViewState } from "../subagents-contract.js";
import { VIEW_EXTENSION_KIND } from "../subagents-contract.js";
import { restoreViewHistory } from "../view-history.js";
import { SubagentsView } from "./subagents-view.js";

export function SubagentsPanel({ threadId }: PluginThreadPanelProps) {
  const sdk = useSdk();
  const [data, setData] = useState<{
    threadId: string;
    state?: ViewState;
    loading: boolean;
    error?: string;
  }>({ threadId, loading: true });
  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    setData({ threadId, loading: true });
    async function refresh() {
      try {
        const events = await sdk.threads.events.list({
          threadId,
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
        const state = restoreViewHistory(values);
        const error =
          values.length && !parseViewState(values[0])
            ? "Latest stored child state is unsupported or malformed."
            : events.length === 64
              ? "Older history may be outside this bounded window."
              : undefined;
        if (!closed) setData({ threadId, state, loading: false, error });
      } catch {
        if (!closed)
          setData((previous) => ({
            ...previous,
            threadId,
            loading: false,
            error: "Could not read captured child history.",
          }));
      } finally {
        if (!closed)
          timer = setTimeout(() => {
            void refresh();
          }, 4000);
      }
    }
    void refresh();
    return () => {
      closed = true;
      abort.abort();
      clearTimeout(timer);
    };
  }, [sdk, threadId]);
  const current =
    data.threadId === threadId ? data : { state: undefined, loading: true, error: undefined };
  return <SubagentsView state={current.state} loading={current.loading} error={current.error} />;
}
