import { cliCommand } from "@get-bb/plugin-sdk";
import { CliError, JSON_OPTION, guard, type TasksDomain, type PluginStatus } from "./common";
import { detail } from "./format";
import { seedDemo } from "./seed";

export function workspaceCommands(domain: TasksDomain, status: PluginStatus) {
  return {
    status: cliCommand({
      summary: "Show the Tasks plugin name and version",
      description:
        "Plugin health only. To filter tasks by workflow status run bb tasks list --status <status>; to change one run bb tasks update <key-or-id> --status <status>.",
      options: { json: JSON_OPTION },
      run(input) {
        return {
          exitCode: 0,
          stdout: input.options.json ? JSON.stringify(status) : `${status.name} ${status.version}`,
        };
      },
    }),
    "seed-demo": cliCommand({
      summary: "Create sample folders, projects, labels, tasks, and comments",
      options: {
        yes: {
          type: "boolean",
          description: "Confirm writing sample data into this workspace",
        },
        json: JSON_OPTION,
      },
      run(input, ctx) {
        return guard(async () => {
          if (!input.options.yes) {
            throw new CliError("seed-demo creates sample data; re-run with --yes", {
              code: "confirmation_required",
            });
          }
          const result = await seedDemo(domain, ctx.projectId);
          return input.options.json
            ? JSON.stringify(result)
            : detail([
                ["Folders", result.foldersCreated],
                ["Projects", result.projectsCreated],
                ["Labels", result.labelsCreated],
                ["Tasks", result.tasksCreated],
                ["Comments", result.commentsCreated],
                ["BB project", result.linkedBbProjectId ?? "-"],
              ]);
        });
      },
    }),
  };
}
