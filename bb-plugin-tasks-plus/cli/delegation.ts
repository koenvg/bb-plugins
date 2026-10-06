import { cliCommand, type BbPluginApi, type PluginCliContext } from "@get-bb/plugin-sdk";
import { blockedWorkWarnings, type TasksApiStore } from "../api";
import { delegationRpcContract } from "../delegate/contract";
import { handlers as delegationHandlers } from "../delegate";
import { tasksRpcContract } from "../shared/contract";
import {
  JSON_OPTION,
  KEY_POSITIONAL,
  CliError,
  guard,
  withWarnings,
  type TasksDomain,
} from "./common";
import { resolveTask, resolvePreset, listPresets } from "./boundary";
import { table } from "./format";

function resolveInvokingThreadId(thread: string | undefined, ctx: PluginCliContext): string {
  const threadId = thread ?? process.env.BB_THREAD_ID ?? ctx.threadId;
  if (!threadId) {
    throw new CliError("missing --thread and BB_THREAD_ID is not set", {
      code: "missing_required",
    });
  }
  return threadId;
}

export function delegationCommands(bb: BbPluginApi, store: TasksApiStore, domain: TasksDomain) {
  return {
    dispatch: cliCommand({
      summary: "Dispatch a task to a new agent thread",
      aliases: ["delegate"],
      suggestFor: ["start", "run", "spawn"],
      positionals: [KEY_POSITIONAL],
      options: {
        preset: {
          type: "string",
          required: true,
          placeholder: "name-or-id",
          description: "Dispatch preset name or id; run bb tasks preset list to see them",
        },
        instructions: {
          type: "string",
          placeholder: "text",
          aliases: ["extra-instructions"],
          description: "Extra instructions for this dispatch only",
        },
        json: JSON_OPTION,
      },
      run(input) {
        return guard(async () => {
          const task = await resolveTask(domain, input.positionals["key-or-id"]);
          const preset = resolvePreset(await listPresets(domain), input.options.preset);
          const result = delegationRpcContract.delegate.output.parse(
            await delegationHandlers(bb, store).delegate(
              delegationRpcContract.delegate.input.parse({
                taskId: task.id,
                presetId: preset.id,
                extraInstructions: input.options.instructions,
              }),
            ),
          );
          const warnings = blockedWorkWarnings(task);
          if (input.options.json) {
            return JSON.stringify(
              warnings.length > 0
                ? { task, preset, ...result, warnings }
                : { task, preset, ...result },
            );
          }
          return withWarnings(result.threadId, warnings);
        });
      },
    }),

    attach: cliCommand({
      summary: "Attach an existing agent thread to a task",
      positionals: [KEY_POSITIONAL],
      options: {
        thread: {
          type: "string",
          placeholder: "thread-id",
          aliases: ["thread-id"],
          description: "Thread to attach; defaults to BB_THREAD_ID or the invoking thread",
        },
        json: JSON_OPTION,
      },
      run(input, ctx) {
        return guard(async () => {
          const task = await resolveTask(domain, input.positionals["key-or-id"]);
          const threadId = resolveInvokingThreadId(input.options.thread, ctx);
          const result = delegationRpcContract.taskThreadsAttach.output.parse(
            await delegationHandlers(bb, store).taskThreadsAttach(
              delegationRpcContract.taskThreadsAttach.input.parse({
                taskId: task.id,
                threadId,
              }),
            ),
          );
          return input.options.json
            ? JSON.stringify({ task, ...result })
            : `Attached ${result.threadId} to ${task.key}`;
        });
      },
    }),

    detach: cliCommand({
      summary: "Detach an agent thread from a task",
      positionals: [KEY_POSITIONAL],
      options: {
        thread: {
          type: "string",
          placeholder: "thread-id",
          aliases: ["thread-id"],
          description: "Thread to detach; defaults to BB_THREAD_ID or the invoking thread",
        },
        json: JSON_OPTION,
      },
      run(input, ctx) {
        return guard(async () => {
          const task = await resolveTask(domain, input.positionals["key-or-id"]);
          const threadId = resolveInvokingThreadId(input.options.thread, ctx);
          const result = delegationRpcContract.taskThreadsDetach.output.parse(
            await delegationHandlers(bb, store).taskThreadsDetach(
              delegationRpcContract.taskThreadsDetach.input.parse({
                taskId: task.id,
                threadId,
              }),
            ),
          );
          return input.options.json
            ? JSON.stringify({ task, ...result })
            : `Detached ${result.threadId} from ${task.key}`;
        });
      },
    }),

    threads: cliCommand({
      summary: "List agent threads attached to a task",
      positionals: [KEY_POSITIONAL],
      options: { json: JSON_OPTION },
      run(input) {
        return guard(async () => {
          const task = await resolveTask(domain, input.positionals["key-or-id"]);
          const result = tasksRpcContract.listTaskThreads.output.parse(
            await domain.listTaskThreads(
              tasksRpcContract.listTaskThreads.input.parse({
                taskId: task.id,
              }),
            ),
          );
          return input.options.json
            ? JSON.stringify({ task, taskThreads: result.taskThreads })
            : table(
                ["THREAD", "STATUS", "PRESET", "TITLE"],
                result.taskThreads.map((thread) => [
                  thread.threadId,
                  thread.liveStatus,
                  thread.presetName,
                  thread.title,
                ]),
                "No attached threads.",
              );
        });
      },
    }),
  };
}
