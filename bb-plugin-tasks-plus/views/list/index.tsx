import { Fragment, useState } from "react";
import type { Label, Task } from "../../shared/contract.js";
import { NewTaskDialog } from "../manage/new-task-dialog.js";
import { DetailToasts } from "../detail/toast.js";
import { EmptyState } from "../../components/empty-state.js";
import { Button } from "@/components/ui/button";
import { DelayedLoading } from "@/components/ui/delayed-loading";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { EMPTY_FILTERS, ListFilterBar } from "./filter-bar.js";
import { StatusIcon } from "./icons.js";
import { localIsoDate, STATUS_LABELS } from "./lib.js";
import { BoundTaskRow } from "./row.js";
import { useSelectionTree, type SelectionUnavailable } from "./selection-tree.js";
import { useListData } from "./use-list-data.js";
import { useListControls } from "./use-list-controls.js";
import { ThreadActivitySummary } from "./thread-summary.js";
import "./list.css";

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
  const data = useListData({ projectId, activeOnly, scopeUnavailable, onRequestContextChange });
  const {
    filters,
    setFilters,
    sort,
    setSort,
    toggleSection,
    labelOptions,
    candidate,
    orderSettled,
    loading,
    loadError,
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
  } = data;
  const rendered = useSelectionTree(
    candidate,
    selectedTaskKey,
    orderSettled,
    onSelectionUnavailable,
    reconcileRevision,
  );
  const { scrollRef, openTask, openRowMenu, setOpenRowMenu, meta, visibleTasks } = useListControls({
    data,
    rendered,
    selectedTaskKey,
    visible,
    onRequestSelection,
    onVisibleOrderChange,
    canRestoreSectionFocus,
  });
  const referenceDate = localIsoDate(0);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
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
      pending={pending.has(task.id)}
      openMenu={openRowMenu?.taskKey === task.key ? openRowMenu.menu : null}
      setOpenRowMenu={setOpenRowMenu}
      toggleExpanded={toggleExpanded}
      onRequestContextChange={onRequestContextChange}
      {...extra}
    />
  );

  let body: React.ReactNode;
  if (!rendered.retained && loading) {
    body =
      loadError !== null ? (
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
      {visibleTasks.length > 0 ? (
        <div className="task-list-activity">
          <span>Agents</span>
          <ThreadActivitySummary statuses={visibleTasks.map((task) => meta.data?.get(task.id))} />
        </div>
      ) : null}
      <div
        ref={scrollRef}
        data-list-scroll
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain @container"
      >
        {rendered.tree.groups.length > 0 ? (
          <div className="task-list-columns" aria-hidden>
            <span className="col-span-2">Task</span>
            <span />
            <span>Subtasks</span>
            <span>Agents</span>
            <span>Dependencies &amp; PR</span>
          </div>
        ) : null}
        {body}
      </div>
      <NewTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} projectId={projectId} />
      <DetailToasts toasts={toasts} onDismiss={dismiss} />
      {blockedWorkDialog}
    </div>
  );
}
