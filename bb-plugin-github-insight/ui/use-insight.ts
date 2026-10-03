import { useCallback, useEffect } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../contract";
import { INSIGHT_UPDATED_CHANNEL, mentionsThread } from "../core/insight-updated";
import { rememberInsight } from "./pr-availability";
import { useThreadResult, type LoadMode } from "./use-thread-result";

export function useInsight(threadId: string) {
  const rpc = useRpc<typeof rpcContract>();
  const fetchInsight = useCallback(
    (id: string, mode: LoadMode) =>
      rpc.call(mode === "refresh" ? "refresh" : "getInsight", { threadId: id }),
    [rpc],
  );
  const state = useThreadResult(threadId, fetchInsight);

  useEffect(() => {
    if (state.result !== null) rememberInsight(threadId, state.result);
  }, [threadId, state.result]);

  useRealtime(INSIGHT_UPDATED_CHANNEL, (payload) => {
    if (mentionsThread(payload, threadId)) state.reload();
  });

  return state;
}
