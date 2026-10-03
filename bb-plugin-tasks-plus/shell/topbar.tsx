import { useCallback, useMemo } from "react";
import type { Task } from "../shared/contract.js";
import { groupTasksByStatus } from "../views/list/lib.js";
import { listAllTasks, useTasksQuery, type useProjects } from "./data.js";
import type { ResolvedTasksRoute, TaskViewMode, TasksRoute } from "./routes.js";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTasksRefresh } from "./refresh.js";
import { useShortcuts } from "./shortcut-provider.js";
import { ProjectPicker, TasksNavigationMenu } from "./browse-navigation.js";

const REFRESH_TASKS_LABEL = "Refresh tasks";

interface PagerPosition {
  index: number;
  total: number;
  prevKey: string | null;
  nextKey: string | null;
}

export function pagerPosition(
  tasks: readonly Task[],
  taskKey: string,
): PagerPosition | null {
  const ordered = groupTasksByStatus(tasks).flatMap((group) => group.tasks);
  const wanted = taskKey.toUpperCase();
  const index = ordered.findIndex((task) => task.key.toUpperCase() === wanted);
  if (index === -1) return null;
  return {
    index: index + 1,
    total: ordered.length,
    prevKey: ordered[index - 1]?.key ?? null,
    nextKey: ordered[index + 1]?.key ?? null,
  };
}

