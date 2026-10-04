import { PluginCliError, type BbPluginApi } from "@get-bb/plugin-sdk";
import type { ProjectSettingsStore } from "./project-settings";
import { defaultGuidance } from "./guidance";

/** Shared project validation and field-scoped operations for CLI and Settings. */
export function projectConfiguration(bb: BbPluginApi, settings: ProjectSettingsStore) {
  async function listProjects() {
    const projects = await bb.sdk.projects.list({ includePersonal: true });
    return projects.filter(project => project.kind === "standard").map(({ id, name }) => ({ id, name }));
  }
  async function requireProject(projectId: string) {
    if (!(await listProjects()).some(project => project.id === projectId)) {
      throw new PluginCliError(`No standard project with ID ${projectId}`, {
        code: "project_not_found", hint: "Use a standard project ID from `bb project list`.",
      });
    }
  }
  function snapshot(projectId: string) {
    const state = settings.get(projectId);
    return { projectId, ...state, effectivePrompt: state.prompt ?? defaultGuidance(projectId) };
  }
  return {
    listProjects,
    async getProject(projectId: string) {
      await requireProject(projectId);
      return snapshot(projectId);
    },
    async setEnablement(projectId: string, enabled: boolean) {
      await requireProject(projectId);
      settings.setEnabled(projectId, enabled);
      return snapshot(projectId);
    },
    async setPrompt(projectId: string, prompt: string | null) {
      await requireProject(projectId);
      if (prompt !== null && (prompt.trim() === "" || prompt.length > 4096)) {
        throw new PluginCliError("Prompt must be nonblank and at most 4096 characters", { code: "invalid_value" });
      }
      if (prompt === null) settings.resetPrompt(projectId);
      else settings.setPrompt(projectId, prompt);
      return snapshot(projectId);
    },
  };
}
