import { useEffect, useRef, useState, type Ref } from "react";
import { definePluginApp, Markdown, useRpc } from "@get-bb/plugin-sdk/app";
import type { ProjectChoice, ProjectState, SettingsContract } from "./rpc";
import { IconAction } from "./icon-action";
import "./app.css";

function message(error: unknown) { return error instanceof Error ? error.message : "Request failed"; }
type Confirmation = { kind: "switch"; projectId: string } | { kind: "reset" };

function ConfirmPrompt({ confirmation, projectName, onCancel, onConfirm }: {
  confirmation: Confirmation; projectName: string; onCancel: () => void; onConfirm: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancel.current?.focus(); }, []);
  const reset = confirmation.kind === "reset";
  return <div className="cleanup-confirm" role="dialog" aria-labelledby="cleanup-confirm-title" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); onCancel(); }
  }}>
    <h3 id="cleanup-confirm-title">{reset ? "Reset prompt to plugin default?" : "Discard unsaved prompt?"}</h3>
    <p>{reset ? `Remove custom guidance and any draft for ${projectName}? The default records cleanup through BB Tasks. Enablement stays unchanged.` : `Discard the unsaved prompt for ${projectName} and change projects?`}</p>
    <div className="cleanup-actions">
      <button ref={cancel} onClick={onCancel}>Cancel</button>
      <button onClick={onConfirm}>{reset ? "Confirm reset" : "Discard and switch"}</button>
    </div>
  </div>;
}

function PromptContent({ draft, disabled, dirty, source, canReset, resetButton, onChange, onSave, onReset }: {
  draft: string; disabled: boolean; dirty: boolean; source: string; canReset: boolean;
  resetButton: Ref<HTMLButtonElement>; onChange: (text: string) => void; onSave: () => void; onReset: () => void;
}) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const editTab = useRef<HTMLButtonElement>(null);
  const previewTab = useRef<HTMLButtonElement>(null);
  function changeTab(next: "edit" | "preview") {
    setMode(next); (next === "edit" ? editTab : previewTab).current?.focus();
  }
  return <div className="cleanup-editor">
    <label htmlFor="cleanup-prompt">Cleanup guidance</label>
    <div className="cleanup-toolbar" role="group" aria-label="Guidance controls">
      <div className="cleanup-tabs" role="tablist" aria-label="Guidance view" onKeyDown={event => {
        if (disabled) return;
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          changeTab(event.key === "Home" ? "edit" : event.key === "End" ? "preview" : mode === "edit" ? "preview" : "edit");
        }
      }}>
        <IconAction icon="Edit" label="Edit" ref={editTab} id="cleanup-edit-tab" role="tab" aria-selected={mode === "edit"} aria-controls="cleanup-edit-panel" tabIndex={mode === "edit" ? 0 : -1} disabled={disabled} onClick={() => setMode("edit")} />
        <IconAction icon="Eye" label="Preview" ref={previewTab} id="cleanup-preview-tab" role="tab" aria-selected={mode === "preview"} aria-controls="cleanup-preview-panel" tabIndex={mode === "preview" ? 0 : -1} disabled={disabled} onClick={() => setMode("preview")} />
      </div>
      <div className="cleanup-prompt-actions">
        <IconAction icon="Save" label="Save prompt" disabled={disabled || !dirty} onClick={onSave} />
        <IconAction icon="RotateCcw" label="Reset to plugin default" ref={resetButton} disabled={disabled || !canReset} onClick={onReset} />
      </div>
    </div>
    <div id="cleanup-edit-panel" role="tabpanel" aria-labelledby="cleanup-edit-tab" hidden={mode !== "edit"}>
      <textarea id="cleanup-prompt" value={draft} rows={12} disabled={disabled} spellCheck={false} aria-describedby="cleanup-count cleanup-draft" onChange={event => onChange(event.target.value)} />
    </div>
    <div id="cleanup-preview-panel" role="tabpanel" aria-labelledby="cleanup-preview-tab" hidden={mode !== "preview"}>
      {mode === "preview" && <div className="cleanup-markdown" role="region" aria-label="Guidance preview" tabIndex={0}>
        {Markdown ? <Markdown content={draft} /> : <><p>Rendered preview is not available on this host. Source text is shown.</p><pre>{draft}</pre></>}
      </div>}
    </div>
    <div className="cleanup-metadata">
      <span>Prompt source: {source}</span>
      <span id="cleanup-count">{draft.length} / 4096 characters</span>
    </div>
    <p id="cleanup-draft" hidden={!dirty}>Unsaved changes.</p>
  </div>;
}

