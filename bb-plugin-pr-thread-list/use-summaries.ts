import { useEffect, useRef, useState } from "react";
import { useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract, Summaries } from "./contract";

const POLL_MS = 60_000;

export interface SummariesState extends Summaries {
  loaded: boolean;
}

const INITIAL: SummariesState = { loaded: false, insightAvailable: true, summaries: {} };

export function useSummaries(): SummariesState {
  const rpc = useRpc<typeof rpcContract>();
  const connection = useRealtimeConnectionState();
  const [state, setState] = useState(INITIAL);
  const [reconnects, setReconnects] = useState(0);
  const lastConnection = useRef(connection);
  useEffect(() => {
    if (connection === "connected" && lastConnection.current === "reconnecting") setReconnects((count) => count + 1);
    lastConnection.current = connection;
  }, [connection]);
  useEffect(() => {
    let current = true;
    const load = () => rpc.call("listSummaries", {})
      .then((result) => { if (current) setState({ loaded: true, ...result }); })
      .catch(() => {});
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => { current = false; clearInterval(timer); };
  }, [rpc, reconnects]);
  return state;
}
