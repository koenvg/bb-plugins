import { useCallback, useLayoutEffect, useState, type RefObject } from "react";
import { focusedTaskKey } from "../views/keyboard-navigation.js";
import type { VisibleTaskOrder } from "../views/list/index.js";
import { useShortcuts } from "./shortcut-provider.js";
import { canRestoreBrowseFocus } from "./shortcuts.js";
export { canRestoreBrowseFocus } from "./shortcuts.js";

export type BrowseFocusTarget = "row" | "detail";
type PaneRef = RefObject<HTMLElement | null>;

/** Focus is an accepted navigation effect, not a second selected identity.
 * Arm only inside request(commit), never from its shared boolean promise. */
export function useBrowseFocus(selectedKey: string | null, listRef: PaneRef, detailRef: PaneRef) {
  const [intent, setIntent] = useState<{
    key: string;
    origin: string | null;
    target: BrowseFocusTarget;
  } | null>(null);
  const [, setReadyRevision] = useState(0);
  const cancel = useCallback(() => setIntent(null), []);
  const arm = useCallback(
    (key: string, target: BrowseFocusTarget) => setIntent({ key, origin: selectedKey, target }),
    [selectedKey],
  );
  const onReady = useCallback(() => setReadyRevision((revision) => revision + 1), []);

  useLayoutEffect(() => {
    if (!intent) return;
    if (selectedKey !== intent.key) {
      if (selectedKey !== intent.origin) cancel();
      return;
    }
    const list = listRef.current;
    const detail = detailRef.current;
    if (!list || !detail) return;
    const target =
      intent.target === "row" && !list.hidden
        ? [...list.querySelectorAll<HTMLElement>("[data-nav-item]")].find(
            (row) => row.closest<HTMLElement>("[data-task-key]")?.dataset.taskKey === selectedKey,
          )
        : !detail.hidden &&
            [...detail.querySelectorAll<HTMLElement>("[data-detail-key]")].some(
              (node) => node.dataset.detailKey === selectedKey,
            )
          ? detail
          : null;
    if (!target || target.closest("[hidden], [inert]")) return;
    cancel();
    if (!canRestoreBrowseFocus(list, detail)) return;
    target.focus({ preventScroll: true });
    if (target !== detail) target.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  return { cancel, arm, onReady };
}

/** The list report is the only paging order. Recompute from committed identity,
 * not DOM focus or an optimistic index, including while a save is pending. */
export function useBrowseShortcuts({
  selectedKey,
  order,
  listRef,
  detailRef,
  requestSelection,
  back,
}: {
  selectedKey: string | null;
  order: VisibleTaskOrder;
  listRef: PaneRef;
  detailRef: PaneRef;
  requestSelection: (key: string, focus: BrowseFocusTarget) => void;
  back: () => void;
}) {
  const index = selectedKey === null ? -1 : order.keys.indexOf(selectedKey);
  const canMove = order.settled && order.keys.length > 0;
  const previous = canMove && index > 0;
  const next = canMove && index >= 0 && index < order.keys.length - 1;
  const move = (delta: -1 | 1) => {
    if (!canMove) return false;
    const target =
      order.keys[index < 0 ? 0 : Math.max(0, Math.min(order.keys.length - 1, index + delta))]!;
    requestSelection(target, "row");
    return true;
  };
  useShortcuts({
    "list.next": () => move(1),
    "list.previous": () => move(-1),
    "list.open": () => {
      const key = focusedTaskKey(listRef.current);
      if (!key || listRef.current?.hidden || !order.settled || !order.keys.includes(key))
        return false;
      requestSelection(key, "detail");
    },
    "detail.back": () => {
      if (
        !selectedKey ||
        detailRef.current?.hidden ||
        !detailRef.current?.contains(document.activeElement)
      )
        return false;
      back();
    },
    "detail.previous": previous ? () => move(-1) : null,
    "detail.next": next ? () => move(1) : null,
  });
  return { previous, next, move };
}
