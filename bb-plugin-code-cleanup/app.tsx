import { useEffect, useRef, useState, type Ref } from "react";
import { definePluginApp, Markdown, useRpc } from "@get-bb/plugin-sdk/app";
import type { ProjectChoice, SettingsContract } from "./rpc";
import { useProjectSettings, message } from "./use-project-settings";
import { IconAction } from "./icon-action";
import "./app.css";

type Confirmation =
  | { kind: "switch"; projectId: string }
  | { kind: "reset"; expectedPrompt: string | null }
  | { kind: "reload" };

function ConfirmPrompt({
  confirmation,
  projectName,
  onCancel,
  onConfirm,
}: {
  confirmation: Confirmation;
  projectName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
  }, []);
  const reset = confirmation.kind === "reset";
  return (
    <div
      className="cleanup-confirm"
      role="dialog"
      aria-labelledby="cleanup-confirm-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <h3 id="cleanup-confirm-title">
        {reset ? "Reset prompt to plugin default?" : "Discard unsaved prompt?"}
      </h3>
      <p>
        {reset
          ? `Remove custom guidance and any draft for ${projectName}? The default records cleanup through BB Tasks. Enablement stays unchanged.`
          : confirmation.kind === "reload"
            ? `Discard the unsaved prompt for ${projectName} and reload the saved guidance? Copy your draft first if you need it.`
            : `Discard the unsaved prompt for ${projectName} and change projects?`}
      </p>
      <div className="cleanup-actions">
        <button ref={cancel} onClick={onCancel}>
          Cancel
        </button>
        <button onClick={onConfirm}>
          {reset
            ? "Confirm reset"
            : confirmation.kind === "reload"
              ? "Discard and reload"
              : "Discard and switch"}
        </button>
      </div>
    </div>
  );
}

function PromptContent({
  draft,
  disabled,
  dirty,
  source,
  canReset,
  conflict,
  resetButton,
  onChange,
  onSave,
  onReset,
}: {
  draft: string;
  disabled: boolean;
  dirty: boolean;
  source: string;
  canReset: boolean;
  conflict: boolean;
  resetButton: Ref<HTMLButtonElement>;
  onChange: (text: string) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const editTab = useRef<HTMLButtonElement>(null);
  const previewTab = useRef<HTMLButtonElement>(null);
  function changeTab(next: "edit" | "preview") {
    setMode(next);
    (next === "edit" ? editTab : previewTab).current?.focus();
  }
  return (
    <div className="cleanup-editor">
      <label htmlFor="cleanup-prompt">Cleanup guidance</label>
      <div className="cleanup-toolbar" role="group" aria-label="Guidance controls">
        <div
          className="cleanup-tabs"
          role="tablist"
          aria-label="Guidance view"
          onKeyDown={(event) => {
            if (disabled) return;
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              changeTab(
                event.key === "Home"
                  ? "edit"
                  : event.key === "End"
                    ? "preview"
                    : mode === "edit"
                      ? "preview"
                      : "edit",
              );
            }
          }}
        >
          <IconAction
            icon="Edit"
            label="Edit"
            ref={editTab}
            id="cleanup-edit-tab"
            role="tab"
            aria-selected={mode === "edit"}
            aria-controls="cleanup-edit-panel"
            tabIndex={mode === "edit" ? 0 : -1}
            disabled={disabled}
            onClick={() => setMode("edit")}
          />
          <IconAction
            icon="Eye"
            label="Preview"
            ref={previewTab}
            id="cleanup-preview-tab"
            role="tab"
            aria-selected={mode === "preview"}
            aria-controls="cleanup-preview-panel"
            tabIndex={mode === "preview" ? 0 : -1}
            disabled={disabled}
            onClick={() => setMode("preview")}
          />
        </div>
        <div className="cleanup-prompt-actions">
          <IconAction
            icon="Save"
            label="Save prompt"
            disabled={disabled || conflict || !dirty}
            onClick={onSave}
          />
          <IconAction
            icon="RotateCcw"
            label="Reset to plugin default"
            ref={resetButton}
            disabled={disabled || conflict || !canReset}
            onClick={onReset}
          />
        </div>
      </div>
      <div
        id="cleanup-edit-panel"
        role="tabpanel"
        aria-labelledby="cleanup-edit-tab"
        hidden={mode !== "edit"}
      >
        <textarea
          id="cleanup-prompt"
          value={draft}
          rows={12}
          disabled={disabled}
          spellCheck={false}
          aria-describedby="cleanup-count cleanup-draft"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <div
        id="cleanup-preview-panel"
        role="tabpanel"
        aria-labelledby="cleanup-preview-tab"
        hidden={mode !== "preview"}
      >
        {mode === "preview" && (
          <div
            className="cleanup-markdown"
            role="region"
            aria-label="Guidance preview"
            tabIndex={0}
          >
            {Markdown ? (
              <Markdown content={draft} />
            ) : (
              <>
                <p>Rendered preview is not available on this host. Source text is shown.</p>
                <pre>{draft}</pre>
              </>
            )}
          </div>
        )}
      </div>
      <div className="cleanup-metadata">
        <span>Prompt source: {source}</span>
        <span id="cleanup-count">{draft.length} / 4096 characters</span>
      </div>
      <p id="cleanup-draft" hidden={!dirty}>
        Unsaved changes.
      </p>
    </div>
  );
}

