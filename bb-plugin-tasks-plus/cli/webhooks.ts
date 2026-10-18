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
            "Regular UTF-8 JSON file with url and optional authorization; keep secrets out of argv",
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
      summary: "List webhook ids, scopes and authentication presence only",
      options: { json: JSON_OPTION },
      run() {
        return safeCommand(async () => ({ endpoints: webhooks.list() }));
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
