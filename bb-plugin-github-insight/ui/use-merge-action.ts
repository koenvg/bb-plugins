import { useCallback, useSyncExternalStore } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { RunMergeActionRequest, rpcContract } from "../contract";
import { mergeOperations, type MergeOperationState } from "./merge-operations";

const IDLE: MergeOperationState = { kind: "idle" };

export function useMergeAction(threadId: string, headOid?: string) {
  const rpc = useRpc<typeof rpcContract>();
  const subscribe = useCallback((notify: () => void) => mergeOperations.subscribe(threadId, notify), [threadId]);
  const snapshot = useCallback(() => mergeOperations.snapshot(threadId), [threadId]);
  const state = useSyncExternalStore(subscribe, snapshot);
  const run = useCallback(
    (request: Omit<RunMergeActionRequest, "threadId">) =>
      mergeOperations.run(threadId, request, () => rpc.call("runMergeAction", { threadId, ...request })),
    [rpc, threadId],
  );
  const dismiss = useCallback(() => mergeOperations.dismiss(threadId), [threadId]);
  const shown = state.kind === "error" && headOid !== undefined && state.headOid !== headOid ? IDLE : state;
  return { state: shown, run, dismiss };
}
