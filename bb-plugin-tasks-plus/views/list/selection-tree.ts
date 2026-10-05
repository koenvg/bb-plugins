import { useEffect, useLayoutEffect, useRef } from "react";
import type { ListTreeEntry, groupListTree } from "./lib.js";

export interface RenderedListTree {
  groups: {
    status: ReturnType<typeof groupListTree>[number]["status"];
    entries: (ListTreeEntry & { expanded: boolean })[];
  }[];
  count: number | undefined;
}

export type SelectionUnavailable = (taskKey: string, stillUnavailable: () => boolean) => void;

export function visibleTreeTasks(tree: RenderedListTree) {
  return tree.groups.flatMap((group) =>
    group.entries.flatMap((entry) =>
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
  const previous = useRef(candidate);
  const missing =
    selectedKey !== null && !visibleTreeTasks(candidate).some((task) => task.key === selectedKey);
  const retained = Boolean(
    onUnavailable &&
    missing &&
    visibleTreeTasks(previous.current).some((task) => task.key === selectedKey),
  );
  const tree = retained ? previous.current : candidate;
  const latest = useRef({ selectedKey, missing, settled });
  useLayoutEffect(() => {
    latest.current = { selectedKey, missing, settled };
    previous.current = tree;
  });
  // reconcileRevision comes only from accepted non-selection context commits.
  // Failure alone must not resubmit this request or silently retry an autosave.
  useEffect(() => {
    if (!selectedKey || !missing || !settled) return;
    onUnavailable?.(selectedKey, () => {
      const current = latest.current;
      return current.selectedKey === selectedKey && current.missing && current.settled;
    });
  }, [selectedKey, missing, settled, onUnavailable, reconcileRevision]);
  return { tree, retained };
}
