import { useEffect, useRef, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract, Summaries } from "./contract";
import { SUMMARY_WRITTEN_CHANNEL } from "./pr-insight";
import { SUMMARIES_CHANGED_CHANNEL } from "./summary-watch";

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
  const reload = useRef(() => {});
  useRealtime(SUMMARIES_CHANGED_CHANNEL, () => reload.current());
  useEffect(() => {
    if (connection === "connected" && lastConnection.current === "reconnecting") setReconnects((count) => count + 1);
    lastConnection.current = connection;
  }, [connection]);
  useEffect(() => {
    let current = true;
    let latestLoad = 0;
    const load = () => {
      const thisLoad = ++latestLoad;
      return rpc.call("listSummaries", {})
        .then((result) => { if (current && thisLoad === latestLoad) setState({ loaded: true, ...result }); })
        .catch(() => {});
    };
    reload.current = () => void load();
    void load();
    const timer = setInterval(load, POLL_MS);
    const announcements = new BroadcastChannel(SUMMARY_WRITTEN_CHANNEL);
    announcements.onmessage = () => void load();
    return () => { current = false; reload.current = () => {}; clearInterval(timer); announcements.close(); };
  }, [rpc, reconnects]);
  return state;
}
