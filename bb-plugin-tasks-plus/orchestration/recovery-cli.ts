import { cliCommand, PluginCliError, type BbPluginApi } from "@get-bb/plugin-sdk";
import type { Dispatcher } from "./dispatch";
import { resolveStatusEpicId } from "./status-store";
import { roleSchema } from "./dispatch-contract";
import { RECOVERY_WARNING } from "./recovery-contract";

export function recoveryCommands(bb: BbPluginApi, dispatcher: Dispatcher) {
  const command = (action: "reconcile" | "link" | "resolve") =>
    cliCommand({
      summary:
        action === "reconcile"
          ? "Find and attach the original worker without replay"
          : action === "link"
            ? "Link a unique known original worker"
            : "Record an explicit release or selected replacement",
      description: RECOVERY_WARNING,
      positionals: [
        {
          name: "task",
          required: true,
          description: "Original task key or ULID",
        },
      ],
      options: {
        run: {
          type: "string",
          required: true,
          description: "Original approved run ID",
        },
        claim: {
          type: "string",
          required: true,
          description: "Exact durable attempt ID",
        },
        thread: {
          type: "string",
          description: "Coordinator outside thread context",
        },
        role: {
          type: "string",
          description: "Worker role, currently implementation",
        },
        ...(action === "link"
          ? {
              worker: {
                type: "string" as const,
                required: true as const,
                description: "Known original child ID",
              },
            }
          : {}),
        ...(action === "resolve"
          ? {
              action: {
                type: "string" as const,
                required: true as const,
                description: "release or replace",
              },
              association: {
                type: "string" as const,
                description: "Current task association for replacement",
              },
              reconciliation: {
                type: "string" as const,
                required: true as const,
                description: "Exact reconciliation identity in recorded decision",
              },
              request: {
                type: "string" as const,
                required: true as const,
                description: "Latest BB-recorded user resolution request ID",
              },
              "acknowledge-delayed-creation": {
                type: "boolean" as const,
                description: "Acknowledge delayed creation and duplicate-work risk",
              },
            }
          : {}),
        json: { type: "boolean", description: "Emit JSON" },
      },
      async run(input, context) {
        const coordinatorThreadId = context.threadId ?? input.options.thread;
        if (
          !coordinatorThreadId ||
          (context.threadId && input.options.thread && context.threadId !== input.options.thread)
        )
          throw new PluginCliError("Use your coordinator thread context", {
            code: "run_context_invalid",
          });
        const taskId = resolveStatusEpicId(bb.storage.database(), input.positionals.task);
        if (!taskId)
          throw new PluginCliError("Task not found", {
            code: "task_not_found",
          });
        const request = {
          taskId,
          coordinatorThreadId,
          runId: input.options.run,
          claimId: input.options.claim,
          role: roleSchema.parse(input.options.role ?? "implementation"),
        };
        const result =
          action === "reconcile"
            ? await dispatcher.recovery.reconcile(request)
            : action === "link"
              ? await dispatcher.recovery.link({
                  ...request,
                  threadId: String(input.options.worker),
                })
              : await dispatcher.recovery.resolve({
                  ...request,
                  action: input.options.action,
                  associationId: input.options.association ?? null,
                  reconciliationId: input.options.reconciliation,
                  requestId: input.options.request,
                  acknowledgeDelayedCreation:
                    input.options["acknowledge-delayed-creation"] === true,
                });
        return {
          exitCode: 0,
          stdout: input.options.json
            ? JSON.stringify(result)
            : `${result.outcome}: ${result.reason}\n${result.warning}${result.reconciliationId ? `\nReconciliation: ${result.reconciliationId}` : ""}`,
        };
      },
    });
  return {
    "orchestrate reconcile": command("reconcile"),
    "orchestrate link": command("link"),
    "orchestrate resolve": command("resolve"),
  };
}
