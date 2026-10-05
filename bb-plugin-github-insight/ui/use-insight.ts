import { useCallback, useEffect, useRef } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { InsightResult, rpcContract } from "../contract";
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
  const lastGood = useRef<{ threadId: string; result: Extract<InsightResult, { kind: "ok" }> } | null>(null);
  useEffect(() => {
    // Only retain results accepted by useThreadResult, never a late RPC response.
    if (state.result?.kind === "ok") lastGood.current = { threadId, result: state.result };
    else if (state.result?.kind === "no_pr" || lastGood.current?.threadId !== threadId) lastGood.current = null;
  }, [threadId, state.result]);

  const preserveLastGood = useCallback((result: InsightResult | null): InsightResult | null => {
    const previous = lastGood.current;
    return result?.kind === "error" && previous?.threadId === threadId
      ? { ...previous.result, error: result.message }
      : result;
  }, [threadId]);
  const result = preserveLastGood(state.result);
  const refresh = useCallback(async () => preserveLastGood(await state.refresh()), [state.refresh, preserveLastGood]);

  useEffect(() => {
    if (result !== null) rememberInsight(threadId, result);
  }, [threadId, result]);

  useRealtime(INSIGHT_UPDATED_CHANNEL, (payload) => {
    if (mentionsThread(payload, threadId)) state.reload();
  });

  return { ...state, result, refresh };
}
