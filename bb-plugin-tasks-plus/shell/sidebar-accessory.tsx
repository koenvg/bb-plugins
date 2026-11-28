import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  useRealtime,
  useRealtimeConnectionState,
  type ExperimentalBadge,
} from "@get-bb/plugin-sdk/app";
import { useTasksRpc } from "./data.js";
import { useCommandNavigator } from "./command-bridge.js";

export function useTasksBadge(): ExperimentalBadge | null {
  useCommandNavigator();
  const rpc = useTasksRpc();
  const rpcRef = useRef(rpc);
  useLayoutEffect(() => {
    rpcRef.current = rpc;
  }, [rpc]);
  const connectionState = useRealtimeConnectionState();
  const requestState = useRef({
    isMounted: true,
    isRunning: false,
    refreshQueued: false,
  });
  const [count, setCount] = useState<number | null>(null);

  const refresh = useCallback(() => {
    const request = requestState.current;
    if (!request.isMounted) return;
    request.refreshQueued = true;
    if (request.isRunning) return;
    request.isRunning = true;

    const readCount = async () => {
      if (!request.isMounted || !request.refreshQueued) {
        request.isRunning = false;
        return;
      }
      request.refreshQueued = false;
      try {
        const { openTaskCount } = await rpcRef.current.call("sidebarOpenTaskCount");
        if (request.isMounted) setCount(openTaskCount);
      } catch {
        // Keep the last count until a later refresh succeeds.
      }
      void readCount();
    };
    void readCount();
  }, []);

  useEffect(() => {
    const request = requestState.current;
    request.isMounted = true;
    return () => {
      request.isMounted = false;
      request.refreshQueued = false;
    };
  }, []);

  useEffect(() => {
    if (connectionState === "connected") refresh();
  }, [connectionState, refresh]);
  useRealtime("tasks:changed", refresh);
  useRealtime("projects:changed", refresh);

  return count === null || count === 0 ? null : { count, label: `${count} open tasks` };
}
