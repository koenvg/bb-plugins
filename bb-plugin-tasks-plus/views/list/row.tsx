import { useRef } from "react";
import type { Label, Project, Task } from "../../shared/contract.js";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { DependencyBadges } from "../dependencies.js";
import type { TaskRowMeta } from "./data.js";
import { formatDueDate, partitionLabels } from "./lib.js";
import type { EditFn } from "./property-menus.js";
import {
  PriorityEditor,
  StatusEditor,
  TaskContextMenu,
} from "./property-menus.js";
import { LabelsPicker } from "../labels-picker.js";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { ThreadSummary } from "./thread-summary.js";
import { PrSummary } from "./pr-summary.js";

export type RowMenu = "status" | "priority" | "labels";

const RAIL_CHIP_CLASS =
  "flex items-center gap-1 rounded-md border border-border px-1.5 py-px text-xs text-muted-foreground";

function LabelChip({ label }: { label: Label }) {
  return (
    <span className={`${RAIL_CHIP_CLASS} max-w-32`}>
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: label.color }}
      />
      <span className="truncate">{label.name}</span>
    </span>
  );
}

function LabelChipRow({
  labels,
  maxVisible,
}: {
  labels: readonly Label[];
  maxVisible: number;
}) {
  const { visible, hidden } = partitionLabels(labels, maxVisible);
  return (
    <>
      {visible.map((label) => (
        <LabelChip key={label.id} label={label} />
      ))}
      {hidden.length > 0 ? (
        <span
          title={hidden.map((label) => label.name).join(", ")}
          className={`${RAIL_CHIP_CLASS} tabular-nums`}
        >
          +{hidden.length}
        </span>
      ) : null}
    </>
  );
}

function LabelChips({
  task,
  labelsById,
}: {
  task: Task;
  labelsById: Map<string, Label>;
}) {
  const labels = task.labelIds.flatMap((id) => labelsById.get(id) ?? []);
  if (labels.length === 0) return null;
  return (
    <>
      <span className="hidden items-center gap-1.5 @xl:flex">
        <LabelChipRow labels={labels} maxVisible={2} />
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5 @md:flex-nowrap @xl:hidden">
        <LabelChipRow labels={labels} maxVisible={1} />
      </span>
    </>
  );
}

interface TaskRowProps {
  task: Task;
  meta: TaskRowMeta | undefined;
  project: Project | undefined;
  showProject: boolean;
  labelsById: Map<string, Label>;
  projectLabels: readonly Label[];
  onEdit: EditFn;
  onOpen: () => void;
  pending: boolean;
  selected?: boolean;
  depth?: 0 | 1;
  dimmed?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  subProgress?: { done: number; total: number };
  openMenu: RowMenu | null;
  onOpenMenuChange: (menu: RowMenu | null) => void;
}

export function TaskRow({
  task,
  meta,
  project,
  showProject,
  labelsById,
  projectLabels,
  onEdit,
  onOpen,
  pending,
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
  const menuProps = (menu: RowMenu) => ({
    open: openMenu === menu,
    onOpenChange: (open: boolean) => onOpenMenuChange(open ? menu : null),
  });
  const focusRowOnClose = (event: Event) => {
    event.preventDefault();
    openButtonRef.current?.focus();
  };

  return (
    <TaskContextMenu task={task} onEdit={onEdit} projectLabels={projectLabels}>
      <div
        data-task-key={task.key}
        data-selected={selected || undefined}
        data-dimmed={dimmed || undefined}
        aria-busy={pending || undefined}
        className={cn(
          "relative grid w-full grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 border-b border-border-hairline px-3.5 py-1.5 text-left transition-opacity hover:bg-state-hover",
          "@4xl:flex @4xl:min-h-[34px] @4xl:flex-wrap",
          depth === 1 && "pl-9",
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
            className="absolute left-0.5 top-1/2 z-10 flex size-3.5 -translate-y-1/2 items-center justify-center rounded-sm text-subtle-foreground hover:bg-state-active hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Icon
              name="ChevronRight"
              className={cn(
                "size-3 transition-transform",
                expanded && "rotate-90",
              )}
            />
          </button>
        ) : null}
        <PriorityEditor
          task={task}
          onEdit={onEdit}
          {...menuProps("priority")}
          onCloseAutoFocus={focusRowOnClose}
          className="col-start-1 row-start-2 @max-md:self-start"
        />
        <span className="col-start-2 row-start-2 min-w-0 truncate text-xs tabular-nums text-subtle-foreground @max-md:max-w-32 @max-md:self-start @4xl:w-14 @4xl:shrink-0">
          {task.key}
        </span>
        <StatusEditor
          task={task}
          onEdit={onEdit}
          {...menuProps("status")}
          onCloseAutoFocus={focusRowOnClose}
          className="col-start-1 row-start-1"
        />
        <Popover {...menuProps("labels")}>
          <PopoverAnchor asChild>
            <span className="col-start-2 col-span-2 row-start-1 min-w-0 truncate text-sm @4xl:flex-1 @4xl:min-w-64">
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
        <span className="col-start-3 row-start-2 flex min-w-0 items-center gap-1.5 justify-self-end text-xs text-subtle-foreground max-w-full flex-wrap justify-end self-start @4xl:shrink-0 @4xl:self-center">
          {subProgress !== undefined && subProgress.total > 0 ? (
            <span
              title="Subtasks done"
              className={`${RAIL_CHIP_CLASS} shrink-0 tabular-nums`}
            >
              <Icon name="GitBranch" className="size-3 shrink-0" />
              {subProgress.done}/{subProgress.total}
            </span>
          ) : null}
          <DependencyBadges task={task} className="py-px text-xs" />
          <ThreadSummary taskKey={task.key} meta={meta} />
          <PrSummary taskKey={task.key} meta={meta} />
          <LabelChips task={task} labelsById={labelsById} />
          {task.dueDate !== null ? (
            <span className={`${RAIL_CHIP_CLASS} shrink-0 tabular-nums`}>
              <Icon name="Clock" className="size-3 shrink-0" />
              {formatDueDate(task.dueDate)}
            </span>
          ) : null}
          {showProject && project !== undefined ? (
            <span
              aria-hidden
              title={project.name}
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: project.color }}
            />
          ) : null}
        </span>
      </div>
    </TaskContextMenu>
  );
}
