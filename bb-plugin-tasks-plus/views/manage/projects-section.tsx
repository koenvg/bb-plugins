import { useEffect, useId, useRef, useState, type RefObject } from "react";
import type { Project } from "../../shared/contract.js";
import { errorMessage } from "../../shared/errors.js";
import { useProjects, useTasksRpc } from "../../shell/data.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COLOR_PALETTE, ColorSwatchPicker } from "./shared.js";
import "./projects-section.css";

type Inventory = ReturnType<typeof useProjects>;

function isReady(inventory: Inventory) {
  return inventory.data !== undefined && !inventory.isLoading && inventory.error === null;
}

export function ProjectsSection() {
  const inventory = useProjects();
  const currentInventory = useRef(inventory);
  currentInventory.current = inventory;
  const saveLock = useRef<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const ready = isReady(inventory);
  const rows = inventory.data ?? [];

  function beginSave(id: string) {
    const current = currentInventory.current;
    if (
      saveLock.current !== null ||
      !isReady(current) ||
      !current.data?.some((row) => row.id === id)
    )
      return false;
    saveLock.current = id;
    setPendingId(id);
    return true;
  }

  function endSave() {
    saveLock.current = null;
    setPendingId(null);
  }

  return (
    <section className="project-settings-section" aria-label="Project settings">
      <div className="project-table-heading">
        <h3>Projects</h3>
        <p>
          Edit a name or colour, then Save that row. Cancel restores its saved values. Prefixes stay
          unchanged.
        </p>
      </div>
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
              saveLock={saveLock}
              pendingId={pendingId}
              beginSave={beginSave}
              endSave={endSave}
            />
          ))}
        </tbody>
      </table>
      <div className="project-table-footer">
        <p>
          Each row has its own draft. Saving here does not change your Tasks view or linked BB
          workspace.
        </p>
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
                disabled={pendingId !== null || inventory.isLoading}
                onClick={() => {
                  if (saveLock.current === null) inventory.refresh();
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
  saveLock,
  pendingId,
  beginSave,
  endSave,
}: {
  project: Project;
  inventory: Inventory;
  saveLock: RefObject<string | null>;
  pendingId: string | null;
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
  const pending = pendingId === project.id;
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
              if (saveLock.current === null) setDraftName(event.target.value);
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
            if (saveLock.current === null) setColorOpen(open);
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
                  if (saveLock.current !== null) return;
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
          <Button
            type="submit"
            form={formId}
            data-save
            aria-label={`Save ${project.prefix}`}
            disabled={!canSave}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label={`Cancel ${project.prefix}`}
            disabled={locked}
            onClick={() => {
              if (saveLock.current !== null) return;
              setDraftName(saved.name);
              setDraftColor(saved.color);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </td>
    </tr>
  );
}
