import { cliCommand, PluginCliError } from "@get-bb/plugin-sdk";
import type { RunController } from "./run";

export function runCommands(controller: RunController) {
  const command = (action: "begin" | "pause" | "resume") =>
    cliCommand({
      summary: `${action} an approved orchestration run from a persisted explicit invocation`,
      description:
        "Uses BB-recorded user classification, not proof of human identity. See BBP-51. No worker side effects.",
      options: {
        request: {
          type: "string",
          required: true,
          description:
            "Persisted request ID, or latest, in this coordinator thread",
        },
        thread: {
          type: "string",
          description: "Coordinator thread ID; defaults to invoking thread",
        },
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
        const result = await controller.control(action, {
          coordinatorThreadId,
          requestId: input.options.request,
        });
        return {
          exitCode: 0,
          stdout: input.options.json
            ? JSON.stringify(result)
            : result.outcome === "run"
              ? `${result.run.id} ${result.run.phase}`
              : result.outcome,
        };
      },
    });
  return {
    "orchestrate begin": command("begin"),
    "orchestrate pause": command("pause"),
    "orchestrate resume": command("resume"),
  };
}
