import {
  cliCommand,
  PluginCliError,
  type BbPluginApi,
} from "@get-bb/plugin-sdk";
import type { Dispatcher } from "./dispatch";
import { resolveStatusEpicId } from "./status-store";
import { roleSchema } from "./dispatch-contract";

export function dispatchCommands(bb: BbPluginApi, dispatcher: Dispatcher) {
  const command = (adopt: boolean) =>
    cliCommand({
      summary: adopt
        ? "Explicitly adopt a legacy task worker association"
        : "Safely dispatch or reuse an approved task owner",
      description:
        "Requires a current approved run. Unknown ownership, claims and handoffs refuse another spawn. No new approval for routine eligible work.",
      positionals: [
        {
          name: "task",
          required: true,
          description: "Approved task key or ULID",
        },
      ],
      options: {
        run: {
          type: "string",
          required: true,
          description: "Durable approved run ID",
        },
        thread: {
          type: "string",
          description: "Coordinator ID outside thread context",
        },
        role: {
          type: "string",
          description: "Worker role, currently implementation",
        },
        ...(adopt
          ? {
              association: {
                type: "string" as const,
                required: true as const,
                description: "Exact existing association ID to adopt",
              },
            }
          : {}),
        json: { type: "boolean", description: "Emit JSON" },
      },
      async run(input, context) {
        const coordinatorThreadId = context.threadId ?? input.options.thread;
        if (
          !coordinatorThreadId ||
          (context.threadId &&
            input.options.thread &&
            context.threadId !== input.options.thread)
        )
          throw new PluginCliError("Use your coordinator thread context", {
            code: "run_context_invalid",
          });
        const taskId = resolveStatusEpicId(
          bb.storage.database(),
          input.positionals.task,
        );
        if (!taskId)
          throw new PluginCliError("Task not found", {
            code: "task_not_found",
          });
        const request = {
          taskId,
          runId: input.options.run,
          coordinatorThreadId,
          role: roleSchema.parse(input.options.role ?? "implementation"),
        };
        const result = adopt
          ? await dispatcher.adopt({
              ...request,
              associationId: String(input.options.association),
            })
          : await dispatcher.dispatch(request);
        return {
          exitCode: 0,
          stdout: input.options.json
            ? JSON.stringify(result)
            : `${result.outcome}: ${result.reason}${result.threadId ? ` ${result.threadId}` : ""}`,
        };
      },
    });
  return {
    "orchestrate dispatch": command(false),
    "orchestrate adopt": command(true),
  };
}
