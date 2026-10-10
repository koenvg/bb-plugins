import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import type { Project } from "../../shared/contract.js";
import { errorMessage } from "../../shared/errors.js";
import { useProjects, useTasksRpc } from "../../shell/data.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import UndoIcon from "@hugeicons/core-free-icons/UndoIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { Icon } from "@/components/ui/icon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ProjectDeleteDialog } from "./project-delete-dialog.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COLOR_PALETTE, ColorSwatchPicker } from "./shared.js";
import "./projects-section.css";

type Inventory = ReturnType<typeof useProjects>;

function isReady(inventory: Inventory) {
  return inventory.data !== undefined && !inventory.isLoading && inventory.error === null;
}

type Mutation = { id: string; kind: "save" | "delete" };

export function ProjectsSection() {
  const inventory = useProjects();
  const rpc = useTasksRpc();
  const currentInventory = useRef(inventory);
  currentInventory.current = inventory;
  const mutationLock = useRef<Mutation | null>(null);
  const [pending, setPending] = useState<Mutation | null>(null);
  const [selected, setSelected] = useState<Project | null>(null);
  const [removed, setRemoved] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState("");
  const trigger = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const ready = isReady(inventory);
  const rows = (inventory.data ?? []).filter((row) => removed[row.id] === undefined);

  useEffect(() => {
    if (!isReady(inventory)) return;
    setRemoved((previous) => {
      const confirmed = Object.entries(previous).filter(
        ([id, revision]) =>
          inventory.revision > revision && !inventory.data?.some((row) => row.id === id),
      );
      if (confirmed.length === 0) return previous;
      const next = { ...previous };
      for (const [id] of confirmed) delete next[id];
      return next;
    });
  }, [inventory]);

  function beginMutation(id: string, kind: Mutation["kind"]) {
    const current = currentInventory.current;
    if (
      mutationLock.current !== null ||
      !isReady(current) ||
      removed[id] !== undefined ||
      !current.data?.some((row) => row.id === id)
    )
      return false;
    const mutation = { id, kind };
    mutationLock.current = mutation;
    setPending(mutation);
    return true;
  }

  function endMutation() {
    mutationLock.current = null;
    setPending(null);
  }

  async function deleteSelected(project: Project) {
    if (!beginMutation(project.id, "delete")) return;
    try {
      const result = await rpc.call("deleteProject", { projectId: project.id, force: true });
      if (!result.ok) throw new Error(result.error.message);
      const revision = currentInventory.current.readRevision();
      setRemoved((previous) => ({
        ...previous,
        [project.id]: revision,
      }));
      setNotice(
        result.deleted
          ? `Deleted ${project.name} (${project.prefix}) and all its tasks.`
          : `${project.name} (${project.prefix}) is already absent.`,
      );
      setSelected(null);
      inventory.refresh();
    } finally {
      endMutation();
    }
  }

  const restoreFocus = useCallback(() => {
    if (trigger.current?.isConnected && !trigger.current.disabled) trigger.current.focus();
    else heading.current?.focus();
  }, []);

  useEffect(() => {
    if (selected === null && trigger.current !== null) queueMicrotask(restoreFocus);
  }, [selected, restoreFocus]);

  return (
    <section className="project-settings-section" aria-label="Project settings">
      <div className="project-table-heading">
        <h3 ref={heading} tabIndex={-1}>
          Projects
        </h3>
        <p>
          Edit a name or colour, then use the check mark to Save. The undo arrow Cancels edits. The
          trash icon opens Delete confirmation. Prefixes stay unchanged.
        </p>
      </div>
      <TooltipProvider>
        <table
          className="project-settings-table"
          aria-label="Projects"
          aria-busy={inventory.isLoading}
        >
          <thead>
            <tr>
              <th scope="col">Prefix</th>
              <th scope="col">Name</th>
              <th scope="col">Colour</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                inventory={inventory}
                mutationLock={mutationLock}
                pendingId={pending?.id ?? null}
                savingId={pending?.kind === "save" ? pending.id : null}
                beginSave={(id) => beginMutation(id, "save")}
                endSave={endMutation}
                onDelete={(saved, button) => {
                  if (mutationLock.current !== null || !isReady(currentInventory.current)) return;
                  trigger.current = button;
                  setNotice("");
                  setSelected(saved);
                }}
              />
            ))}
          </tbody>
        </table>
      </TooltipProvider>
      {selected ? (
        <ProjectDeleteDialog
          project={selected}
          canDelete={ready && rows.some((row) => row.id === selected.id) && pending === null}
          pending={pending?.kind === "delete"}
          isLocked={() => mutationLock.current !== null}
          onDelete={() => deleteSelected(selected)}
          onClose={() => {
            if (mutationLock.current === null) setSelected(null);
          }}
        />
      ) : null}
      <div className="project-table-footer">
        <p>
          Each row has its own draft. Saving here does not change your Tasks view or linked BB
          workspace.
        </p>
        <p aria-live="polite">{notice}</p>
        <div className="project-inventory-status">
          <p role="status">
            {inventory.isLoading
              ? inventory.data === undefined
                ? "Loading projects…"
                : "Refreshing projects…"
              : ""}
          </p>
          {ready && rows.length === 0 ? <p>No projects yet. Create one from New project.</p> : null}
          {inventory.error !== null ? (
            <div className="project-inventory-error">
              <p role="alert">Could not load projects: {inventory.error}</p>
              <Button
                variant="outline"
                disabled={pending !== null || inventory.isLoading}
                onClick={() => {
                  if (mutationLock.current === null) inventory.refresh();
                }}
              >
                Retry
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ProjectRow({
  project,
  inventory,
  mutationLock,
  pendingId,
  savingId,
  onDelete,
  beginSave,
  endSave,
}: {
  project: Project;
  inventory: Inventory;
  mutationLock: RefObject<Mutation | null>;
  pendingId: string | null;
  savingId: string | null;
  onDelete: (project: Project, trigger: HTMLButtonElement) => void;
  beginSave: (id: string) => boolean;
  endSave: () => void;
}) {
  const rpc = useTasksRpc();
  const formId = useId();
  const [saved, setSaved] = useState(project);
  const [draftName, setDraftName] = useState(project.name);
  const [draftColor, setDraftColor] = useState(project.color);
  const [colorOpen, setColorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryErrorSpace = useRef<string | null>(null);
  const observedProject = useRef(project);
  const activeSave = useRef(false);
  const overlappingProject = useRef<Project | null>(null);
  const savedThroughRevision = useRef(-1);
  const locked = pendingId !== null;
  const pending = savingId === project.id;
  const errorSpace = error ?? (pending ? retryErrorSpace.current : null);
  const name = draftName.trim();
  const colorLabel =
    COLOR_PALETTE.find((swatch) => swatch.value === draftColor)?.label ?? draftColor;
  const canSave =
    isReady(inventory) &&
    !locked &&
    name.length > 0 &&
    (name !== saved.name || draftColor !== saved.color);

  useEffect(() => {
    if (!isReady(inventory) || observedProject.current === project) return;
    observedProject.current = project;
    // Only reads that started after this save response may replace its baseline.
    // A later read can supersede an overlapping one before either settles.
    if (inventory.revision <= savedThroughRevision.current) return;
    if (activeSave.current) {
      overlappingProject.current = project;
      return;
    }
    setDraftName((draft) => (draft === saved.name ? project.name : draft));
    setDraftColor((draft) => (draft === saved.color ? project.color : draft));
    setSaved(project);
  }, [project, inventory, saved.name, saved.color]);

  async function save() {
    if (!canSave || !beginSave(project.id)) return;
    activeSave.current = true;
    overlappingProject.current = null;
    // Hide the old alert on retry without moving subsequent rows while saving.
    retryErrorSpace.current = error;
    setError(null);
    try {
      const result = await rpc.call("updateProject", {
        projectId: project.id,
        name,
        color: draftColor,
      });
      setSaved(result.project);
      setDraftName(result.project.name);
      setDraftColor(result.project.color);
      savedThroughRevision.current = inventory.readRevision();
    } catch (saveError) {
      setError(errorMessage(saveError));
      if (overlappingProject.current) setSaved(overlappingProject.current);
    } finally {
      activeSave.current = false;
      retryErrorSpace.current = null;
      overlappingProject.current = null;
      endSave();
    }
  }

  return (
    <tr data-project-id={project.id}>
      <td className="project-prefix-cell">
        <span>{project.prefix}</span>
      </td>
      <td className="project-name-cell">
        <form
          id={formId}
          aria-label={`Edit ${project.prefix}`}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Input
            className="project-name-input"
            aria-label={`Project name for ${project.prefix}`}
            aria-invalid={name.length === 0}
            value={draftName}
            disabled={locked}
            onChange={(event) => {
              if (mutationLock.current === null) setDraftName(event.target.value);
            }}
          />
        </form>
        {errorSpace !== null ? (
          <p
            role={error !== null ? "alert" : undefined}
            aria-hidden={error === null}
            className="project-table-error"
          >
            Could not save {project.prefix}: {errorSpace}
          </p>
        ) : null}
      </td>
      <td className="project-colour-cell">
        <Popover
          open={colorOpen && !locked}
          onOpenChange={(open) => {
            if (mutationLock.current === null) setColorOpen(open);
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="project-colour-trigger"
              aria-label={`Colour for ${project.prefix}: ${colorLabel}`}
              disabled={locked}
            >
              <span
                className="project-colour-dot"
                style={{ backgroundColor: draftColor }}
                aria-hidden="true"
              />
              <span className="project-colour-text" title={draftColor}>
                {colorLabel}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="project-colour-popover w-64 space-y-3"
            mobileTitle={`Colour for ${project.prefix}`}
            aria-label={`Colour for ${project.prefix}`}
          >
            <p className="text-xs text-muted-foreground">Colour for {project.prefix}</p>
            <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0">
              <ColorSwatchPicker
                value={draftColor}
                onChange={(color) => {
                  if (mutationLock.current !== null) return;
                  setDraftColor(color);
                  setColorOpen(false);
                }}
              />
            </fieldset>
            <p className="text-xs text-muted-foreground">Choose a colour, then Save the row.</p>
          </PopoverContent>
        </Popover>
      </td>
      <td className="project-actions-cell">
        <div className="project-row-actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="submit"
                form={formId}
                size="icon"
                data-save
                aria-label={`Save ${project.prefix}`}
                aria-busy={pending}
                disabled={!canSave}
              >
                <Icon name={pending ? "Loading" : "Check"} className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save {project.prefix}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Cancel ${project.prefix}`}
                disabled={locked}
                onClick={() => {
                  if (mutationLock.current !== null) return;
                  setDraftName(saved.name);
                  setDraftColor(saved.color);
                  setError(null);
                }}
              >
                <HugeiconsIcon icon={UndoIcon} size={16} aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Cancel {project.prefix}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                data-delete
                aria-label={`Delete ${project.prefix}`}
                disabled={locked || !isReady(inventory)}
                onClick={(event) => onDelete(saved, event.currentTarget)}
              >
                <Icon name="Trash2" className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete {project.prefix}</TooltipContent>
          </Tooltip>
        </div>
      </td>
    </tr>
  );
}
