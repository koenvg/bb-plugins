import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Label, Task, TaskStatus } from "../../shared/contract.js";
import { useProjects } from "../../shell/data.js";
import { useTasksNavigation } from "../../shell/routes.js";
import { NewTaskDialog } from "../manage/new-task-dialog.js";
import { DetailToasts, useDetailToasts } from "../detail/toast.js";
import { EmptyState } from "../../components/empty-state.js";
import { Button } from "@/components/ui/button";
import { DelayedLoading } from "@/components/ui/delayed-loading";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useLabels, useListTasks, useTaskListMeta } from "./data.js";
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  ListFilterBar,
  type ListFilterState,
} from "./filter-bar.js";
import {
  listPreferenceScope,
  loadListPreference,
  storeListPreference,
  type ListPreference,
} from "./list-preference.js";
import type { TaskSort } from "../../shared/pagination.js";
import { StatusIcon } from "./icons.js";
import { listScrollScopeKey, useListScrollRestoration } from "./scroll-restoration.js";
import {
  buildListTree,
  localIsoDate,
  groupListTree,
  labelFilterOptions,
  selectedLabelIds,
  STATUS_LABELS,
} from "./lib.js";
import { editedTasks, matchesFilters } from "./optimistic.js";
import { useListTaskEdits } from "./use-task-edits.js";
import { useExpandedTasks } from "./expanded-tasks.js";
import { BoundTaskRow, type RowMenu } from "./row.js";
import type { EditFn } from "./property-menus.js";
import { useBlockedWorkConfirm } from "../dependencies.js";
import { useShortcuts } from "../../shell/shortcut-provider.js";
import { forFocusedTask, moveFocusInList } from "../keyboard-navigation.js";
import { useSelectionTree, visibleTreeTasks, type SelectionUnavailable } from "./selection-tree.js";
import { canRestoreBrowseFocus } from "../../shell/shortcuts.js";

/** Keys come from the rendered tree, including dimmed parents and expanded children.
 * Unsettled reports must never be used as proof that a selection was removed. */
export interface VisibleTaskOrder {
  keys: readonly string[];
  settled: boolean;
}
const NO_LABELS: readonly Label[] = [];
const commitContextChange = (commit: () => void) => commit();

interface ListViewProps {
  projectId: string | null;
  activeOnly?: boolean;
  selectedTaskKey?: string | null;
  visible?: boolean;
  onRequestSelection?: (taskKey: string) => void;
  onVisibleOrderChange?: (order: VisibleTaskOrder) => void;
  onRequestContextChange?: (commit: () => void) => void;
  /** Workspace ownership includes the native Ticket portal outside this list's DOM. */
  canRestoreSectionFocus?: () => boolean;
  onSelectionUnavailable?: SelectionUnavailable;
  reconcileRevision?: number;
  scopeUnavailable?: boolean;
}

function LoadingRows() {
  return (
    <DelayedLoading>
      <div className="px-3.5 pt-3">
        <Skeleton className="mb-3 h-4 w-28" />
        {Array.from({ length: 7 }, (_, index) => (
          <div
            key={index}
            className="flex h-[34px] items-center gap-2 border-b border-border-hairline"
          >
            <Skeleton className="size-3.5 rounded-full" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="size-3.5 rounded-full" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        ))}
      </div>
    </DelayedLoading>
  );
}

