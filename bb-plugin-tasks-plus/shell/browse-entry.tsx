import { useEffect, useMemo, useRef } from "react";
import { browsePreference } from "./browse-preference.js";
import {
  parseTasksRoute,
  type ResolvedTasksRoute,
  type TasksNavigation,
  type TasksRoute,
} from "./routes.js";
import { loadViewMode } from "./view-preference.js";
import type { useProjects } from "./data.js";
import { EmptyState } from "../components/empty-state.js";
import { Button } from "@/components/ui/button";

type ProjectInventory = ReturnType<typeof useProjects>;

function resolveView(route: TasksRoute): ResolvedTasksRoute {
  return route.kind === "project"
    ? { ...route, view: route.view ?? loadViewMode(route.projectId) }
    : route;
}

/** Observe committed destinations, not navigation requests: edit-safety owners
 * may still reject a requested transition. Only undirected entry replaces history. */
export function useBrowseRoute(
  subPath: string,
  projects: ProjectInventory,
  navigation: TasksNavigation,
): ResolvedTasksRoute {
  const preference = browsePreference();
  const requested = useMemo(() => parseTasksRoute(subPath), [subPath]);
  const explicitRoute = useMemo(() => resolveView(requested), [requested]);
  const route = useMemo(() => {
    if (requested.kind !== "entry") return explicitRoute;
    if (
      projects.isLoading ||
      projects.error !== null ||
      projects.data === undefined
    )
      return requested;
    const scope = preference.load();
    return resolveView(
      scope?.kind === "project" &&
        projects.data.some((project) => project.id === scope.projectId)
        ? { ...scope, view: null }
        : { kind: "all" },
    );
  }, [
    requested,
    explicitRoute,
    projects.isLoading,
    projects.error,
    projects.data,
    preference,
  ]);
  const replacedEntry = useRef(false);
  useEffect(() => {
    if (requested.kind !== "entry") replacedEntry.current = false;
    if (route.kind === "entry") return;
    if (requested.kind === "entry" && replacedEntry.current) return;
    if (route.kind === "all") preference.store({ kind: "all" });
    if (route.kind === "project")
      preference.store({ kind: "project", projectId: route.projectId });
    if (requested.kind === "entry") {
      replacedEntry.current = true;
      navigation.go(route, { replace: true });
    }
  }, [requested, route, preference, navigation]);
  return route;
}

export function BrowseEntryState({ projects }: { projects: ProjectInventory }) {
  if (projects.isLoading || projects.error === null) {
    return (
      <div role="status" className="p-6 text-sm text-muted-foreground">
        Loading projects…
      </div>
    );
  }
  return (
    <div role="alert" className="h-full">
      <EmptyState
        icon="ListTodo"
        title="Could not load projects"
        description="Your last Tasks project is still remembered. Retry to open it."
        action={
          <Button size="sm" onClick={projects.refresh}>
            Retry
          </Button>
        }
      />
    </div>
  );
}
