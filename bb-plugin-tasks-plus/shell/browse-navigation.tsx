import type { Folder, Project } from "../shared/contract.js";
import { useFolders, type useProjects } from "./data.js";
import type { ResolvedTasksRoute, TasksRoute } from "./routes.js";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavigationActions {
  onNavigate: (route: TasksRoute) => void;
  onNewProject: () => void;
}

// Full paths keep nested folders legible without hover-only submenus. Projects
// with a missing folder stay reachable in the ungrouped section.
function folderPath(folder: Folder, folders: Folder[]): string {
  const names = [folder.name];
  const seen = new Set([folder.id]);
  let parentId = folder.parentFolderId;
  while (parentId !== null && !seen.has(parentId)) {
    const parent = folders.find((candidate) => candidate.id === parentId);
    if (!parent) break;
    seen.add(parent.id);
    names.unshift(parent.name);
    parentId = parent.parentFolderId;
  }
  return names.join(" / ");
}

export function ProjectPicker({
  route,
  projects: inventory,
  onNavigate,
  onNewProject,
}: NavigationActions & {
  route: ResolvedTasksRoute;
  projects: ReturnType<typeof useProjects>;
}) {
  const folders = useFolders();
  const projects = inventory.data;
  const projectId = route.kind === "project" ? route.projectId : null;
  const project = projects?.find((candidate) => candidate.id === projectId);
  const label =
    projectId === null ? "All projects" : (project?.name ?? "Project");
  const folderList = folders.data ?? [];
  const knownFolderIds = new Set(folderList.map((folder) => folder.id));
  const ungrouped = (projects ?? []).filter(
    (candidate) =>
      candidate.folderId === null || !knownFolderIds.has(candidate.folderId),
  );
  const choices = (items: Project[]) =>
    items.map((item) => (
      <DropdownMenuRadioItem
        key={item.id}
        value={item.id}
        className="min-h-9 gap-2"
        textValue={item.name}
      >
        <span
          aria-hidden
          className="size-3 shrink-0 rounded-sm"
          style={{ backgroundColor: item.color }}
        />
        <span className="min-w-0 truncate" title={item.name}>
          {item.name}
        </span>
      </DropdownMenuRadioItem>
    ));

  if (projects?.length === 0 && inventory.error === null) {
    return (
      <Button
        variant="ghost"
        className="h-9 min-w-0 gap-2 px-3"
        onClick={onNewProject}
      >
        <Icon name="Plus" className="size-4 shrink-0" />
        <span className="truncate">New project</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 max-w-full gap-2 px-3"
          aria-label={`Project: ${label}`}
        >
          {project ? (
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-sm"
              style={{ backgroundColor: project.color }}
            />
          ) : null}
          <span className="min-w-0 truncate font-semibold" title={label}>
            {label}
          </span>
          <Icon
            name="ChevronDown"
            className="size-4 shrink-0 text-muted-foreground"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        mobileTitle="Choose project"
        className="max-h-[min(28rem,var(--radix-dropdown-menu-content-available-height,28rem))] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto"
      >
        <DropdownMenuRadioGroup
          value={projectId ?? "all"}
          onValueChange={(value) =>
            onNavigate(
              value === "all"
                ? { kind: "all" }
                : { kind: "project", projectId: value, view: null },
            )
          }
        >
          <DropdownMenuRadioItem value="all" className="min-h-9">
            All projects
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {choices(ungrouped)}
          {folderList.map((folder) => {
            const items = (projects ?? []).filter(
              (candidate) => candidate.folderId === folder.id,
            );
            if (items.length === 0) return null;
            const path = folderPath(folder, folderList);
            return (
              <DropdownMenuGroup key={folder.id} aria-label={path}>
                <DropdownMenuLabel
                  className="truncate text-xs text-muted-foreground"
                  title={path}
                >
                  {path}
                </DropdownMenuLabel>
                {choices(items)}
              </DropdownMenuGroup>
            );
          })}
          {inventory.error !== null ? (
            <DropdownMenuItem className="min-h-9" onSelect={inventory.refresh}>
              Retry projects
            </DropdownMenuItem>
          ) : projects === undefined ? (
            <DropdownMenuItem disabled>Loading projects…</DropdownMenuItem>
          ) : null}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-9" onSelect={onNewProject}>
          <Icon name="Plus" />
          New project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TasksNavigationMenu({
  route,
  onNavigate,
  onNewProject,
}: NavigationActions & { route: ResolvedTasksRoute }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 text-muted-foreground"
          aria-label="Tasks navigation"
        >
          <Icon name="MoreHorizontal" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        mobileTitle="Tasks navigation"
        className="w-56"
      >
        <DropdownMenuItem
          className="min-h-9"
          onSelect={() => onNavigate({ kind: "all" })}
        >
          <Icon name="ListView" />
          All projects
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-9"
          onSelect={() => onNavigate({ kind: "active" })}
        >
          <Icon name="Zap" />
          Active
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-9"
          onSelect={() => onNavigate({ kind: "manage" })}
        >
          <Icon name="Settings" />
          Manage
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-9" onSelect={onNewProject}>
          <Icon name="Plus" />
          New project
        </DropdownMenuItem>
        {route.kind === "project" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={route.view}
              onValueChange={(view) => {
                if (view === "list" || view === "board")
                  onNavigate({ ...route, view });
              }}
            >
              <DropdownMenuRadioItem value="list" className="min-h-9">
                List
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="board" className="min-h-9">
                Board
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
