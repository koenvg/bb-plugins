import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRealtimeConnectionState } from "@get-bb/plugin-sdk/app";

/** `read` and `subscribe` must keep their identity, or every render loads again. */
export function useLiveRpc<T>(channel: string, read: () => Promise<T>,
  subscribe?: (reload: () => void) => () => void): [T | null, () => void] {
  const connection = useRealtimeConnectionState();
  const [value, setValue] = useState<T | null>(null);
  const [reconnects, setReconnects] = useState(0);
  const lastConnection = useRef(connection);
  const reload = useRef(() => {});
  useRealtime(channel, () => reload.current());
  useEffect(() => {
    if (connection === "connected" && lastConnection.current === "reconnecting") setReconnects((count) => count + 1);
    lastConnection.current = connection;
  }, [connection]);
  useEffect(() => {
    let current = true;
    let latestLoad = 0;
    const load = () => {
      const thisLoad = ++latestLoad;
      read().then((result) => { if (current && thisLoad === latestLoad) setValue(result); }).catch(() => {});
    };
    reload.current = load;
    load();
    const unsubscribe = subscribe?.(load);
    return () => { current = false; reload.current = () => {}; unsubscribe?.(); };
  }, [read, subscribe, reconnects]);
  return [value, useCallback(() => reload.current(), [])];
}
