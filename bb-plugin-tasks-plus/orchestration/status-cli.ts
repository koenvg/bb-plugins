import {
  cliCommand,
  PluginCliError,
  type BbPluginApi,
} from "@get-bb/plugin-sdk";
import type { TasksApiStore } from "../api";
import { resolveStatusEpicId } from "./status-store";
import { table } from "../cli/format";
import { orchestrationStatusContract } from "./status-contract";
import { readEpicStatus } from "./status";
import type { StatusOptions } from ".";

// Flat multi-word command keys are the existing Tasks CLI convention. Run and
// recovery slices can add their own keys without replacing this implementation.
export function orchestrationStatusCommands(
  bb: BbPluginApi,
  store: TasksApiStore,
  options: StatusOptions = {},
) {
  return {
    orchestrate: cliCommand({
      summary: "Read epic orchestration state",
      description: "Subcommands: bb tasks orchestrate status <epic> [--json]",
      hidden: true,
      run(input) {
        return { exitCode: 1, stdout: input.help };
      },
    }),
    "orchestrate status": cliCommand({
      summary:
        "Read bounded epic Tasks, worker and decision state without starting work",
      description:
        "Read-only. At most 100 subtasks and 128 KiB JSON. Native dependency readiness does not authorize dispatch. Missing orchestration extensions remain unknown. No run, thread, ticket or message is created.",
      positionals: [
        {
          name: "epic",
          description: "Existing epic task key or ULID",
          required: true,
        },
      ],
      options: {
        json: {
          type: "boolean",
          description: "Emit the compact RPC response as JSON",
        },
      },
      async run(input) {
        const address = input.positionals.epic.trim().toUpperCase();
        const epicId = resolveStatusEpicId(bb.storage.database(), address);
        if (!epicId)
          throw new PluginCliError(`Task not found: ${address}`, {
            code: "task_not_found",
          });
        const result =
          orchestrationStatusContract.orchestrateStatus.output.parse(
            await readEpicStatus(bb, store, epicId, options.readCoordination),
          );
        if (!result.ok)
          return {
            exitCode: 1,
            stdout: input.options.json ? JSON.stringify(result) : "",
            stderr: `${result.error.message}${result.error.counts ? ` Counts: ${JSON.stringify(result.error.counts)}` : ""}`,
          };
        if (input.options.json)
          return { exitCode: 0, stdout: JSON.stringify(result) };
        const status = result.status;
        return {
          exitCode: 0,
          stdout: [
            `${status.epic.key}: ${status.epic.status}. Epic acceptance: ${status.acceptance.state === "present" ? status.acceptance.value.outcome : status.acceptance.state}. Run: ${status.run.state === "present" ? status.run.value.phase : status.run.state}.`,
            `Observed ${status.tasksObservedAt}. External state may differ. Dependency-ready is not dispatch authorization.`,
            table(
              ["KEY", "STATUS", "DEPENDENCIES", "OWNERSHIP", "HANDOFF"],
              status.subtasks.map((task) => [
                task.key,
                task.status,
                task.nativeReadiness,
                task.ownership.state,
                task.handoff.state,
              ]),
              "(no subtasks)",
            ),
            "Use --json for worker observations, pending decisions, references and overflow counts.",
          ].join("\n"),
        };
      },
    }),
  };
}
