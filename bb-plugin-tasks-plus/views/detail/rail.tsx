import { useCallback, useEffect, useRef, useState } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import type {
  Label,
  Project,
  Task,
  TaskPriority,
  TaskStatus,
  TaskThread,
} from "../../shared/contract.js";
import { TASK_PRIORITIES, TASK_STATUSES } from "../../shared/contract.js";
import type { Preset } from "../../shared/contract.js";
import { errorMessage } from "../../shared/errors.js";
import { useTasksRpc } from "../../shell/data.js";
import { PriorityIcon, StatusIcon, formatDueDate, isActiveThread } from "./meta.js";
import { DUE_DATE_PRESETS, localIsoDate, PRIORITY_LABELS, STATUS_LABELS } from "../list/lib.js";
import { DispatchControl } from "./threads.js";
import { LabelsPicker } from "../labels-picker.js";
import { BbProjectLinkPicker } from "../manage/bb-project-link.js";
import type { BbProjectOption } from "../../shared/contract.js";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { isLastInputKeyboard } from "@/components/ui/overlay-trigger";

function usePropertyMenuFocus(open: boolean) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusFrame = useRef<number | null>(null);
  const contentRef = useCallback(
    (content: HTMLDivElement | null) => {
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
      focusFrame.current = null;
      if (content && open && isLastInputKeyboard()) {
        focusFrame.current = requestAnimationFrame(() => {
          focusFrame.current = null;
          content
            .querySelector<HTMLElement>('input, [role="menuitem"], [role="combobox"]')
            ?.focus();
        });
      }
    },
    [open],
  );
  const onOpenAutoFocus = (event: Event) => {
    if (isLastInputKeyboard()) event.preventDefault();
  };
  const onCloseAutoFocus = (event: Event) => {
    if (!isLastInputKeyboard()) return;
    event.preventDefault();
    const trigger = triggerRef.current;
    if (trigger?.isConnected && trigger.getClientRects().length) trigger.focus();
  };
  return { triggerRef, contentRef, onOpenAutoFocus, onCloseAutoFocus };
}

export type DetailMenu =
  | "status"
  | "priority"
  | "labels"
  | "dueDate"
  | "linkedProject"
  | "dispatch";

interface MenuControl {
  openMenu: DetailMenu | null;
  onOpenMenuChange: (menu: DetailMenu | null) => void;
}

function menuProps(control: MenuControl, menu: DetailMenu) {
  return {
    open: control.openMenu === menu,
    onOpenChange: (open: boolean) => control.onOpenMenuChange(open ? menu : null),
  };
}

export interface TaskPropertyUpdate {
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  labelIds?: string[];
}

interface TaskPropertiesProps {
  task: Task;
  project: Project | undefined;
  bbProjects: readonly BbProjectOption[];
  labels: Label[] | undefined;
  threads: TaskThread[];
  onUpdate: (update: TaskPropertyUpdate) => void;
}

function LabelChip({ label }: { label: Label }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-2xs text-muted-foreground">
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ backgroundColor: label.color }}
      />
      {label.name}
    </span>
  );
}

function CreatorThreadProperty({ task }: { task: Task }) {
  const navigate = useBbNavigate();
  if (!task.createdByThreadId) return null;
  return (
    <div className="basis-full py-2 text-2xs text-muted-foreground">
      <div>Created by thread</div>
      <button
        type="button"
        className="max-w-full truncate text-left text-foreground underline underline-offset-2"
        onClick={() => navigate.toThread(task.createdByThreadId!)}
      >
        {task.createdByThreadId}
      </button>
      {task.creatorThreadBlocked ? <p>Blocked until this thread is archived.</p> : null}
    </div>
  );
}

