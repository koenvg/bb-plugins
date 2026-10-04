import { cliCommand, defineCli, type BbPluginApi } from "@get-bb/plugin-sdk";
import { openProjectSettings } from "./project-settings";
import { defaultGuidance } from "./guidance";
import { projectConfiguration } from "./configuration";
import { settingsContract } from "./rpc";

const projectOption = {
  project: { type: "string", required: true, description: "Standard BB project ID" },
} as const;

export default function plugin(bb: BbPluginApi): void {
  const settings = openProjectSettings(bb);

  bb.agents.configure(({ project, origin }) => {
    if (project.kind !== "standard" || origin.pluginId === "side-chat") return { tools: [], skills: [] };
    const state = settings.get(project.id);
    if (!state.enabled) return { tools: [], skills: [] };
    return { tools: [], skills: [], instructions: state.prompt ?? defaultGuidance(project.id) };
  });

  const configuration = projectConfiguration(bb, settings);
  bb.rpc.register(settingsContract, {
    listProjects: () => configuration.listProjects(),
    getProject: ({ projectId }) => configuration.getProject(projectId),
    setEnablement: ({ projectId, enabled }) => configuration.setEnablement(projectId, enabled),
    setPrompt: ({ projectId, prompt }) => configuration.setPrompt(projectId, prompt),
  });

  bb.cli.register(defineCli({
    name: "code-cleanup",
    summary: "Manage project-scoped Code Cleanup guidance",
    commands: {
      enable: cliCommand({
        summary: "Enable guidance for one project",
        options: projectOption,
        async run({ options }) {
          await configuration.setEnablement(options.project, true);
          return { exitCode: 0, stdout: `Enabled Code Cleanup for ${options.project}.` };
        },
      }),
      disable: cliCommand({
        summary: "Disable guidance for one project (keep its prompt override)",
        options: projectOption,
        async run({ options }) {
          await configuration.setEnablement(options.project, false);
          return { exitCode: 0, stdout: `Disabled Code Cleanup for ${options.project}.` };
        },
      }),
      show: cliCommand({
        summary: "Show project enablement and prompt source",
        options: projectOption,
        async run({ options }) {
          const state = await configuration.getProject(options.project);
          return { exitCode: 0, stdout: `${options.project}: ${state.enabled ? "enabled" : "disabled"}; prompt: ${state.prompt === null ? "default" : "custom"}` };
        },
      }),
      "prompt set": cliCommand({
        summary: "Replace this project's guidance with custom text",
        options: {
          ...projectOption,
          text: { type: "string", required: true, stdin: true, description: "Nonblank instruction text (up to 4096 characters)" },
        },
        async run({ options }) {
          await configuration.setPrompt(options.project, options.text);
          return { exitCode: 0, stdout: `Saved custom guidance for ${options.project}.` };
        },
      }),
      "prompt reset": cliCommand({
        summary: "Restore the default guidance for one project",
        options: projectOption,
        async run({ options }) {
          await configuration.setPrompt(options.project, null);
          return { exitCode: 0, stdout: `Restored default guidance for ${options.project}.` };
        },
      }),
    },
  }));
}
