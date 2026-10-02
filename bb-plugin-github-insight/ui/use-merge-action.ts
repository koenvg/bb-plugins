import { useCallback, useRef, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { RunMergeActionRequest, rpcContract } from "../contract";
import { messageOf } from "./error-message";

type MergeActionState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "error"; message: string; headOid: string };

const IDLE: MergeActionState = { kind: "idle" };

export function useMergeAction(threadId: string, headOid: string) {
  const rpc = useRpc<typeof rpcContract>();
  const [state, setState] = useState<MergeActionState>(IDLE);
  const running = useRef(false);

  const run = useCallback(
    async (request: Omit<RunMergeActionRequest, "threadId">) => {
      if (running.current) return;
      running.current = true;
      setState({ kind: "running" });
      const result = await rpc
        .call("runMergeAction", { threadId, ...request })
        .catch((error: unknown) => ({ kind: "error" as const, message: messageOf(error) }));
      running.current = false;
      setState(result.kind === "error" ? { ...result, headOid: request.expectedHeadOid } : IDLE);
    },
    [rpc, threadId],
  );

  const shown = state.kind === "error" && state.headOid !== headOid ? IDLE : state;
  return { state: shown, run };
}
