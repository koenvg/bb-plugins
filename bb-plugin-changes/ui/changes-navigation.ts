import { useSyncExternalStore } from "react";
import type { ExperimentalPanelController } from "@get-bb/plugin-sdk/app";
import type { DiffTarget } from "../core/changes";

interface ChangesDestination {
  target: DiffTarget;
  path?: string;
}

const destinations = new Map<string, ChangesDestination>();
const listeners = new Set<() => void>();

export function openChanges(
  panel: ExperimentalPanelController,
  threadId: string,
  target: DiffTarget,
  path?: string,
): void {
  if (
    !panel.openTab({ tab: { id: "changes", context: { kind: "thread" }, availability: "action" } })
  ) {
    return;
  }
  destinations.set(threadId, { target, path });
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function useChangesDestination(threadId: string): ChangesDestination | undefined {
  return useSyncExternalStore(subscribe, () => destinations.get(threadId));
}

export function clearChangesDestination(threadId: string, destination: ChangesDestination): void {
  if (destinations.get(threadId) !== destination) return;
  destinations.delete(threadId);
  for (const notify of listeners) notify();
}