function TaskPager({
  taskKey,
  projectId,
  onNavigate,
}: {
  taskKey: string;
  projectId: string | null;
  onNavigate: (route: TasksRoute) => void;
}) {
  const siblings = useTasksQuery(
    async (rpc) =>
      listAllTasks(rpc, {
        ...(projectId === null ? {} : { projectId }),
        parentTaskId: null,
      }),
    ["tasks:changed"],
    [projectId],
  );
  const position = useMemo(
    () => (siblings.data ? pagerPosition(siblings.data, taskKey) : null),
    [siblings.data, taskKey],
  );
  const stepTo = (key: string | null | undefined) =>
    key == null ? null : () => onNavigate({ kind: "task", taskKey: key });
  useShortcuts({
    "detail.previous": stepTo(position?.prevKey),
    "detail.next": stepTo(position?.nextKey),
  });
  if (!position) return null;
  const step = (key: string | null) => {
    if (key !== null) onNavigate({ kind: "task", taskKey: key });
  };
  return (
    <div className="hidden shrink-0 items-center gap-0.5 text-xs tabular-nums text-muted-foreground @sm:flex">
      <span className="hidden px-1 @md:inline">
        {position.index} / {position.total}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 max-md:pointer-coarse:size-9"
        aria-label="Previous task"
        disabled={position.prevKey === null}
        onClick={() => step(position.prevKey)}
      >
        <Icon name="ChevronUp" className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 max-md:pointer-coarse:size-9"
        aria-label="Next task"
        disabled={position.nextKey === null}
        onClick={() => step(position.nextKey)}
      >
        <Icon name="ChevronDown" className="size-3.5" />
      </Button>
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: TaskViewMode;
  onChange: (view: TaskViewMode) => void;
}) {
  const segment = (mode: TaskViewMode, label: string) => (
    <button
      type="button"
      onClick={() => onChange(mode)}
      aria-pressed={view === mode}
      className={cn(
        "min-h-8 rounded-sm px-3 text-xs",
        view === mode
          ? "bg-background text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center rounded-md bg-muted p-0.5">
      {segment("list", "List")}
      {segment("board", "Board")}
    </div>
  );
}

function RefreshTasksButton() {
  const { refresh, isRefreshing } = useTasksRefresh();

  const handleRefresh = useCallback(() => {
    if (isRefreshing) return;
    refresh();
  }, [isRefreshing, refresh]);

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip disableHoverableContent>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 text-muted-foreground hover:text-foreground active:bg-state-active active:text-foreground"
            aria-label={REFRESH_TASKS_LABEL}
            aria-busy={isRefreshing}
            disabled={isRefreshing}
            onClick={handleRefresh}
          >
            <Icon
              name="RotateCcw"
              className={cn("size-3.5", isRefreshing && "animate-spin")}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{REFRESH_TASKS_LABEL}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface TasksTopbarProps {
  route: ResolvedTasksRoute;
  projects: ReturnType<typeof useProjects>;
  pagerScope: { projectId: string | null } | null;
  onNavigate: (route: TasksRoute) => void;
  onNewTask: () => void;
  onNewProject: () => void;
  onBack: () => void;
}

export function TasksTopbar({
  route,
  projects: projectInventory,
  pagerScope,
  onNavigate,
  onNewTask,
  onNewProject,
  onBack,
}: TasksTopbarProps) {
  const projects = projectInventory.data;
  const project = useMemo(() => {
    if (route.kind === "project") {
      return (projects ?? []).find((p) => p.id === route.projectId) ?? null;
    }
    if (route.kind === "task") {
      const prefix = route.taskKey.split("-", 1)[0] ?? "";
      return (projects ?? []).find((p) => p.prefix === prefix) ?? null;
    }
    return null;
  }, [route, projects]);

  const breadcrumb = (() => {
    switch (route.kind) {
      case "entry":
        return <span className="font-semibold">Tasks</span>;
      case "project":
      case "all":
      case "active":
        return (
          <div className="flex min-w-0 items-center gap-2">
            {route.kind === "active" ? (
              <span className="shrink-0 font-semibold">Active</span>
            ) : null}
            <div className="min-w-0">
              <ProjectPicker
                route={route}
                projects={projectInventory}
                onNavigate={onNavigate}
                onNewProject={onNewProject}
              />
            </div>
          </div>
        );
      case "manage":
        return (
          <span className="flex items-center gap-2">
            <span className="whitespace-nowrap font-semibold">Manage</span>
            <span className="hidden text-xs font-normal text-muted-foreground @md:inline">
              labels, presets, folders
            </span>
          </span>
        );
      case "task":
        return (
          <span className="flex min-w-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 max-md:pointer-coarse:size-9"
              aria-label="Back (Esc)"
              onClick={onBack}
            >
              <Icon name="ChevronLeft" className="size-4" />
            </Button>
            {project ? (
              <button
                type="button"
                className="hidden min-w-0 items-center gap-2 text-muted-foreground hover:text-foreground @md:flex"
                onClick={() =>
                  onNavigate({
                    kind: "project",
                    projectId: project.id,
                    view: null,
                  })
                }
              >
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: project.color }}
                />
                <span className="truncate font-medium">{project.name}</span>
              </button>
            ) : null}
            {project ? (
              <Icon
                name="ChevronRight"
                className="hidden size-3 shrink-0 text-muted-foreground @md:block"
              />
            ) : null}
            <span className="min-w-0 truncate font-medium text-muted-foreground">
              {route.taskKey}
            </span>
          </span>
        );
    }
  })();

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border-hairline bg-background px-3.5 text-sm max-md:h-12 max-md:pl-12 max-md:pointer-coarse:pl-14">
      <div className="min-w-0 flex-1 overflow-hidden">{breadcrumb}</div>
      {route.kind === "task" &&
      (pagerScope !== null || projects !== undefined) ? (
        <TaskPager
          taskKey={route.taskKey}
          projectId={
            pagerScope !== null ? pagerScope.projectId : (project?.id ?? null)
          }
          onNavigate={onNavigate}
        />
      ) : null}
      {route.kind === "project" ? (
        <span className="hidden @md:block">
          <ViewToggle
            view={route.view}
            onChange={(view) => onNavigate({ ...route, view })}
          />
        </span>
      ) : null}
      <RefreshTasksButton />
      {projects?.length !== 0 &&
      route.kind !== "entry" &&
      route.kind !== "task" &&
      route.kind !== "manage" ? (
        <Button
          size="sm"
          className="h-9 shrink-0 gap-2"
          aria-label="New task"
          onClick={onNewTask}
        >
          <Icon name="Plus" className="size-3.5" />
          <span className="hidden @lg:inline">New task</span>
        </Button>
      ) : null}
      <TasksNavigationMenu
        route={route}
        onNavigate={onNavigate}
        onNewProject={onNewProject}
      />
    </header>
  );
}
