import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { experimental_useSidebarThreads, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { SnoozeControls } from "./snooze-model";
import { useSnoozes } from "./use-snoozes";
import { useNow } from "./use-now";

export interface SnoozeSnapshot {
  threads: readonly PluginSidebarThread[];
  threadsReady: boolean;
  snoozes: Readonly<Record<string, number>>;
  snoozesReady: boolean;
  controls: SnoozeControls | null;
}

const STOPPED: SnoozeSnapshot = { threads: [], threadsReady: false, snoozes: {}, snoozesReady: false, controls: null };
const NO_CONTROLS: SnoozeControls = { snoozed: new Map(), snooze: async () => {}, wake: async () => {} };

/** One store per frontend registration, shared by the overlay, list, and commands. */
export function createSnoozeClient() {
  let snapshot = STOPPED;
  let generation = 0;
  const listeners = new Set<() => void>();
  const publish = (next: SnoozeSnapshot) => { snapshot = next; listeners.forEach((listener) => listener()); };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      const token = ++generation;
      publish(STOPPED);
      return {
        update(next: SnoozeSnapshot) {
          if (token !== generation) return;
          const controls = next.controls;
          publish({ ...next, controls: controls && {
            snoozed: controls.snoozed,
            snooze: async (id, at) => { if (token === generation) return controls.snooze(id, at); },
            wake: async (id) => { if (token === generation) return controls.wake(id); },
          } });
        },
        stop() { if (token === generation) { generation++; publish(STOPPED); } },
      };
    },
  };
}
export type SnoozeClient = ReturnType<typeof createSnoozeClient>;

export function useSnoozeControls(client: SnoozeClient): SnoozeControls {
  return useSyncExternalStore(client.subscribe, client.getSnapshot).controls ?? NO_CONTROLS;
}

export function SnoozeOwner({ client }: { client: SnoozeClient }) {
  const { threads, status } = experimental_useSidebarThreads();
  const snoozes = useSnoozes(threads, useNow());
  const owner = useRef<ReturnType<SnoozeClient["start"]> | null>(null);
  useLayoutEffect(() => {
    const lease = client.start();
    owner.current = lease;
    return () => { lease.stop(); owner.current = null; };
  }, [client]);
  useLayoutEffect(() => {
    owner.current?.update({ threads, threadsReady: status === "ready", snoozes: snoozes.values,
      snoozesReady: snoozes.ready, controls: snoozes });
  }, [threads, status, snoozes]);
  return null;
}
