import { memo, useCallback, useMemo, useRef, type RefObject } from "react";
import type { Label, Project, Task } from "../../shared/contract.js";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { DependencyBadges } from "../dependencies.js";
import type { TaskRowMeta } from "./data.js";
import { formatDueDate, localIsoDate } from "./lib.js";
import type { EditFn } from "./property-menus.js";
import { PriorityEditor, StatusEditor, TaskContextMenu } from "./property-menus.js";
import { LabelsPicker } from "../labels-picker.js";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { ThreadSummary, threadActivity } from "./thread-summary.js";
import { PrSummary } from "./pr-summary.js";
import {
  COARSE_POINTER_TEXT_BASE_CLASS,
  COARSE_POINTER_TEXT_SM_CLASS,
} from "@/components/ui/coarse-pointer-sizing";

export type RowMenu = "status" | "priority" | "labels";

const RAIL_CHIP_CLASS = `flex items-center gap-1 rounded-md border border-border px-1.5 py-px text-muted-foreground ${COARSE_POINTER_TEXT_SM_CLASS}`;

interface TaskRowProps {
  task: Task;
  meta: TaskRowMeta | undefined;
  project: Project | undefined;
  showProject: boolean;
  projectLabels: readonly Label[];
  onEdit: EditFn;
  onOpen: () => void;
  pending: boolean;
  selected?: boolean;
  referenceDate?: string;
  depth?: 0 | 1;
  dimmed?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  subProgress?: { done: number; total: number };
  openMenu: RowMenu | null;
  onOpenMenuChange: (menu: RowMenu | null) => void;
}

export const TaskRow = memo(function TaskRow({
  task,
  meta,
  project,
  showProject,
  projectLabels,
  onEdit,
  onOpen,
  pending,
  referenceDate = localIsoDate(0),
  selected = false,
  depth = 0,
  dimmed = false,
  expanded = false,
  onToggleExpanded,
  subProgress,
  openMenu,
  onOpenMenuChange,
}: TaskRowProps) {
  const openButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <TaskContextMenu
      task={task}
      onEdit={onEdit}
      projectLabels={projectLabels}
      referenceDate={referenceDate}
    >
      <div
        data-task-key={task.key}
        data-selected={selected || undefined}
        data-dimmed={dimmed || undefined}
        data-agent-state={threadActivity(meta)}
        data-depth={depth}
        aria-busy={pending || undefined}
        className={cn(
          "task-list-row relative grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 border-b border-border-hairline px-3.5 py-1.5 text-left transition-opacity hover:bg-state-hover",
          "pointer-coarse:min-h-11",
          onToggleExpanded !== undefined && "pointer-coarse:pl-12",
          depth === 1 && "pl-9 pointer-coarse:pl-14",
          dimmed && "opacity-50",
          pending && "opacity-70",
          selected && "bg-state-active",
        )}
      >
        <button
          ref={openButtonRef}
          type="button"
          data-nav-item
          aria-label={`Open ${task.key}: ${task.title}`}
          aria-current={selected ? "true" : undefined}
          onClick={onOpen}
          className="absolute inset-0 rounded-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        />
        {onToggleExpanded !== undefined ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} subtasks of ${task.key}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpanded();
            }}
            className="absolute left-0.5 top-1/2 z-10 flex size-3.5 pointer-coarse:size-11 -translate-y-1/2 items-center justify-center rounded-sm text-subtle-foreground hover:bg-state-active hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Icon
              name="ChevronRight"
              className={cn(
                "task-list-expand-icon size-3 transition-transform motion-reduce:transition-none",
                expanded && "rotate-90",
              )}
            />
          </button>
        ) : null}
        <RowContents
          task={task}
          meta={meta}
          project={project}
          showProject={showProject}
          projectLabels={projectLabels}
          onEdit={onEdit}
          subProgress={subProgress}
          referenceDate={referenceDate}
          openMenu={openMenu}
          onOpenMenuChange={onOpenMenuChange}
          openButtonRef={openButtonRef}
        />
      </div>
    </TaskContextMenu>
  );
});

