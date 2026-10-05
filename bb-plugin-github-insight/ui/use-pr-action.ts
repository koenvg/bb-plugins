import { useCallback, useSyncExternalStore } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { RunPrActionRequest, rpcContract } from "../contract";
import { prOperations, type PrOperationState } from "./pr-operations";

const IDLE: PrOperationState = { kind: "idle" };

export function usePrAction(threadId: string, headOid?: string) {
  const rpc = useRpc<typeof rpcContract>();
  const subscribe = useCallback(
    (notify: () => void) => prOperations.subscribe(threadId, notify),
    [threadId],
  );
  const snapshot = useCallback(() => prOperations.snapshot(threadId), [threadId]);
  const state = useSyncExternalStore(subscribe, snapshot);
  const run = useCallback(
    (request: Omit<RunPrActionRequest, "threadId">) =>
      prOperations.run(threadId, request, () => rpc.call("runPrAction", { threadId, ...request })),
    [rpc, threadId],
  );
  const dismiss = useCallback(() => prOperations.dismiss(threadId), [threadId]);
  const shown =
    state.kind === "error" && headOid !== undefined && state.headOid !== headOid ? IDLE : state;
  return { state: shown, run, dismiss };
}