function ProjectSettings() {
  const rpc = useRpc<SettingsContract>();
  const [projects, setProjects] = useState<ProjectChoice[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listAttempt, retryList] = useState(0);
  const [projectId, setProjectId] = useState("");
  const [snapshot, setSnapshot] = useState<ProjectState | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [readAttempt, retryRead] = useState(0);
  const [pending, setPending] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const writeLock = useRef(false);
  const alive = useRef(false);
  const selection = useRef(projectId);
  selection.current = projectId;
  const projectSelect = useRef<HTMLSelectElement>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<HTMLButtonElement | HTMLSelectElement | null>(null);
  useEffect(() => {
    if (!confirmation && !pending && restoreFocus.current) {
      const target = restoreFocus.current.disabled ? projectSelect.current : restoreFocus.current;
      target?.focus(); restoreFocus.current = null;
    }
  }, [confirmation, pending]);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    setListError(null); setProjects(null);
    rpc.call("listProjects", {}).then(result => { if (current) setProjects(result); })
      .catch(error => { if (current) setListError(message(error)); });
    return () => { current = false; };
  }, [rpc, listAttempt]);
  useEffect(() => {
    let current = true;
    setSnapshot(null); setDraft(""); setReadError(null); setWriteError(null); setSaved(null);
    if (projectId) rpc.call("getProject", { projectId }).then(result => {
      if (current) {
        if (result.projectId !== projectId) throw new Error("Project response did not match the selection.");
        setSnapshot(result); setDraft(result.effectivePrompt);
      }
    }).catch(error => { if (current) setReadError(message(error)); });
    return () => { current = false; };
  }, [rpc, projectId, readAttempt]);

  const state = snapshot?.projectId === projectId ? snapshot : null;
  const dirty = state !== null && draft !== state.effectivePrompt;
  const blocked = pending || confirmation !== null;
  const projectName = projects?.find(project => project.id === projectId)?.name ?? projectId;

  async function persist(kind: "enablement" | "prompt", prompt: string | null = null) {
    if (!state || writeLock.current) return;
    const target = state.projectId;
    writeLock.current = true; setPending(true); setWriteError(null); setSaved(null);
    try {
      const result = kind === "enablement"
        ? await rpc.call("setEnablement", { projectId: target, enabled: !state.enabled })
        : await rpc.call("setPrompt", { projectId: target, prompt });
      if (result.projectId !== target) throw new Error("Project response did not match the save target.");
      if (alive.current && selection.current === target) {
        setSnapshot(result);
        if (kind === "prompt") setDraft(result.effectivePrompt);
        setSaved(kind === "enablement" ? `Saved. Code Cleanup is ${result.enabled ? "On" : "Off"} for ${projectName}.`
          : prompt === null ? `Reset prompt for ${projectName} to plugin default.` : `Saved prompt for ${projectName}.`);
      }
    } catch (error) { if (alive.current && selection.current === target) setWriteError(message(error)); }
    finally { writeLock.current = false; if (alive.current) setPending(false); }
  }
  function savePrompt() {
    if (blocked || writeLock.current) return;
    if (!draft.trim() || draft.length > 4096) {
      setSaved(null); setWriteError("Prompt must be nonblank and at most 4096 characters."); return;
    }
    void persist("prompt", draft);
  }
  function cancelConfirmation() {
    const origin = confirmation?.kind;
    setConfirmation(null);
    restoreFocus.current = (origin === "switch" ? projectSelect : resetButton).current;
  }
  function confirm() {
    if (!confirmation || writeLock.current) return;
    const action = confirmation;
    setConfirmation(null);
    if (action.kind === "switch") { restoreFocus.current = projectSelect.current; setProjectId(action.projectId); }
    else { restoreFocus.current = resetButton.current; void persist("prompt", null); }
  }

  return <section className="code-cleanup-settings" aria-label="Code Cleanup project settings">
    <div className="cleanup-project-group">
      <div className="cleanup-project-field">
    <label htmlFor="cleanup-project">Project</label>
    <select ref={projectSelect} id="cleanup-project" value={projectId} disabled={blocked || !projects?.length} onChange={event => {
      if (writeLock.current || confirmation) return;
      if (dirty) setConfirmation({ kind: "switch", projectId: event.target.value });
      else setProjectId(event.target.value);
    }}>
      <option value="">Select a project</option>
      {projects?.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
    </select>
      </div>
      {state && <div className="cleanup-control">
        <span id="cleanup-enable-label">Enable for this project</span>
        <button role="switch" aria-labelledby="cleanup-enable-label" aria-checked={state.enabled} disabled={blocked} onClick={() => void persist("enablement")}>{state.enabled ? "On" : "Off"}</button>
      </div>}
    </div>
    {!projects && !listError && <p role="status">Loading projects…</p>}
    {listError && <div><p role="alert">Could not load projects: {listError}</p><button onClick={() => retryList(n => n + 1)}>Retry projects</button></div>}
    {projects?.length === 0 && <p>No standard projects are available.</p>}
    {!!projects?.length && !projectId && <p>Select a project to inspect its guidance.</p>}
    {projectId && !state && !readError && <p role="status">Loading project settings…</p>}
    {readError && <div><p role="alert">Could not load project settings: {readError}</p><button onClick={() => retryRead(n => n + 1)}>Retry project</button></div>}
    {state && <PromptContent key={projectId} draft={draft} disabled={blocked} dirty={dirty}
      source={state.prompt === null ? "Plugin default" : "Custom"} canReset={state.prompt !== null || dirty} resetButton={resetButton}
      onChange={text => { setDraft(text); setSaved(null); setWriteError(null); }} onSave={savePrompt} onReset={() => setConfirmation({ kind: "reset" })} />}
    {confirmation && <ConfirmPrompt confirmation={confirmation} projectName={projectName} onCancel={cancelConfirmation} onConfirm={confirm} />}
    {pending && <p role="status">Saving for {projectName}…</p>}
    {saved && <p role="status">{saved}</p>}
    {writeError && <p role="alert">Could not save: {writeError} The saved state and any draft are kept. Try again.</p>}
    <div className="cleanup-footer">
      <p className="cleanup-help">Applies to new agent sessions only.</p>
      <IconAction icon="Info" label="Task recording requirements" aria-expanded={showHelp} aria-controls="cleanup-help" onClick={() => setShowHelp(value => !value)} />
    </div>
    <p id="cleanup-help" className="cleanup-help" role="region" aria-label="Task recording requirements" hidden={!showHelp}>The default records cleanup through agents. BB Tasks needs an available CLI and one linked tracker. These controls do not create tasks or trackers.</p>
  </section>;
}

export default definePluginApp(app => {
  app.slots.settingsSection({ id: "project-settings", title: "Project guidance", component: ProjectSettings });
});
