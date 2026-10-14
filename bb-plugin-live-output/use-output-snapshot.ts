import { useCallback, useSyncExternalStore } from "react";
import { useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { OutputSnapshot, rpcContract } from "./contract";

export type OutputSnapshotHook = () => {
  snapshot: OutputSnapshot | null;
  disconnected: boolean;
};
type SnapshotRpc = { call(method: "snapshot"): Promise<OutputSnapshot> };
const emptyState = () => ({
  snapshot: null as OutputSnapshot | null,
  failed: false,
  now: Date.now(),
  receivedAt: Date.now(),
});

function createPollingOwner() {
  let state = emptyState();
  const consumers = new Map<() => void, SnapshotRpc>();
  let stop: (() => void) | undefined;
  const publish = (next: typeof state) => {
    state = next;
    for (const notify of consumers.keys()) notify();
  };
  const start = () => {
    // A zero-to-one subscription begins a fresh request grace period.
    state = emptyState();
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (!active || pending) return;
      const rpc = consumers.values().next().value;
      if (!rpc) return;
      pending = true;
      try {
        const snapshot = await rpc.call("snapshot");
        if (active) publish({ snapshot, failed: false, now: Date.now(), receivedAt: Date.now() });
      } catch {
        if (active) publish({ ...state, failed: true });
      } finally {
        pending = false;
      }
    };
    const timer = setInterval(() => {
      publish({ ...state, now: Date.now() });
      void refresh();
    }, 1000);
    void refresh();
    stop = () => {
      active = false;
      clearInterval(timer);
    };
  };
  return {
    getSnapshot: () => state,
    subscribe(rpc: SnapshotRpc, notify: () => void) {
      consumers.set(notify, rpc);
      if (consumers.size === 1) start();
      return () => {
        consumers.delete(notify);
        if (consumers.size === 0) {
          stop?.();
          stop = undefined;
          // A new mount must not display observations from an earlier RPC lifetime.
          state = emptyState();
        }
      };
    },
  };
}

// Create once per app registration, not at module scope. Separate apps and windows
// never share observations. Different SDK slot clients in this app share one owner.
export function createOutputSnapshotHook(): OutputSnapshotHook {
  const owners = new WeakMap<Window, ReturnType<typeof createPollingOwner>>();
  return function useOutputSnapshot() {
    const rpc = useRpc<typeof rpcContract>();
    const connection = useRealtimeConnectionState();
    let owner = owners.get(window);
    if (!owner) {
      owner = createPollingOwner();
      owners.set(window, owner);
    }
    const subscribe = useCallback(
      (notify: () => void) => owner.subscribe(rpc, notify),
      [owner, rpc],
    );
    const { snapshot, failed, now, receivedAt } = useSyncExternalStore(
      subscribe,
      owner.getSnapshot,
    );
    const disconnected =
      failed ||
      connection === "reconnecting" ||
      now - receivedAt > 5000 ||
      (snapshot !== null && connection !== "connected");
    return { snapshot, disconnected };
  };
}