const RowContents = memo(function RowContents({
  task,
  meta,
  project,
  showProject,
  projectLabels,
  onEdit,
  subProgress,
  referenceDate,
  openMenu,
  onOpenMenuChange,
  openButtonRef,
}: Pick<
  TaskRowProps,
  | "task"
  | "meta"
  | "project"
  | "showProject"
  | "projectLabels"
  | "referenceDate"
  | "onEdit"
  | "subProgress"
  | "openMenu"
  | "onOpenMenuChange"
> & {
  openButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const menuProps = (menu: RowMenu) => ({
    open: openMenu === menu,
    onOpenChange: (open: boolean) => onOpenMenuChange(open ? menu : null),
  });
  const focusRowOnClose = (event: Event) => {
    event.preventDefault();
    openButtonRef.current?.focus({ preventScroll: true });
  };
  return (
    <>
      <StatusEditor
        task={task}
        onEdit={onEdit}
        {...menuProps("status")}
        onCloseAutoFocus={focusRowOnClose}
        className="task-list-status col-start-1 row-start-1 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
      />
      <div className="task-list-identity col-start-2 row-start-1 flex min-w-0 items-baseline gap-2">
        <span
          className={cn(
            "task-list-key inline-flex shrink-0 items-center gap-2 tabular-nums text-muted-foreground",
            COARSE_POINTER_TEXT_SM_CLASS,
          )}
        >
          {showProject && project !== undefined ? (
            <span
              aria-hidden
              title={project.name}
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: project.color }}
            />
          ) : null}
          <span className="task-list-key-text" title={task.key}>
            {task.key}
          </span>
        </span>
        <Popover {...menuProps("labels")}>
          <PopoverAnchor asChild>
            <span
              className={cn(
                "task-list-title min-w-0 flex-1 break-words font-medium",
                COARSE_POINTER_TEXT_BASE_CLASS,
              )}
            >
              {task.title}
            </span>
          </PopoverAnchor>
          <PopoverContent
            className="w-56 p-0"
            align="start"
            mobileTitle="Edit labels"
            onCloseAutoFocus={focusRowOnClose}
          >
            <LabelsPicker
              task={task}
              labels={projectLabels}
              onChange={(labelIds) => onEdit(task, { labelIds })}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="task-list-meta col-span-2 grid grid-cols-subgrid items-center">
        <PriorityEditor
          task={task}
          onEdit={onEdit}
          {...menuProps("priority")}
          onCloseAutoFocus={focusRowOnClose}
          className="task-list-priority col-start-1 self-start pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        />
        <span className="task-list-meta-line col-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="task-list-subtasks flex items-center">
            {subProgress !== undefined && subProgress.total > 0 ? (
              <span title="Subtasks done" className={`${RAIL_CHIP_CLASS} shrink-0 tabular-nums`}>
                <Icon name="GitBranch" className="size-3 shrink-0" />
                {subProgress.done}/{subProgress.total}
              </span>
            ) : null}
          </span>
          <span className="task-list-agents flex min-w-0 max-w-full flex-wrap items-center">
            <ThreadSummary taskKey={task.key} meta={meta} />
          </span>
          <span className="task-list-details flex min-w-0 max-w-full flex-wrap items-center gap-1.5 empty:hidden">
            <DependencyBadges task={task} className={cn("py-px", COARSE_POINTER_TEXT_SM_CLASS)} />
            <PrSummary taskKey={task.key} meta={meta} />
            {task.dueDate !== null ? (
              <span className={`${RAIL_CHIP_CLASS} shrink-0 tabular-nums`}>
                <Icon name="Clock" className="size-3 shrink-0" />
                {formatDueDate(task.dueDate, new Date(`${referenceDate}T00:00:00`))}
              </span>
            ) : null}
          </span>
        </span>
      </div>
    </>
  );
});
// Bind per-task actions here. All meaningful action inputs stay explicit.
export function BoundTaskRow({
  onOpenTask,
  setOpenRowMenu,
  toggleExpanded,
  onRequestContextChange,
  entry,
  ...props
}: Omit<
  React.ComponentProps<typeof TaskRow>,
  "onOpen" | "onOpenMenuChange" | "onToggleExpanded" | "subProgress"
> & {
  onOpenTask: (key: string) => void;
  setOpenRowMenu: (menu: { taskKey: string; menu: RowMenu } | null) => void;
  toggleExpanded: (entry: import("./lib.js").ListTreeEntry) => void;
  onRequestContextChange: (commit: () => void) => void;
  entry?: import("./lib.js").ListTreeEntry;
}) {
  const { key } = props.task;
  const onOpen = useCallback(() => onOpenTask(key), [onOpenTask, key]);
  const onOpenMenuChange = useCallback(
    (menu: RowMenu | null) => {
      setOpenRowMenu(menu === null ? null : { taskKey: key, menu });
    },
    [setOpenRowMenu, key],
  );
  const onToggleExpanded = useCallback(() => {
    if (entry) onRequestContextChange(() => toggleExpanded(entry));
  }, [entry, onRequestContextChange, toggleExpanded]);
  const subProgress = useMemo(
    () => (entry ? { done: entry.subDone, total: entry.subTotal } : undefined),
    [entry],
  );
  return (
    <TaskRow
      {...props}
      onOpen={onOpen}
      onOpenMenuChange={onOpenMenuChange}
      onToggleExpanded={entry?.children.length ? onToggleExpanded : undefined}
      subProgress={subProgress}
    />
  );
}
