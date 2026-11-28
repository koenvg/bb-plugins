import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import type { ListTreeEntry, groupListTree } from "./lib.js";

export interface RenderedListTree {
  groups: {
    status: ReturnType<typeof groupListTree>[number]["status"];
    collapsed: boolean;
    entries: (ListTreeEntry & { expanded: boolean })[];
  }[];
  count: number | undefined;
}

export type SelectionUnavailable = (taskKey: string, stillUnavailable: () => boolean) => void;

export function visibleTreeTasks(tree: RenderedListTree) {
  return tree.groups.flatMap((group) =>
    group.collapsed
      ? []
      : group.entries.flatMap((entry) =>
          entry.expanded ? [entry.task, ...entry.children] : [entry.task],
        ),
  );
}

/** Retain the rendered origin, not a second selection or query cache. A server
 * update may remove a row before the editor can save. Keep that tree accessible
 * until the route accepts clearing, and never advertise it as settled order. */
export function useSelectionTree(
  candidate: RenderedListTree,
  selectedKey: string | null,
  settled: boolean,
  onUnavailable?: SelectionUnavailable,
  reconcileRevision = 0,
) {
  const origin = useMemo(() => createRenderedOrigin(), []);
  const missing = selectedKey !== null && !hasVisibleTask(candidate, selectedKey);
  const readOrigin = useCallback(
    () => (missing && onUnavailable && selectedKey !== null ? origin.read(selectedKey) : null),
    [missing, onUnavailable, origin, selectedKey],
  );
  const retainedTree = useSyncExternalStore(origin.subscribe, readOrigin);
  const retained = retainedTree !== null;
  const tree = retainedTree ?? candidate;
  const request = useMemo(
    () => ({ selectedKey, missing, settled, reconcileRevision }),
    [selectedKey, missing, settled, reconcileRevision],
  );
  const latest = useRef(request);
  useLayoutEffect(() => {
    latest.current = request;
    origin.commit(tree);
  }, [origin, request, tree]);
  // reconcileRevision comes only from accepted non-selection context commits.
  // Failure alone must not resubmit this request or silently retry an autosave.
  useEffect(() => {
    if (
      latest.current !== request ||
      !request.selectedKey ||
      !request.missing ||
      !request.settled
    ) {
      return;
    }
    onUnavailable?.(request.selectedKey, () => {
      const current = latest.current;
      return current.selectedKey === request.selectedKey && current.missing && current.settled;
    });
  }, [request, onUnavailable]);
  return { tree, retained };
}

function hasVisibleTask(tree: RenderedListTree, taskKey: string): boolean {
  return visibleTreeTasks(tree).some((task) => task.key === taskKey);
}

function createRenderedOrigin() {
  let previous: RenderedListTree | null = null;
  const listeners = new Set<() => void>();
  return {
    read: (key: string) => (previous !== null && hasVisibleTask(previous, key) ? previous : null),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    commit(tree: RenderedListTree) {
      if (previous === tree) return;
      previous = tree;
      for (const listener of listeners) listener();
    },
  };
}
