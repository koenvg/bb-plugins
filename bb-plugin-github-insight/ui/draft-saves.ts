import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../contract";
import { messageOf } from "./error-message";

const DRAFT_SAVE_DELAY_MS = 500;

export function useDraftSaves(threadId: string, onError: (reviewThreadId: string, message: string) => void) {
  const rpc = useRpc<typeof rpcContract>();
  const unsaved = useRef(new Map<string, { body: string; timer: ReturnType<typeof setTimeout> }>());
  const saving = useRef(new Map<string, Promise<void>>());

  const flush = useCallback(
    (reviewThreadId: string): Promise<void> => {
      const previous = saving.current.get(reviewThreadId) ?? Promise.resolve();
      const pending = unsaved.current.get(reviewThreadId);
      if (pending === undefined) return previous;
      clearTimeout(pending.timer);
      unsaved.current.delete(reviewThreadId);
      const save = previous.then(async () => {
        const result = await rpc
          .call("saveDraft", { threadId, reviewThreadId, body: pending.body })
          .catch((error: unknown) => ({ kind: "error" as const, message: messageOf(error) }));
        if (result.kind === "error") onError(reviewThreadId, result.message);
      });
      saving.current.set(reviewThreadId, save);
      return save;
    },
    [rpc, threadId, onError],
  );

  const schedule = useCallback(
    (reviewThreadId: string, body: string) => {
      clearTimeout(unsaved.current.get(reviewThreadId)?.timer);
      const timer = setTimeout(() => void flush(reviewThreadId), DRAFT_SAVE_DELAY_MS);
      unsaved.current.set(reviewThreadId, { body, timer });
    },
    [flush],
  );

  useEffect(() => {
    const pending = unsaved.current;
    return () => {
      for (const reviewThreadId of [...pending.keys()]) void flush(reviewThreadId);
    };
  }, [flush]);

  return useMemo(() => ({ flush, schedule }), [flush, schedule]);
}
