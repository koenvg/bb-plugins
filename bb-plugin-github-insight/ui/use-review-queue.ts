import { useCallback, useEffect, useRef, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { ReviewQueueView, rpcContract } from "../contract";
import { messageOf } from "./error-message";

export const REVIEW_QUEUE_POLL_MS = 5 * 60_000;

export interface ReviewQueueState {
  view: ReviewQueueView | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

export function useReviewQueue(): ReviewQueueState {
  const rpc = useRpc<typeof rpcContract>();
  const [view, setView] = useState<ReviewQueueView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    const isLatest = () => request === latestRequest.current;
    setLoading(true);
    try {
      const result = await rpc.call("getReviewQueue", {});
      if (!isLatest()) return;
      if (result.kind === "ok") {
        const { kind: _, ...loaded } = result;
        setView(loaded);
        setError(null);
      } else {
        if (result.lastGood !== null) setView(result.lastGood);
        setError(result.message);
      }
    } catch (failure) {
      if (isLatest()) setError(messageOf(failure));
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), REVIEW_QUEUE_POLL_MS);
    return () => {
      clearInterval(interval);
      latestRequest.current++;
    };
  }, [load]);

  const refresh = useCallback(() => void load(), [load]);
  return { view, error, loading, refresh };
}