function ProjectSettings() {
  const rpc = useRpc<SettingsContract>();
  const [projects, setProjects] = useState<ProjectChoice[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listAttempt, retryList] = useState(0);
  const [projectId, setProjectId] = useState("");
  const {
    state,
    draft,
    dirty,
    changed,
    conflict,
    connection,
    reading,
    reloading,
    readError,
    pending,
    writeError,
    saved,
    writeLock,
    refresh,
    persist: write,
    edit,
    invalidPrompt,
  } = useProjectSettings(projectId);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const projectSelect = useRef<HTMLSelectElement>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  const reloadButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<HTMLButtonElement | HTMLSelectElement | null>(null);
  useEffect(() => {
    if (!confirmation && !pending && !reloading && restoreFocus.current) {
      const target = restoreFocus.current.disabled ? projectSelect.current : restoreFocus.current;
      target?.focus();
      restoreFocus.current = null;
    }
  }, [confirmation, pending, reloading]);

  useEffect(() => {
    let current = true;
    setListError(null);
    setProjects(null);
    rpc
      .call("listProjects", {})
      .then((result) => {
        if (current) setProjects(result);
      })
      .catch((error) => {
        if (current) setListError(message(error));
      });
    return () => {
      current = false;
    };
  }, [rpc, listAttempt]);
  const blocked = pending || reloading || confirmation !== null;
  const projectName = projects?.find((project) => project.id === projectId)?.name ?? projectId;

  function persist(
    kind: "enablement" | "inherit" | "prompt",
    prompt: string | null = null,
    expected?: { prompt: string | null },
  ) {
    return write(kind, projectName, prompt, expected);
  }
  function savePrompt() {
    if (blocked || writeLock.current) return;
    if (!draft.trim() || draft.length > 4096) {
      invalidPrompt();
      return;
    }
    void persist("prompt", draft);
  }
  function cancelConfirmation() {
    const origin = confirmation?.kind;
    setConfirmation(null);
    restoreFocus.current = (
      origin === "switch" ? projectSelect : origin === "reload" ? reloadButton : resetButton
    ).current;
  }
  function confirm() {
    if (!confirmation || writeLock.current) return;
    const action = confirmation;
    setConfirmation(null);
    if (action.kind === "switch") {
      restoreFocus.current = projectSelect.current;
      setProjectId(action.projectId);
    } else if (action.kind === "reload") {
      restoreFocus.current = reloadButton.current;
      refresh(true);
    } else {
      restoreFocus.current = resetButton.current;
      void persist("prompt", null, { prompt: action.expectedPrompt });
    }
  }

  return (
    <section className="code-cleanup-settings" aria-label="Code Cleanup project settings">
      {connection !== "connected" && (
        <p role="status">
          Settings updates are not connected. Reconnect or use Reload saved settings to check for
          missed changes.
        </p>
      )}
      <div className="cleanup-project-group">
        <div className="cleanup-project-field">
          <label htmlFor="cleanup-project">Project</label>
          <select
            ref={projectSelect}
            id="cleanup-project"
            value={projectId}
            disabled={blocked || !projects?.length}
            onChange={(event) => {
              if (writeLock.current || confirmation) return;
              if (dirty) setConfirmation({ kind: "switch", projectId: event.target.value });
              else setProjectId(event.target.value);
            }}
          >
            <option value="">Select a project</option>
            {projects?.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        {state && (
          <div className="cleanup-enablement">
            <div className="cleanup-control">
              <span id="cleanup-enable-label">Enable for this project</span>
              <div className="cleanup-enablement-actions">
                <button
                  role="switch"
                  aria-labelledby="cleanup-enable-label"
                  aria-checked={state.enabled}
                  disabled={blocked}
                  onClick={() => void persist("enablement")}
                >
                  {state.enabled ? "On" : "Off"}
                </button>
                <button
                  disabled={blocked || state.enabledOverride === null}
                  onClick={() => void persist("inherit")}
                >
                  Use default
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {state && (
        <p className="cleanup-help" aria-live="polite">
          {state.enabled ? "On" : "Off"} ·{" "}
          {state.enabledOverride === null ? "Default" : "Project override"}
        </p>
      )}
      {state && (
        <div className="cleanup-recovery">
          {changed && (
            <p role={conflict ? "alert" : "status"}>
              {conflict
                ? "Prompt conflict. Save or Reset did not change the saved prompt."
                : "Saved settings changed."}{" "}
              Your draft is kept. Copy it before Reload if you need it.
            </p>
          )}
          <button
            ref={reloadButton}
            disabled={blocked}
            onClick={() => {
              if (dirty || changed || conflict) setConfirmation({ kind: "reload" });
              else refresh(true);
            }}
          >
            Reload saved settings
          </button>
          {reading && <p role="status">Refreshing saved settings…</p>}
        </div>
      )}
      {!projects && !listError && <p role="status">Loading projects…</p>}
      {listError && (
        <div>
          <p role="alert">Could not load projects: {listError}</p>
          <button onClick={() => retryList((n) => n + 1)}>Retry projects</button>
        </div>
      )}
      {projects?.length === 0 && <p>No standard projects are available.</p>}
      {!!projects?.length && !projectId && <p>Select a project to inspect its guidance.</p>}
      {projectId && !state && !readError && <p role="status">Loading project settings…</p>}
      {readError && (
        <div>
          <p role="alert">
            Could not {state ? "refresh" : "load"} project settings: {readError} The draft is kept.
          </p>
          <button disabled={blocked} onClick={() => refresh()}>
            Retry project
          </button>
        </div>
      )}
      {state && (
        <PromptContent
          key={projectId}
          draft={draft}
          disabled={blocked}
          dirty={dirty}
          conflict={conflict}
          source={state.prompt === null ? "Plugin default" : "Custom"}
          canReset={state.prompt !== null || dirty}
          resetButton={resetButton}
          onChange={edit}
          onSave={savePrompt}
          onReset={() => setConfirmation({ kind: "reset", expectedPrompt: state.prompt })}
        />
      )}
      {confirmation && (
        <ConfirmPrompt
          confirmation={confirmation}
          projectName={projectName}
          onCancel={cancelConfirmation}
          onConfirm={confirm}
        />
      )}
      {pending && <p role="status">Saving for {projectName}…</p>}
      {saved && <p role="status">{saved}</p>}
      {writeError && (
        <p role="alert">
          Could not save: {writeError} The saved state and any draft are kept. Try again.
        </p>
      )}
      <div className="cleanup-footer">
        <p className="cleanup-help">Applies to new agent sessions only.</p>
        <IconAction
          icon="Info"
          label="Task recording requirements"
          aria-expanded={showHelp}
          aria-controls="cleanup-help"
          onClick={() => setShowHelp((value) => !value)}
        />
      </div>
      <p
        id="cleanup-help"
        className="cleanup-help"
        role="region"
        aria-label="Task recording requirements"
        hidden={!showHelp}
      >
        The default records cleanup through agents. BB Tasks needs an available CLI and one linked
        tracker. These controls do not create tasks or trackers.
      </p>
    </section>
  );
}

export default definePluginApp((app) => {
  app.slots.settingsSection({
    id: "project-settings",
    title: "Project guidance",
    component: ProjectSettings,
  });
});
