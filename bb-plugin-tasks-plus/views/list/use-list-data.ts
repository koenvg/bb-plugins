import { useCallback, useMemo, useRef, useState } from "react";
import type { Label, Task, TaskStatus } from "../../shared/contract.js";
import type { TaskSort } from "../../shared/pagination.js";
import { useProjects } from "../../shell/data.js";
import { useDetailToasts } from "../detail/toast.js";
import { useBlockedWorkConfirm } from "../dependencies.js";
import { useLabels, useListTasks } from "./data.js";
import { hasActiveFilters, type ListFilterState } from "./filter-bar.js";
import {
  listPreferenceScope,
  loadListPreference,
  storeListPreference,
  type ListPreference,
} from "./list-preference.js";
import { listScrollScopeKey } from "./scroll-restoration.js";
import { buildListTree, groupListTree, labelFilterOptions, selectedLabelIds } from "./lib.js";
import { editedTasks, matchesFilters } from "./optimistic.js";
import { useListTaskEdits } from "./use-task-edits.js";
import { useExpandedTasks } from "./expanded-tasks.js";
import type { EditFn } from "./property-menus.js";

interface ListDataOptions {
  projectId: string | null;
  activeOnly: boolean;
  scopeUnavailable: boolean;
  onRequestContextChange: (commit: () => void) => void;
}

/** Assemble the candidate tree and its query/write readiness, not accepted selection.
 * Preserve unchanged row input identities across selection-only renders. */
