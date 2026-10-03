import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Button } from "../components/ui/button.js";
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from "../components/ui/command.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../components/ui/dialog.js";
import { useCommandState } from "cmdk";
import type { Project } from "../shared/contract.js";
import { useFolders, type useProjects } from "./data.js";
import { folderPath } from "./folder-path.js";

type Inventory = ReturnType<typeof useProjects>;
interface ProjectSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inventory: Inventory;
  currentProjectId: string | null;
  focusReturnRef: RefObject<HTMLElement | null>;
  onSelect: (projectId: string) => void;
}

export function ProjectSwitcher({
  open,
  onOpenChange,
  focusReturnRef,
  ...props
}: ProjectSwitcherProps) {
  const selectedRef = useRef(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      selectedRef.current = false;
      const active = document.activeElement;
      previousFocusRef.current =
        active instanceof HTMLElement &&
        focusReturnRef.current?.contains(active)
          ? active
          : null;
    }
    wasOpenRef.current = open;
  }, [open, focusReturnRef]);
  const restoreFocus = useCallback(() => {
    if (selectedRef.current) return;
    const previous = previousFocusRef.current;
    const target =
      previous?.isConnected &&
      !previous.closest('[hidden], [inert], [aria-hidden="true"]')
        ? previous
        : focusReturnRef.current;
    target?.focus({ preventScroll: true });
  }, [focusReturnRef]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="max-h-[85dvh] gap-0 overflow-hidden p-0"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onAfterCloseAutoFocus={restoreFocus}
      >
        {open ? (
          <ProjectChoices
            {...props}
            onClose={() => onOpenChange(false)}
            onSelect={(id) => {
              selectedRef.current = true;
              props.onSelect(id);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ProjectChoices({
  inventory,
  currentProjectId,
  onSelect,
  onClose,
}: Omit<ProjectSwitcherProps, "open" | "onOpenChange" | "focusReturnRef"> & {
  onClose: () => void;
}) {
  const folders = useFolders();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const focusInput = useCallback((input: HTMLInputElement | null) => {
    inputRef.current = input;
    input?.focus({ preventScroll: true });
  }, []);
  const available =
    !inventory.isLoading &&
    inventory.error === null &&
    inventory.data !== undefined;
  const search = query.trim().toLocaleLowerCase();
  const matches = (inventory.data ?? []).filter(
    (project) =>
      project.name.toLocaleLowerCase().includes(search) ||
      project.prefix.toLocaleLowerCase().includes(search),
  );

  // The desktop modal and compact drawer realize content at different times.
  // Focus when the input mounts, then after the host palette restores its focus.
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(() =>
      inputRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  const select = (id: string) => {
    if (available && matches.some((project) => project.id === id)) onSelect(id);
  };
  const status = inventory.isLoading
    ? "Loading projects"
    : inventory.error !== null
      ? inventory.error
      : inventory.data === undefined
        ? "Loading projects"
        : inventory.data.length === 0
          ? "No projects yet"
          : matches.length === 0
            ? "No matching projects"
            : null;

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <DialogTitle>Switch project</DialogTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <DialogDescription className="sr-only">
        Search Tasks projects by name or prefix. Use Ctrl+N and Ctrl+P or arrow
        keys, then Enter to select.
      </DialogDescription>
      <Command
        label="Search projects"
        shouldFilter={false}
        loop={false}
        vimBindings
        className="min-h-0 bg-background"
        key={available ? "ready" : "waiting"}
        onKeyDownCapture={(event) => {
          const plainCtrl =
            event.ctrlKey &&
            !event.altKey &&
            !event.metaKey &&
            !event.shiftKey &&
            (event.key === "n" || event.key === "p");
          // cmdk otherwise also claims modified arrows and Ctrl+J/K.
          // Stop its handler without cancelling the browser's unrelated key.
          const commandKey =
            ["ArrowDown", "ArrowUp", "Home", "End", "Enter"].includes(
              event.key,
            ) ||
            (event.ctrlKey && ["n", "p", "j", "k"].includes(event.key));
          if (
            event.nativeEvent.isComposing ||
            event.keyCode === 229 ||
            (commandKey &&
              (event.ctrlKey ||
                event.altKey ||
                event.metaKey ||
                event.shiftKey) &&
              !plainCtrl)
          ) {
            event.stopPropagation();
          }
        }}
      >
        <CommandInput
          ref={focusInput}
          aria-label="Search projects"
          placeholder="Search by name or prefix..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="max-h-[min(300px,50dvh)] p-1" label="Projects">
          {status !== null ? (
            <div
              role="status"
              className="px-3 py-5 text-sm text-muted-foreground"
            >
              {status}
            </div>
          ) : null}
          {matches.map((project) => {
            const folder = folders.data?.find(
              (item) => item.id === project.folderId,
            );
            const path = folder ? folderPath(folder, folders.data ?? []) : null;
            return (
              <CommandItem
                key={project.id}
                value={project.id}
                disabled={!available}
                onSelect={select}
                className="min-h-11 gap-3 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="break-words font-medium">{project.name}</div>
                  {path ? (
                    <div className="break-words text-xs text-muted-foreground">
                      {path}
                    </div>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {project.prefix}
                </span>
                {project.id === currentProjectId ? (
                  <span className="shrink-0 text-xs">Current</span>
                ) : null}
              </CommandItem>
            );
          })}
        </CommandList>
        <SelectionAnnouncement projects={available ? matches : []} />
      </Command>
      {inventory.error !== null && !inventory.isLoading ? (
        <div className="border-t px-4 py-2">
          <Button variant="outline" size="sm" onClick={inventory.refresh}>
            Retry projects
          </Button>
        </div>
      ) : null}
    </>
  );
}

function SelectionAnnouncement({ projects }: { projects: Project[] }) {
  const selectedId = useCommandState((state) => state.value);
  const project = projects.find((item) => item.id === selectedId);
  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {project ? `Selected ${project.name}, ${project.prefix}` : ""}
    </span>
  );
}
