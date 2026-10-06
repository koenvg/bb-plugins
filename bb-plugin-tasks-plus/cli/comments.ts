import { cliCommand, type BbPluginApi } from "@get-bb/plugin-sdk";
import { createComment, type TasksApiStore } from "../api";
import {
  CliError,
  JSON_OPTION,
  MACHINE_OPTION,
  KEY_POSITIONAL,
  guard,
  taskAuthor,
  type TasksDomain,
} from "./common";
import { resolveTask } from "./boundary";
import { resolveClientHostId, readTextOption } from "./client-files";

export function commentCommands(bb: BbPluginApi, store: TasksApiStore, domain: TasksDomain) {
  return {
    comment: cliCommand({
      summary: "Add a markdown comment to a task",
      positionals: [KEY_POSITIONAL],
      options: {
        body: {
          type: "string",
          placeholder: "markdown",
          aliases: ["message", "text", "content"],
          description: "Comment markdown; use --body-file for long text (exactly one of the two)",
        },
        "body-file": {
          type: "string",
          placeholder: "path",
          description: "Read the comment from this UTF-8 file on the invoking machine",
        },
        author: {
          type: "string",
          placeholder: "name",
          description: "Display name for the comment; defaults to the invoking thread or cli",
        },
        notify: {
          type: "boolean",
          description: "Deliver the comment to the thread that wrote the task's latest agent reply",
        },
        machine: MACHINE_OPTION,
        json: JSON_OPTION,
      },
      constraints: [
        { kind: "exactly-one", options: ["body", "body-file"] },
        { kind: "requires", option: "machine", needs: ["body-file"] },
      ],
      run(input, ctx) {
        return guard(async () => {
          const task = await resolveTask(domain, input.positionals["key-or-id"]);
          const bodyFile = input.options["body-file"];
          const clientHostId =
            bodyFile !== undefined
              ? await resolveClientHostId(bb, domain, input.options.machine, ctx)
              : undefined;
          const body = await readTextOption(bb, ctx, clientHostId, input.options.body, bodyFile);
          if (body === undefined) {
            throw new CliError("missing required --body or --body-file", {
              code: "missing_required",
            });
          }
          if (!body.trim()) {
            throw new CliError("comment body must not be blank");
          }
          const comment = await createComment(bb, store, {
            taskId: task.id,
            kind: ctx.threadId ? "agent" : "user",
            authorName: input.options.author ?? taskAuthor(ctx),
            presetName: null,
            threadId: ctx.threadId ?? null,
            body,
            notify: input.options.notify,
          });
          return input.options.json
            ? JSON.stringify({ comment })
            : `Commented on ${task.key}  ${comment.id}`;
        });
      },
    }),
  };
}