export function useListData({
  projectId,
  activeOnly,
  scopeUnavailable,
  onRequestContextChange,
}: ListDataOptions) {
  const projects = useProjects();
  const { toasts, push, dismiss } = useDetailToasts();
  const preferenceScope = listPreferenceScope(projectId, activeOnly);
  const [scopedPreference, setScopedPreference] = useState(() => ({
    scope: preferenceScope,
    value: loadListPreference(preferenceScope),
  }));
  if (scopedPreference.scope !== preferenceScope) {
    setScopedPreference({ scope: preferenceScope, value: loadListPreference(preferenceScope) });
  }
  const preference = scopedPreference.value;
  const updatePreference = (change: (current: ListPreference) => ListPreference) => {
    setScopedPreference((current) => {
      if (current.scope !== preferenceScope) return current;
      const value = change(current.value);
      storeListPreference(current.scope, value);
      return { scope: current.scope, value };
    });
  };
  const filters = preference.filters;
  const sort = preference.sort;
  const setFilters = (next: ListFilterState) => {
    onRequestContextChange(() => {
      updatePreference((current) => ({ ...current, filters: next }));
    });
  };
  const setSort = (next: TaskSort) => {
    onRequestContextChange(() => {
      updatePreference((current) => ({ ...current, sort: next }));
    });
  };
  const sectionFocus = useRef<{ scope: string; status: TaskStatus } | null>(null);
  const sectionFocusRequest = useMemo(
    () => ({
      read: () => sectionFocus.current,
      clear: () => {
        sectionFocus.current = null;
      },
    }),
    [],
  );
  const toggleSection = (status: TaskStatus, collapsed: boolean) => {
    onRequestContextChange(() => {
      if (collapsed) sectionFocus.current = { scope: preferenceScope, status };
      updatePreference((current) => ({
        ...current,
        collapsedStatuses: collapsed
          ? [...new Set([...current.collapsedStatuses, status])]
          : current.collapsedStatuses.filter((value) => value !== status),
      }));
    });
  };

  const labelProjectIds = useMemo(
    () => (projectId !== null ? [projectId] : (projects.data ?? []).map((project) => project.id)),
    [projectId, projects.data],
  );
  const labels = useLabels(labelProjectIds);
  const labelOptions = useMemo(() => labelFilterOptions(labels.data ?? []), [labels.data]);
  const labelIds = useMemo((): readonly string[] | null => {
    if (filters.labelNames.length === 0) return null;
    if (labels.data === undefined) return null;
    return selectedLabelIds(labelOptions, filters.labelNames);
  }, [filters.labelNames, labelOptions, labels.data]);

  const {
    matches: tasksQuery,
    scope: scopeQuery,
    needsScope,
  } = useListTasks(projectId, activeOnly, {
    statuses: filters.statuses,
    priorities: filters.priorities,
    labelIds,
    dependency: filters.dependency,
  });
  const scopeTasks = needsScope ? (scopeQuery.data ?? undefined) : tasksQuery.data;
  const serverTasks = useMemo(
    () => mergeTasks(tasksQuery.data, scopeTasks),
    [tasksQuery.data, scopeTasks],
  );
  const { edit: editTask, entries, pending } = useListTaskEdits(serverTasks, push);
  const { confirmBlockedWork, blockedWorkDialog } = useBlockedWorkConfirm();
  const edit = useCallback<EditFn>(
    (task, patch) => {
      if (patch.status !== "in_progress" || task.status === "in_progress") {
        onRequestContextChange(() => editTask(task, patch));
        return;
      }
      void confirmBlockedWork(task).then((confirmed) => {
        if (confirmed) onRequestContextChange(() => editTask(task, patch));
        return;
      });
    },
    [onRequestContextChange, editTask, confirmBlockedWork],
  );

  const labelsByProject = useMemo(() => {
    const map = new Map<string, Label[]>();
    for (const label of labels.data ?? []) {
      const bucket = map.get(label.projectId);
      if (bucket) bucket.push(label);
      else map.set(label.projectId, [label]);
    }
    return map;
  }, [labels.data]);
  const projectsById = useMemo(
    () => new Map((projects.data ?? []).map((project) => [project.id, project])),
    [projects.data],
  );

  const displayTasks = useMemo(() => {
    if (tasksQuery.data === undefined) return undefined;
    return editedTasks(tasksQuery.data, entries).filter((task) =>
      matchesFilters(task, filters.statuses, filters.priorities, labelIds ?? []),
    );
  }, [tasksQuery.data, entries, filters.statuses, filters.priorities, labelIds]);
  const displayScope = useMemo(
    () => (scopeTasks === undefined ? undefined : editedTasks(scopeTasks, entries)),
    [scopeTasks, entries],
  );

  const showProject = projectId === null;
  const filtered = hasActiveFilters(filters);
  const treeFiltered = filtered || activeOnly;

  const tree = useMemo(
    () =>
      displayTasks === undefined || displayScope === undefined
        ? undefined
        : buildListTree(displayTasks, displayScope, treeFiltered),
    [displayTasks, displayScope, treeFiltered],
  );
  const groups = useMemo(() => groupListTree(tree ?? [], sort), [tree, sort]);
  const knownParentIds = useMemo(() => new Set((tree ?? []).map((entry) => entry.task.id)), [tree]);
  const { isExpanded, toggle: toggleExpanded } = useExpandedTasks(
    preferenceScope,
    treeFiltered ? JSON.stringify(filters) : null,
    knownParentIds,
  );

  const scopeKey = listScrollScopeKey({ projectId, activeOnly, filters, sort });
  const routeScope = JSON.stringify([projectId, activeOnly]);
  const [settled, setSettled] = useState({ routeScope, scopeKey });
  const routeScopeChanged = settled.routeScope !== routeScope;
  const scopeChanged = settled.scopeKey !== scopeKey;
  if (!tasksQuery.isLoading && (routeScopeChanged || scopeChanged)) {
    setSettled({ routeScope, scopeKey });
  }

  const loadError = tasksQuery.error ?? (needsScope ? scopeQuery.error : null);
  // All/Active label names cannot prove absence until the project inventory
  // and the label and task results for that inventory have all succeeded.
  const orderSettled =
    !scopeUnavailable &&
    tree !== undefined &&
    !routeScopeChanged &&
    !scopeChanged &&
    !tasksQuery.isLoading &&
    (!needsScope || !scopeQuery.isLoading) &&
    loadError === null &&
    (filters.labelNames.length === 0 ||
      ((projectId !== null ||
        (!projects.isLoading && projects.error === null && projects.data !== undefined)) &&
        !labels.isLoading &&
        labels.error === null &&
        labels.data !== undefined)) &&
    pending.size === 0;
  const candidate = useMemo(
    () => ({
      groups: groups.map((group) => ({
        ...group,
        collapsed: preference.collapsedStatuses.includes(group.status),
        entries: group.entries.map((entry) => ({
          ...entry,
          expanded: isExpanded(entry),
        })),
      })),
      count: displayTasks?.length,
    }),
    [groups, isExpanded, displayTasks?.length, preference.collapsedStatuses],
  );

  return {
    filters,
    setFilters,
    sort,
    setSort,
    toggleSection,
    labelOptions,
    candidate,
    orderSettled,
    loading: routeScopeChanged || tasksQuery.data === undefined || tree === undefined,
    loadError: routeScopeChanged ? null : loadError,
    treeReady: tree !== undefined,
    filtered,
    showProject,
    projectsById,
    labelsByProject,
    edit,
    pending,
    toggleExpanded,
    toasts,
    dismiss,
    blockedWorkDialog,
    preferenceScope,
    scopeKey,
    sectionFocusRequest,
  };
}

export type ListData = ReturnType<typeof useListData>;

function mergeTasks(
  matches: readonly Task[] | undefined,
  scope: readonly Task[] | undefined,
): readonly Task[] | undefined {
  if (matches === undefined || scope === undefined) return matches;
  if (matches === scope) return matches;
  const byId = new Map(scope.map((task) => [task.id, task]));
  for (const task of matches) byId.set(task.id, task);
  return [...byId.values()];
}
