import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { useProjects } from "./data.js";
import {
  useTasksNavigation,
  type ResolvedTasksRoute,
  type TasksNavigation,
  type TasksRoute,
} from "./routes.js";
import { storeViewMode } from "./view-preference.js";
import { BrowseEntryState, useBrowseRoute } from "./browse-entry.js";
import { TasksTopbar } from "./topbar.js";
import { ListView } from "../views/list/index.js";
import { BrowseWorkspace } from "./browse-workspace.js";
import { BoardView } from "../views/board/index.js";
import { DetailView } from "../views/detail/index.js";
import {
  TasksSessionProvider,
  useSafeTaskTarget,
} from "../views/detail/task-session.js";
import { NewTaskDialog } from "../views/manage/new-task-dialog.js";
import { NewProjectDialog } from "../views/manage/new-project-dialog.js";
import { ManagePanel } from "../views/manage/manage-panel.js";
import { EmptyState } from "../components/empty-state.js";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TasksRefreshProvider } from "./refresh.js";
import { ShortcutProvider, useShortcuts } from "./shortcut-provider.js";
import { ShortcutHelpDialog } from "./shortcut-help-dialog.js";
import {
  useCommandNavigator,
  usePanelIntents,
  type PanelIntent,
} from "./command-bridge.js";

const BOARD_MIN_WIDTH = 448;

// Scope identity resets list-local query snapshots and controls together. Do
// not key this outlet by a future selected ticket: selection must retain the list.
function RouteOutlet({
  route,
  splitUsable,
  boardUsable,
}: {
  route: ResolvedTasksRoute;
  splitUsable: boolean;
  boardUsable: boolean;
}) {
  switch (route.kind) {
    case "entry":
      return null;
    case "all":
    case "active":
      return (
        <BrowseWorkspace key={route.kind} route={route} split={splitUsable} />
      );
    case "manage":
      return <ManagePanel />;
    case "task":
      return <DetailView taskKey={route.taskKey} />;
    case "project":
      return route.view === "board" && boardUsable ? (
        <BoardView projectId={route.projectId} />
      ) : route.view === "board" ? (
        <ListView key={route.projectId} projectId={route.projectId} />
      ) : (
        <BrowseWorkspace
          key={route.projectId}
          route={route}
          split={splitUsable}
        />
      );
  }
}

function TasksAppShellContent({
  subPath: requestedSubPath,
}: PluginNavPanelProps) {
  const subPath = useSafeTaskTarget(requestedSubPath);
  const tasksNavigation = useTasksNavigation();
  const projects = useProjects();
  // Remember scope only from the accepted route, never a pending save target.
  const route = useBrowseRoute(subPath, projects, tasksNavigation);
  const navigation = useMemo<TasksNavigation>(
    () => ({
      go: (target, options) => {
        if (target.kind === "project" && target.view !== null) {
          storeViewMode(target.projectId, target.view);
        }
        tasksNavigation.go(target, options);
      },
    }),
    [tasksNavigation],
  );
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  const mainRef = useRef<HTMLElement>(null);
  const [boardUsable, setBoardUsable] = useState(true);
  const [splitUsable, setSplitUsable] = useState(false);
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const update = () => {
      const mainWidth = main.clientWidth;
      setBoardUsable(!(mainWidth > 0 && mainWidth < BOARD_MIN_WIDTH));
      setSplitUsable(mainWidth >= 880);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(main);
    return () => observer.disconnect();
  }, []);

  const lastBrowseRouteRef = useRef<TasksRoute | null>(null);
  useEffect(() => {
    if (route.kind !== "task" && route.kind !== "entry") {
      lastBrowseRouteRef.current = route;
    }
  }, [route]);
  const backFromTask = () =>
    navigation.go(lastBrowseRouteRef.current ?? { kind: "all" });
  const noProjects = projects.data !== undefined && projects.data.length === 0;
  const newTaskProjectId = route.kind === "project" ? route.projectId : null;

  const [helpOpen, setHelpOpen] = useState(false);
  useCommandNavigator();
  usePanelIntents(
    useCallback((intent: PanelIntent) => {
      if (intent === "new-task") setNewTaskOpen(true);
      else setHelpOpen(true);
    }, []),
  );
  useShortcuts({
    "panel.newTask": () => setNewTaskOpen(true),
    "panel.help": () => setHelpOpen(true),
    "panel.toggleView":
      route.kind === "project" && boardUsable
        ? () =>
            navigation.go({
              ...route,
              view: route.view === "board" ? "list" : "board",
            })
        : null,
    "detail.back": route.kind === "task" ? backFromTask : null,
  });

  return (
    <div className="relative flex h-full min-h-0 bg-background text-foreground">
      <main ref={mainRef} className="@container flex min-w-0 flex-1 flex-col">
        <TasksTopbar
          route={route}
          projects={projects}
          pagerScope={
            lastBrowseRouteRef.current === null
              ? null
              : {
                  projectId:
                    lastBrowseRouteRef.current.kind === "project"
                      ? lastBrowseRouteRef.current.projectId
                      : null,
                }
          }
          onNavigate={navigation.go}
          onNewTask={() => setNewTaskOpen(true)}
          onNewProject={() => setNewProjectOpen(true)}
          onBack={backFromTask}
        />
        <div className="min-h-0 flex-1 overflow-auto">
          {route.kind === "entry" ? (
            <BrowseEntryState projects={projects} />
          ) : noProjects && route.kind !== "task" && route.kind !== "manage" ? (
            <EmptyState
              icon="ListTodo"
              title="No projects yet"
              description="Create a project to start tracking tasks and dispatching work to agents."
              action={
                <Button size="sm" onClick={() => setNewProjectOpen(true)}>
                  <Icon name="Plus" className="size-3.5" />
                  New project
                </Button>
              }
            />
          ) : (
            <RouteOutlet
              route={route}
              boardUsable={boardUsable}
              splitUsable={splitUsable}
            />
          )}
        </div>
      </main>
      {newTaskOpen ? (
        <NewTaskDialog
          open
          onOpenChange={setNewTaskOpen}
          projectId={newTaskProjectId}
        />
      ) : null}
      {newProjectOpen ? (
        <NewProjectDialog open onOpenChange={setNewProjectOpen} />
      ) : null}
      <ShortcutHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

export function TasksAppShell(props: PluginNavPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <TasksRefreshProvider>
      <ShortcutProvider rootRef={rootRef}>
        <div ref={rootRef} className="contents">
          <TasksSessionProvider>
            <TasksAppShellContent {...props} />
          </TasksSessionProvider>
        </div>
      </ShortcutProvider>
    </TasksRefreshProvider>
  );
}