export function ListView({
  projectId,
  activeOnly = false,
  selectedTaskKey = null,
  visible = true,
  onRequestSelection,
  onVisibleOrderChange,
  onRequestContextChange = commitContextChange,
  canRestoreSectionFocus,
  onSelectionUnavailable,
  reconcileRevision = 0,
  scopeUnavailable = false,
}: ListViewProps) {
  const navigation = useTasksNavigation();
  const referenceDate = localIsoDate(0);
  const openTask = useCallback(
    (taskKey: string) => {
      if (onRequestSelection) onRequestSelection(taskKey);
      else navigation.go({ kind: "task", taskKey });
    },
    [onRequestSelection, navigation],
  );
  const projects = useProjects();
  const { toasts, push, dismiss } = useDetailToasts();
  const preferenceScope = listPreferenceScope(projectId, activeOnly);
  const [preference, setPreference] = useState<ListPreference>(() =>
    loadListPreference(preferenceScope),
  );
  useEffect(() => {
    setPreference(loadListPreference(preferenceScope));
  }, [preferenceScope]);
  const filters = preference.filters;
  const sort = preference.sort;
  const setFilters = (next: ListFilterState) => {
    onRequestContextChange(() => {
      setPreference((current) => {
        const updated: ListPreference = { ...current, filters: next };
        storeListPreference(preferenceScope, updated);
        return updated;
      });
    });
  };
  const setSort = (next: TaskSort) => {
    onRequestContextChange(() => {
      setPreference((current) => {
        const updated: ListPreference = {
          ...current,
          sort: next,
        };
        storeListPreference(preferenceScope, updated);
        return updated;
      });
    });
  };
  const sectionFocus = useRef<{ scope: string; status: TaskStatus } | null>(null);
  const toggleSection = (status: TaskStatus, collapsed: boolean) => {
    onRequestContextChange(() => {
      if (collapsed) sectionFocus.current = { scope: preferenceScope, status };
      setPreference((current) => {
        const updated: ListPreference = {
          ...current,
          collapsedStatuses: collapsed
            ? [...new Set([...current.collapsedStatuses, status])]
            : current.collapsedStatuses.filter((value) => value !== status),
        };
        storeListPreference(preferenceScope, updated);
        return updated;
      });
    });
  };
  const [newTaskOpen, setNewTaskOpen] = useState(false);

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
  const edits = useListTaskEdits(serverTasks, push);
  const { confirmBlockedWork, blockedWorkDialog } = useBlockedWorkConfirm();
  const edit = useCallback<EditFn>(
    (task, patch) => {
      if (patch.status !== "in_progress" || task.status === "in_progress") {
        onRequestContextChange(() => edits.edit(task, patch));
        return;
      }
      void confirmBlockedWork(task).then((confirmed) => {
        if (confirmed) onRequestContextChange(() => edits.edit(task, patch));
      });
    },
    [onRequestContextChange, edits.edit, confirmBlockedWork],
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
    return editedTasks(tasksQuery.data, edits.entries).filter((task) =>
      matchesFilters(task, filters.statuses, filters.priorities, labelIds ?? []),
    );
  }, [tasksQuery.data, edits.entries, filters.statuses, filters.priorities, labelIds]);
  const displayScope = useMemo(
    () => (scopeTasks === undefined ? undefined : editedTasks(scopeTasks, edits.entries)),
    [scopeTasks, edits.entries],
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
  const expanded = useExpandedTasks(
    preferenceScope,
    treeFiltered ? JSON.stringify(filters) : null,
    knownParentIds,
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const scopeKey = listScrollScopeKey({ projectId, activeOnly, filters, sort });
  const [settledScope, setSettledScope] = useState(scopeKey);
  const scopeChanged = settledScope !== scopeKey;
  useEffect(() => {
    if (!tasksQuery.isLoading) setSettledScope(scopeKey);
  }, [scopeKey, tasksQuery.isLoading, tasksQuery.data]);
  const routeScope = `${projectId ?? "-"}/${activeOnly}`;
  const [settledRouteScope, setSettledRouteScope] = useState(routeScope);
  const routeScopeChanged = settledRouteScope !== routeScope;
  const previousRouteScope = useRef(routeScope);
  useEffect(() => {
    const routeScopeJustChanged = previousRouteScope.current !== routeScope;
    previousRouteScope.current = routeScope;
    if (!routeScopeJustChanged && !tasksQuery.isLoading) {
      setSettledRouteScope(routeScope);
    }
  }, [routeScope, tasksQuery.isLoading, tasksQuery.data]);

  const [openRowMenu, setOpenRowMenu] = useState<{
    taskKey: string;
    menu: RowMenu;
  } | null>(null);
  const forFocusedRow = (act: (taskKey: string) => void) =>
    forFocusedTask(() => scrollRef.current, act);
  const openRowMenuFromShortcut = (menu: RowMenu) =>
    forFocusedRow((taskKey) => {
      if (onRequestSelection && taskKey !== selectedTaskKey) return;
      setOpenRowMenu({ taskKey, menu });
    });
  useShortcuts({
    "list.next": onRequestSelection ? null : () => moveFocusInList(scrollRef.current, 1),
    "list.previous": onRequestSelection ? null : () => moveFocusInList(scrollRef.current, -1),
    "list.open": onRequestSelection ? null : forFocusedRow((taskKey) => openTask(taskKey)),
    "list.status": openRowMenuFromShortcut("status"),
    "list.priority": openRowMenuFromShortcut("priority"),
    "list.labels": openRowMenuFromShortcut("labels"),
  });

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
    edits.pending.size === 0;
  const candidate = useMemo(
    () => ({
      groups: groups.map((group) => ({
        ...group,
        collapsed: preference.collapsedStatuses.includes(group.status),
        entries: group.entries.map((entry) => ({
          ...entry,
          expanded: expanded.isExpanded(entry),
        })),
      })),
      count: displayTasks?.length,
    }),
    [groups, expanded.isExpanded, displayTasks?.length, preference.collapsedStatuses],
  );
  const rendered = useSelectionTree(
    candidate,
    selectedTaskKey,
    orderSettled,
    onSelectionUnavailable,
    reconcileRevision,
  );
  const visibleTasks = useMemo(() => visibleTreeTasks(rendered.tree), [rendered.tree]);
  const visibleKeys = JSON.stringify(visibleTasks.map((task) => task.key));
  const visibleOrderSettled = orderSettled && !rendered.retained;
  useEffect(() => {
    const pending = sectionFocus.current;
    if (!pending) return;
    if (pending.scope !== preferenceScope || !visible) {
      sectionFocus.current = null;
      return;
    }
    const list = scrollRef.current;
    // An accepted collapse does not retain ownership of another pane or overlay.
    if (!list || !(canRestoreSectionFocus?.() ?? canRestoreBrowseFocus(list))) {
      sectionFocus.current = null;
      return;
    }
    // A retained tree keeps the section expanded until hidden selection clears.
    if (rendered.retained) return;
    const group = rendered.tree.groups.find((value) => value.status === pending.status);
    if (!group?.collapsed) return;
    sectionFocus.current = null;
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
  ]);
  const meta = useTaskListMeta(
    tree === undefined ? undefined : visibleTasks,
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
  const renderRow = (
    task: Task,
    extra: Pick<
      React.ComponentProps<typeof BoundTaskRow>,
      "depth" | "dimmed" | "expanded" | "entry"
    >,
  ) => (
    <BoundTaskRow
      key={task.id}
      task={task}
      meta={meta.data?.get(task.id)}
      project={projectsById.get(task.projectId)}
      showProject={showProject}
      projectLabels={labelsByProject.get(task.projectId) ?? NO_LABELS}
      onEdit={edit}
      referenceDate={referenceDate}
      onOpenTask={openTask}
      selected={selectedTaskKey === task.key}
      pending={edits.pending.has(task.id)}
      openMenu={openRowMenu?.taskKey === task.key ? openRowMenu.menu : null}
      setOpenRowMenu={setOpenRowMenu}
      toggleExpanded={expanded.toggle}
      onRequestContextChange={onRequestContextChange}
      {...extra}
    />
  );

  let body: React.ReactNode;
  if (
    !rendered.retained &&
    (routeScopeChanged || tasksQuery.data === undefined || tree === undefined)
  ) {
    body =
      !routeScopeChanged && loadError !== null ? (
        <EmptyState icon="AlertCircle" title="Couldn't load tasks" description={loadError} />
      ) : (
        <LoadingRows />
      );
  } else if (rendered.tree.groups.length === 0) {
    if (filtered) {
      body = (
        <EmptyState
          icon="Search"
          title="No tasks match these filters"
          action={
            <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </Button>
          }
        />
      );
    } else if (activeOnly) {
      body = (
        <EmptyState
          icon="Zap"
          title="No agents working right now"
          description="Dispatch a task to an agent preset and it will show up here while it runs."
        />
      );
    } else {
      body = (
        <EmptyState
          icon="ListTodo"
          title="No tasks yet"
          description="Create the first task to start tracking work."
          action={
            <Button size="sm" onClick={() => setNewTaskOpen(true)}>
              <Icon name="Plus" className="size-3.5" />
              New task
            </Button>
          }
        />
      );
    }
  } else {
    body = rendered.tree.groups.map((group) => (
      <section key={group.status}>
        <button
          type="button"
          aria-label={STATUS_LABELS[group.status]}
          aria-expanded={!group.collapsed}
          data-status-group-header={group.status}
          onClick={(event) => {
            event.currentTarget.focus({ preventScroll: true });
            toggleSection(group.status, !group.collapsed);
          }}
          className="sticky top-0 z-20 isolate flex min-h-9 w-full items-center gap-2 border-b border-border-hairline bg-muted px-3.5 py-2 text-left text-sm font-semibold before:pointer-events-none before:absolute before:inset-0 before:-z-10 hover:before:bg-state-hover active:before:bg-state-active focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11"
        >
          <Icon
            name={group.collapsed ? "ChevronRight" : "ChevronDown"}
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <StatusIcon status={group.status} />
          {STATUS_LABELS[group.status]}
          <span className="inline-flex min-w-5 items-center justify-center rounded-sm border border-border-hairline bg-background px-1.5 text-xs font-medium tabular-nums text-muted-foreground">
            {group.entries.length}
          </span>
        </button>
        {group.collapsed
          ? null
          : group.entries.map((entry) => {
              const isExpanded = entry.expanded;
              return (
                <Fragment key={entry.task.id}>
                  {renderRow(entry.task, {
                    dimmed: entry.dimmed,
                    expanded: isExpanded,
                    entry: entry,
                  })}
                  {isExpanded
                    ? entry.children.map((child) => renderRow(child, { depth: 1 }))
                    : null}
                </Fragment>
              );
            })}
      </section>
    ));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ListFilterBar
        filters={filters}
        onChange={setFilters}
        sort={sort}
        onSortChange={setSort}
        labelOptions={labelOptions}
        taskCount={rendered.tree.count}
      />
      <div
        ref={scrollRef}
        data-list-scroll
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain @container"
      >
        {body}
      </div>
      <NewTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} projectId={projectId} />
      <DetailToasts toasts={toasts} onDismiss={dismiss} />
      {blockedWorkDialog}
    </div>
  );
}

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
