import { useEffect } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../contract";

export function usePrefetchPr(threadId: string, hasPr: boolean): void {
  const rpc = useRpc<typeof rpcContract>();
  useEffect(() => {
    if (hasPr) void rpc.call("prefetchPr", { threadId }).catch(() => {});
  }, [rpc, threadId, hasPr]);
}
