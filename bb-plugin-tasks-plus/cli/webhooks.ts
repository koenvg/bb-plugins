import { cliCommand, type BbPluginApi, type PluginCliResult } from "@get-bb/plugin-sdk";
import { WebhookError, type Webhooks, type WebhookScope } from "../webhooks";
import { resolveProject } from "./boundary";
import { readWebhookConfigFile } from "./client-files";
import {
  CliError,
  JSON_OPTION,
  MACHINE_OPTION,
  PROJECT_OPTION,
  groupCommand,
  type TasksDomain,
} from "./common";

async function safeCommand(action: () => Promise<unknown>): Promise<PluginCliResult> {
  try {
    return { exitCode: 0, stdout: JSON.stringify(await action()) };
  } catch (error) {
    if (error instanceof WebhookError)
      throw new CliError(error.message, { code: `webhook_${error.code}` });
    if (error instanceof CliError && error.code === "webhook_file_error") throw error;
    throw new CliError("Webhook command failed", { code: "webhook_command_failed" });
  }
}
const endpointPositional = [
  { name: "id", description: "Webhook endpoint id from webhook list", required: true },
] as const;

export function webhookCommands(bb: BbPluginApi, domain: TasksDomain, webhooks: Webhooks) {
  return {
    webhook: groupCommand("webhook", "Manage task-created webhooks", [
      ["create", "Register an endpoint from a private JSON file"],
      ["rename", "Change or clear an endpoint's display name"],
      ["list", "List redacted endpoint summaries"],
      ["delete", "Delete an endpoint"],
      ["test", "Send a marked sample without creating a task"],
    ]),
    "webhook create": cliCommand({
      summary: "Register a task-created webhook (global unless --project is explicit)",
      options: {
        "config-file": {
          type: "string",
          required: true,
          description:
            "Regular UTF-8 JSON file with url and optional name and authorization; keep secrets out of argv",
        },
        project: PROJECT_OPTION,
        machine: MACHINE_OPTION,
        json: JSON_OPTION,
      },
      run(input, ctx) {
        return safeCommand(async () => {
          const scope: WebhookScope =
            input.options.project === undefined
              ? { kind: "global" }
              : {
                  kind: "tracker",
                  projectId: (await resolveProject(domain, input.options.project)).id,
                };
          const json = await readWebhookConfigFile(
            bb,
            domain,
            ctx,
            input.options["config-file"],
            input.options.machine,
          );
          return { endpoint: await webhooks.create(scope, json) };
        });
      },
    }),
    "webhook list": cliCommand({
      summary: "List webhook ids, optional names, scopes and Authorization presence",
      options: { json: JSON_OPTION },
      run() {
        return safeCommand(async () => ({ endpoints: await webhooks.list() }));
      },
    }),
    "webhook rename": cliCommand({
      summary: "Change a webhook display name without sending a delivery",
      positionals: endpointPositional,
      options: {
        name: {
          type: "string",
          required: true,
          description: "Display name (80 characters max); pass an empty string to clear it",
        },
        json: JSON_OPTION,
      },
      run(input) {
        return safeCommand(async () => ({
          endpoint: await webhooks.rename(input.positionals.id, input.options.name),
        }));
      },
    }),
    "webhook delete": cliCommand({
      summary: "Delete a webhook endpoint",
      positionals: endpointPositional,
      options: { json: JSON_OPTION },
      run(input) {
        return safeCommand(async () => ({
          endpoint: await webhooks.delete(input.positionals.id),
          deleted: true,
        }));
      },
    }),
    "webhook test": cliCommand({
      summary: "Send a marked task.created sample and report a safe delivery outcome",
      positionals: endpointPositional,
      options: { json: JSON_OPTION },
      run(input) {
        return safeCommand(() => webhooks.test(input.positionals.id));
      },
    }),
  };
}