function StatusMenu({
  task,
  onUpdate,
  triggerClassName,
  open,
  onOpenChange,
}: {
  task: Task;
  onUpdate: (update: TaskPropertyUpdate) => void;
  triggerClassName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { triggerRef, contentRef, onCloseAutoFocus } = usePropertyMenuFocus(open);
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger ref={triggerRef} asChild>
        <button type="button" className={triggerClassName}>
          <StatusIcon status={task.status} />
          {STATUS_LABELS[task.status]}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent ref={contentRef} onCloseAutoFocus={onCloseAutoFocus} align="start">
        {TASK_STATUSES.map((status) => (
          <DropdownMenuItem key={status} onSelect={() => onUpdate({ status })}>
            <StatusIcon status={status} />
            {STATUS_LABELS[status]}
            {status === task.status ? <Icon name="Check" className="ml-auto size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PriorityMenu({
  task,
  onUpdate,
  triggerClassName,
  open,
  onOpenChange,
}: {
  task: Task;
  onUpdate: (update: TaskPropertyUpdate) => void;
  triggerClassName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { triggerRef, contentRef, onCloseAutoFocus } = usePropertyMenuFocus(open);
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger ref={triggerRef} asChild>
        <button type="button" className={triggerClassName}>
          <PriorityIcon priority={task.priority} />
          {PRIORITY_LABELS[task.priority]}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent ref={contentRef} onCloseAutoFocus={onCloseAutoFocus} align="start">
        {TASK_PRIORITIES.map((priority) => (
          <DropdownMenuItem key={priority} onSelect={() => onUpdate({ priority })}>
            <PriorityIcon priority={priority} />
            {PRIORITY_LABELS[priority]}
            {priority === task.priority ? <Icon name="Check" className="ml-auto size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DueDateMenu({
  task,
  onUpdate,
  triggerClassName,
  open,
  onOpenChange,
}: {
  task: Task;
  onUpdate: (update: TaskPropertyUpdate) => void;
  triggerClassName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { triggerRef, contentRef, onOpenAutoFocus, onCloseAutoFocus } = usePropertyMenuFocus(open);
  const pick = (dueDate: string | null) => {
    onUpdate({ dueDate });
    onOpenChange(false);
  };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger ref={triggerRef} asChild>
        <button type="button" className={triggerClassName}>
          <Icon name="Clock" className="size-3.5 shrink-0" />
          {task.dueDate ? formatDueDate(task.dueDate) : "Set due date"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        align="start"
        className="w-52 p-2"
      >
        <div className="flex flex-col">
          {DUE_DATE_PRESETS.map(([label, days]) => (
            <button
              key={label}
              type="button"
              className="flex items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => pick(localIsoDate(days))}
            >
              {label}
              <span className="text-xs text-muted-foreground">
                {formatDueDate(localIsoDate(days))}
              </span>
            </button>
          ))}
          <input
            type="date"
            aria-label="Due date"
            className="mt-1 h-7 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
            value={task.dueDate ?? ""}
            onChange={(event) => {
              if (event.target.value) pick(event.target.value);
            }}
          />
          {task.dueDate ? (
            <button
              type="button"
              className="mt-1 flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => pick(null)}
            >
              <Icon name="X" className="size-3.5" />
              Remove due date
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LabelsMenu({
  task,
  labels,
  onUpdate,
  open,
  onOpenChange,
  children,
}: {
  task: Task;
  labels: Label[] | undefined;
  onUpdate: (update: TaskPropertyUpdate) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const { triggerRef, contentRef, onOpenAutoFocus, onCloseAutoFocus } = usePropertyMenuFocus(open);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger ref={triggerRef} asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        className="w-56 p-0"
        align="start"
      >
        <LabelsPicker task={task} labels={labels} onChange={(labelIds) => onUpdate({ labelIds })} />
      </PopoverContent>
    </Popover>
  );
}

function DispatchTargetMenu({
  project,
  bbProjects,
  onError,
  triggerClassName,
  open,
  onOpenChange,
}: {
  project: Project;
  bbProjects: readonly BbProjectOption[];
  onError: (message: string) => void;
  triggerClassName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rpc = useTasksRpc();
  const { triggerRef, contentRef, onOpenAutoFocus, onCloseAutoFocus } = usePropertyMenuFocus(open);
  const [selection, setSelection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const linkedBbProjectId = project.linkedBbProjectId;
  const linkedName = bbProjects.find((candidate) => candidate.id === linkedBbProjectId)?.name;
  useEffect(() => {
    if (open) setSelection(linkedBbProjectId);
  }, [open, linkedBbProjectId]);

  const save = async (linkedId: string | null) => {
    if (saving) return;
    setSaving(true);
    try {
      await rpc.call("updateProject", {
        projectId: project.id,
        linkedBbProjectId: linkedId,
      });
      onOpenChange(false);
    } catch (saveError) {
      onError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger ref={triggerRef} asChild>
        <button type="button" aria-label="Edit dispatch target" className={triggerClassName}>
          <Icon name="ArrowUpRight" className="size-3.5 shrink-0" />
          {linkedBbProjectId !== null ? (
            <span className="truncate" title={linkedBbProjectId}>
              {linkedName ?? linkedBbProjectId}
            </span>
          ) : (
            <span className="truncate text-muted-foreground">Link a bb project…</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        align="start"
        className="w-64 p-3"
      >
        <div className="mb-1 text-xs font-medium">Tracker project: {project.name}</div>
        <p className="mb-2.5 text-xs text-muted-foreground">
          This link applies to all tasks in {project.name}.
        </p>
        <BbProjectLinkPicker
          value={selection}
          onChange={setSelection}
          bbProjects={bbProjects}
          noneLabel={linkedBbProjectId !== null ? "Unlink" : "Not linked"}
        />
        <div className="mt-2.5 flex items-center justify-between gap-2">
          {linkedBbProjectId !== null ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-muted-foreground"
              disabled={saving}
              onClick={() => void save(null)}
            >
              <Icon name="X" className="size-3.5" />
              Unlink
            </Button>
          ) : (
            <span />
          )}
          <Button size="sm" className="h-7" disabled={saving} onClick={() => void save(selection)}>
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const RAIL_ROW_CLASS =
  "-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-state-hover";

export function PropertiesRail({
  task,
  project,
  bbProjects,
  labels,
  threads,
  presets,
  onUpdate,
  onError,
  className,
  ...control
}: TaskPropertiesProps &
  MenuControl & {
    presets: Preset[] | undefined;
    onError: (message: string) => void;
    className?: string;
  }) {
  const taskLabels = (labels ?? []).filter((label) => task.labelIds.includes(label.id));
  const active = threads.filter(isActiveThread);
  return (
    <aside data-properties-layout="rail" className={cn("w-56 shrink-0 py-10 pl-2 pr-6", className)}>
      <h2 className="mb-1.5 text-xs font-semibold text-muted-foreground">Properties</h2>
      <StatusMenu
        task={task}
        onUpdate={onUpdate}
        triggerClassName={RAIL_ROW_CLASS}
        {...menuProps(control, "status")}
      />
      <PriorityMenu
        task={task}
        onUpdate={onUpdate}
        triggerClassName={RAIL_ROW_CLASS}
        {...menuProps(control, "priority")}
      />
      <DueDateMenu
        task={task}
        onUpdate={onUpdate}
        triggerClassName={RAIL_ROW_CLASS}
        {...menuProps(control, "dueDate")}
      />

      <CreatorThreadProperty task={task} />
      <div className="mb-1 mt-3 text-2xs font-semibold text-muted-foreground">Labels</div>
      <div className="flex flex-wrap items-center gap-1 py-0.5">
        {taskLabels.map((label) => (
          <LabelChip key={label.id} label={label} />
        ))}
        <LabelsMenu
          task={task}
          labels={labels}
          onUpdate={onUpdate}
          {...menuProps(control, "labels")}
        >
          <button
            type="button"
            aria-label="Edit labels"
            className="inline-flex items-center rounded-md border border-dashed border-border px-1.5 py-0.5 text-muted-foreground hover:border-input hover:text-foreground"
          >
            <Icon name="Plus" className="size-3" />
          </button>
        </LabelsMenu>
      </div>

      <div className="mb-1 mt-3 text-2xs font-semibold text-muted-foreground">Project</div>
      <div className="flex items-center gap-2 py-0.5 text-sm">
        <span
          aria-hidden
          className="size-3 shrink-0 rounded-sm"
          style={{ backgroundColor: project?.color }}
        />
        <span className="truncate">{project?.name ?? "…"}</span>
      </div>

      <div className="mb-1 mt-3 text-2xs font-semibold text-muted-foreground">Dispatch target</div>
      {project !== undefined ? (
        <DispatchTargetMenu
          project={project}
          bbProjects={bbProjects}
          onError={onError}
          triggerClassName={RAIL_ROW_CLASS}
          {...menuProps(control, "linkedProject")}
        />
      ) : (
        <div className="py-0.5 text-sm text-muted-foreground">…</div>
      )}

      <div className="mt-2.5 py-0.5">
        <DispatchControl
          task={task}
          presets={presets}
          onError={onError}
          align="start"
          className="w-full"
          {...menuProps(control, "dispatch")}
        />
      </div>

      <div className="mb-1 mt-3 text-2xs font-semibold text-muted-foreground">Agents</div>
      <div className="flex flex-col gap-1 py-0.5 text-xs">
        {active.length > 0 ? (
          active.map((thread) => (
            <span key={thread.id} className="flex items-center gap-1.5 font-medium text-success">
              <span
                aria-hidden
                className="size-1.5 shrink-0 animate-pulse rounded-full bg-success"
              />
              <span className="truncate">
                {thread.presetName} {thread.liveStatus === "starting" ? "starting" : "working"}
              </span>
            </span>
          ))
        ) : (
          <span className="text-muted-foreground">none active</span>
        )}
      </div>
    </aside>
  );
}

const CHIP_CLASS =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-0.5 text-xs text-foreground hover:border-input";

export function InlineProperties({
  task,
  project,
  bbProjects,
  labels,
  presets,
  onUpdate,
  onError,
  className,
  ...control
}: Omit<TaskPropertiesProps, "threads"> &
  MenuControl & {
    presets: Preset[] | undefined;
    onError: (message: string) => void;
    className?: string;
  }) {
  const taskLabels = (labels ?? []).filter((label) => task.labelIds.includes(label.id));
  return (
    <div
      data-properties-layout="inline"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      <StatusMenu
        task={task}
        onUpdate={onUpdate}
        triggerClassName={CHIP_CLASS}
        {...menuProps(control, "status")}
      />
      <PriorityMenu
        task={task}
        onUpdate={onUpdate}
        triggerClassName={CHIP_CLASS}
        {...menuProps(control, "priority")}
      />
      <DueDateMenu
        task={task}
        onUpdate={onUpdate}
        triggerClassName={CHIP_CLASS}
        {...menuProps(control, "dueDate")}
      />
      <CreatorThreadProperty task={task} />
      {taskLabels.map((label) => (
        <LabelChip key={label.id} label={label} />
      ))}
      <LabelsMenu task={task} labels={labels} onUpdate={onUpdate} {...menuProps(control, "labels")}>
        <button
          type="button"
          aria-label="Edit labels"
          className="inline-flex items-center rounded-md border border-dashed border-border px-2 py-1 text-muted-foreground hover:border-input hover:text-foreground"
        >
          <Icon name="Plus" className="size-3" />
        </button>
      </LabelsMenu>
      {project !== undefined ? (
        <DispatchTargetMenu
          project={project}
          bbProjects={bbProjects}
          onError={onError}
          triggerClassName={cn(CHIP_CLASS, "max-w-56")}
          {...menuProps(control, "linkedProject")}
        />
      ) : null}
      <DispatchControl
        task={task}
        presets={presets}
        onError={onError}
        className="ml-auto max-w-56"
        {...menuProps(control, "dispatch")}
      />
    </div>
  );
}
