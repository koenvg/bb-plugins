import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTasksNavigation } from "../../shell/routes.js";
import { useShortcuts } from "../../shell/shortcut-provider.js";
import { canRestoreBrowseFocus } from "../../shell/shortcuts.js";
import { focusedTaskKey, moveFocusInList } from "../keyboard-navigation.js";
import { useTaskListMeta } from "./data.js";
import { useListScrollRestoration } from "./scroll-restoration.js";
import { visibleTreeTasks, type useSelectionTree } from "./selection-tree.js";
import type { RowMenu } from "./row.js";
import type { VisibleTaskOrder } from "./index.js";
import type { ListData } from "./use-list-data.js";

interface ListControlOptions {
  data: Pick<
    ListData,
    | "preferenceScope"
    | "scopeKey"
    | "sectionFocusRequest"
    | "filters"
    | "orderSettled"
    | "treeReady"
  >;
  rendered: ReturnType<typeof useSelectionTree>;
  selectedTaskKey: string | null;
  visible: boolean;
  onRequestSelection?: (taskKey: string) => void;
  onVisibleOrderChange?: (order: VisibleTaskOrder) => void;
  canRestoreSectionFocus?: () => boolean;
}

/** DOM controls and subscriptions follow the retained rendered tree, never the candidate. */
export function useListControls({
  data,
  rendered,
  selectedTaskKey,
  visible,
  onRequestSelection,
  onVisibleOrderChange,
  canRestoreSectionFocus,
}: ListControlOptions) {
  const { preferenceScope, scopeKey, sectionFocusRequest, filters, orderSettled, treeReady } = data;
  const navigation = useTasksNavigation();
  const openTaskAction = useRef({ onRequestSelection, navigation });
  useLayoutEffect(() => {
    openTaskAction.current = { onRequestSelection, navigation };
  }, [onRequestSelection, navigation]);
  const openTask = useCallback((taskKey: string) => {
    const { onRequestSelection, navigation } = openTaskAction.current;
    if (onRequestSelection) onRequestSelection(taskKey);
    else navigation.go({ kind: "task", taskKey });
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [openRowMenu, setOpenRowMenu] = useState<{
    taskKey: string;
    menu: RowMenu;
  } | null>(null);
  const openFocusedRowMenu = (menu: RowMenu) => {
    const taskKey = focusedTaskKey(scrollRef.current);
    if (taskKey === null) return false;
    if (!onRequestSelection || taskKey === selectedTaskKey) setOpenRowMenu({ taskKey, menu });
  };
  useShortcuts({
    "list.next": onRequestSelection ? null : () => moveFocusInList(scrollRef.current, 1),
    "list.previous": onRequestSelection ? null : () => moveFocusInList(scrollRef.current, -1),
    "list.open": onRequestSelection
      ? null
      : () => {
          const taskKey = focusedTaskKey(scrollRef.current);
          if (taskKey === null) return false;
          openTask(taskKey);
        },
    "list.status": () => openFocusedRowMenu("status"),
    "list.priority": () => openFocusedRowMenu("priority"),
    "list.labels": () => openFocusedRowMenu("labels"),
  });

  const visibleTasks = useMemo(() => visibleTreeTasks(rendered.tree), [rendered.tree]);
  const visibleKeys = JSON.stringify(visibleTasks.map((task) => task.key));
  const visibleOrderSettled = orderSettled && !rendered.retained;
  useEffect(() => {
    const pending = sectionFocusRequest.read();
    if (!pending) return;
    if (pending.scope !== preferenceScope || !visible) {
      sectionFocusRequest.clear();
      return;
    }
    const list = scrollRef.current;
    // An accepted collapse does not retain ownership of another pane or overlay.
    if (!list || !(canRestoreSectionFocus?.() ?? canRestoreBrowseFocus(list))) {
      sectionFocusRequest.clear();
      return;
    }
    // A retained tree keeps the section expanded until hidden selection clears.
    if (selectedTaskKey !== null && rendered.retained) return;
    const group = rendered.tree.groups.find((value) => value.status === pending.status);
    if (!group?.collapsed) return;
    sectionFocusRequest.clear();
    list
      .querySelector<HTMLButtonElement>(`[data-status-group-header="${pending.status}"]`)
      ?.focus({ preventScroll: true });
  }, [
    rendered.tree,
    rendered.retained,
    preferenceScope,
    visible,
    selectedTaskKey,
    canRestoreSectionFocus,
    sectionFocusRequest,
  ]);
  const meta = useTaskListMeta(
    treeReady ? visibleTasks : undefined,
    JSON.stringify([preferenceScope, filters]),
  );
  useListScrollRestoration(scrollRef, scopeKey, {
    visible,
    contentReady: visibleOrderSettled && rendered.tree.groups.length > 0,
    loading: !visibleOrderSettled,
    revision:
      JSON.stringify(
        rendered.tree.groups.map((group) => [group.status, group.collapsed, group.entries.length]),
      ) + visibleKeys,
  });
  useEffect(() => {
    onVisibleOrderChange?.({
      keys: JSON.parse(visibleKeys) as string[],
      settled: visibleOrderSettled,
    });
  }, [visibleKeys, visibleOrderSettled, onVisibleOrderChange]);

  return { scrollRef, openTask, openRowMenu, setOpenRowMenu, meta, visibleTasks };
}
