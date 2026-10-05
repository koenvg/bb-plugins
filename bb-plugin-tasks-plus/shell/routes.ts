import { createContext, useContext, useMemo } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { useTasksSession } from "../views/detail/task-session.js";

export const PANEL_PATH = "tasks";

export type TaskViewMode = "list" | "board";

export type TasksRoute =
  | { kind: "entry" }
  | { kind: "all"; taskKey?: string }
  | { kind: "active"; taskKey?: string }
  | { kind: "manage" }
  | {
      kind: "project";
      projectId: string;
      view: TaskViewMode | null;
      taskKey?: string;
    }
  | { kind: "task"; taskKey: string };

export type ResolvedTasksRoute =
  | Exclude<TasksRoute, { kind: "project" }>
  | {
      kind: "project";
      projectId: string;
      view: TaskViewMode;
      taskKey?: string;
    };

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function parseTasksRoute(rawSubPath: string): TasksRoute {
  const subPath = rawSubPath.split("/").map(decodeSegment).join("/");
  const queryIndex = subPath.indexOf("?");
  const path = queryIndex === -1 ? subPath : subPath.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : subPath.slice(queryIndex + 1);
  const segments = path.split("/").filter((segment) => segment.length > 0);
  const head = segments[0];
  if (head === undefined) return { kind: "entry" };
  const params = new URLSearchParams(query);
  const taskKey = params.get("task")?.trim().toUpperCase();
  const selection = taskKey ? { taskKey } : {};
  if (head === "all") return { kind: "all", ...selection };
  if (head === "active") return { kind: "active", ...selection };
  if (head === "manage") return { kind: "manage" };
  if (head === "task") {
    const taskKey = segments[1];
    if (taskKey !== undefined) return { kind: "task", taskKey };
    return { kind: "all" };
  }
  const view = new URLSearchParams(query).get("view");
  return {
    kind: "project",
    projectId: head,
    view: view === "board" || view === "list" ? view : null,
    ...(view === "board" ? {} : selection),
  };
}

export function tasksRouteToSubPath(route: TasksRoute): string {
  if (route.kind === "entry") return "";
  if (route.kind === "manage") return "manage";
  if (route.kind === "task") return `task/${route.taskKey}`;
  const query = new URLSearchParams();
  if (route.kind === "project" && route.view !== null) query.set("view", route.view);
  if (route.taskKey && !(route.kind === "project" && route.view === "board")) {
    query.set("task", route.taskKey);
  }
  const path = route.kind === "project" ? route.projectId : route.kind;
  return query.size ? `${path}?${query}` : path;
}

/** Only embedded task links are adapted; every other destination keeps host navigation. */
export const TaskLinkNavigationContext = createContext<((taskKey: string) => void) | null>(null);

export interface TasksNavigation {
  go: (route: TasksRoute, options?: { replace?: boolean }) => void;
}

export function useTasksNavigation(): TasksNavigation {
  const navigate = useBbNavigate();
  const transition = useTasksSession();
  const openTask = useContext(TaskLinkNavigationContext);
  return useMemo(
    () => ({
      go: (route, options) => {
        if (route.kind === "task" && openTask) {
          openTask(route.taskKey);
          return;
        }
        const commit = () =>
          navigate.toPluginPanel(PANEL_PATH, {
            subPath: tasksRouteToSubPath(route),
            ...(options?.replace ? { replace: true } : {}),
          });
        if (transition) void transition.request(commit);
        else commit();
      },
    }),
    [navigate, transition, openTask],
  );
}

export function openTaskInSidePanel(
  navigate: ReturnType<typeof useBbNavigate>,
  taskKey: string,
): void {
  const opened = navigate.openThreadPanel({
    actionId: "task",
    title: taskKey,
    params: { taskKey },
  });
  if (!opened) {
    navigate.toPluginPanel(PANEL_PATH, {
      subPath: tasksRouteToSubPath({ kind: "task", taskKey }),
    });
  }
}
