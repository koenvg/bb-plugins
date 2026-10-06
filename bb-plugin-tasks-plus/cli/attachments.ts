import { resolve } from "node:path";
import { cliCommand, type BbPluginApi } from "@get-bb/plugin-sdk";
import type { TasksApiStore } from "../api";
import {
  publishAttachmentChanged,
  readAttachmentContent,
  saveAttachmentFromBytes,
} from "../attachments";
import { tasksRpcContract, ULID_PATTERN, type Attachment } from "../shared/contract";
import { attachmentDownloadUrl } from "../shared/attachments";
import {
  CliError,
  JSON_OPTION,
  MACHINE_OPTION,
  KEY_POSITIONAL,
  guard,
  groupCommand,
  type TasksDomain,
} from "./common";
import { resolveTask } from "./boundary";
import {
  resolveClientHostId,
  readAttachmentSource,
  writeClientFile,
  attachmentFileName,
} from "./client-files";
import { bytes, table } from "./format";

async function listTaskAttachments(
  domain: TasksDomain,
  taskId: string,
  comments: readonly { id: string }[],
): Promise<Attachment[]> {
  const attachments = [
    ...tasksRpcContract.listAttachments.output.parse(
      await domain.listAttachments(tasksRpcContract.listAttachments.input.parse({ taskId })),
    ).attachments,
  ];
  for (const comment of comments) {
    attachments.push(
      ...tasksRpcContract.listAttachments.output.parse(
        await domain.listAttachments(
          tasksRpcContract.listAttachments.input.parse({
            commentId: comment.id,
          }),
        ),
      ).attachments,
    );
  }
  return attachments;
}

export function attachmentCommands(bb: BbPluginApi, store: TasksApiStore, domain: TasksDomain) {
  return {
    attachment: groupCommand("attachment", "Add, download, list, or remove task attachments", [
      ["add", "Attach a file to a task or comment"],
      ["get", "Download an attachment to a path"],
      ["list", "List a task's attachments"],
      ["remove", "Remove an attachment"],
    ]),
    "attachment add": cliCommand({
      summary: "Attach a file to a task or comment",
      description:
        "File paths are read from the invoking machine: the thread's machine inside an agent thread, otherwise the server's.",
      positionals: [
        {
          name: "key-or-comment-id",
          description: "Task key such as ABC-12, a task ULID, or a comment ULID",
          required: true,
        },
      ],
      options: {
        file: {
          type: "string",
          required: true,
          placeholder: "path",
          aliases: ["path", "attach"],
          description: "Source file to upload, at most 25 MB",
        },
        name: {
          type: "string",
          description: "Stored file name; defaults to the source basename",
        },
        machine: MACHINE_OPTION,
        json: JSON_OPTION,
      },
      run(input, ctx) {
        return guard(async () => {
          const ownerAddress = input.positionals["key-or-comment-id"];
          const sourcePath = resolve(ctx.cwd ?? process.cwd(), input.options.file);
          const normalizedOwner = ownerAddress.trim().toUpperCase();
          const comment = ULID_PATTERN.test(normalizedOwner)
            ? store.tasks.getComment(normalizedOwner)
            : undefined;
          if (ULID_PATTERN.test(normalizedOwner) && !comment) {
            throw new CliError(`comment not found: ${ownerAddress}`, {
              code: "comment_not_found",
            });
          }
          const owner = comment
            ? { commentId: comment.id }
            : { taskId: (await resolveTask(domain, ownerAddress)).id };
          const clientHostId = await resolveClientHostId(bb, domain, input.options.machine, ctx);
          const content = await readAttachmentSource(bb, clientHostId, sourcePath);
          const attachment = await saveAttachmentFromBytes(store.tasks, content, {
            ...owner,
            fileName: input.options.name ?? attachmentFileName(sourcePath),
          });
          publishAttachmentChanged(bb, store.tasks, attachment);
          return input.options.json
            ? JSON.stringify({
                attachment,
                url: attachmentDownloadUrl(attachment.id),
              })
            : `Added attachment ${attachment.fileName}  ${attachment.id}`;
        });
      },
    }),
    "attachment get": cliCommand({
      summary: "Download an attachment to a path",
      description:
        "The file is written on the invoking machine: the thread's machine inside an agent thread, otherwise the server's.",
      positionals: [
        {
          name: "attachment-id",
          description: "Attachment ULID from bb tasks attachment list",
          required: true,
        },
      ],
      options: {
        out: {
          type: "string",
          required: true,
          placeholder: "path",
          short: "o",
          aliases: ["output", "to"],
          description: "Destination path; missing parent directories are created",
        },
        machine: MACHINE_OPTION,
        json: JSON_OPTION,
      },
      run(input, ctx) {
        return guard(async () => {
          const outPath = resolve(ctx.cwd ?? process.cwd(), input.options.out);
          const clientHostId = await resolveClientHostId(bb, domain, input.options.machine, ctx);
          const { attachment, content } = await readAttachmentContent(
            store.tasks,
            input.positionals["attachment-id"],
          );
          await writeClientFile(bb, clientHostId, outPath, content);
          return input.options.json
            ? JSON.stringify({ attachment, out: outPath })
            : `Saved ${attachment.fileName}  ${outPath}`;
        });
      },
    }),
    "attachment list": cliCommand({
      summary: "List a task's attachments",
      positionals: [KEY_POSITIONAL],
      options: { json: JSON_OPTION },
      run(input) {
        return guard(async () => {
          const task = await resolveTask(domain, input.positionals["key-or-id"]);
          const comments = tasksRpcContract.listComments.output.parse(
            await domain.listComments(
              tasksRpcContract.listComments.input.parse({
                taskId: task.id,
              }),
            ),
          ).comments;
          const attachments = await listTaskAttachments(domain, task.id, comments);
          return input.options.json
            ? JSON.stringify({ task, attachments })
            : table(
                ["ID", "NAME", "TYPE", "SIZE"],
                attachments.map((attachment) => [
                  attachment.id,
                  attachment.fileName,
                  attachment.mime,
                  bytes(attachment.sizeBytes),
                ]),
                "No attachments.",
              );
        });
      },
    }),
    "attachment remove": cliCommand({
      summary: "Remove an attachment",
      positionals: [
        {
          name: "attachment-id",
          description: "Attachment ULID from bb tasks attachment list",
          required: true,
        },
      ],
      options: {
        "remove-references": {
          type: "boolean",
          description: "Also strip the attachment's links from the task description",
        },
        json: JSON_OPTION,
      },
      run(input) {
        return guard(async () => {
          const attachmentId = input.positionals["attachment-id"];
          const result = tasksRpcContract.deleteAttachment.output.parse(
            await domain.deleteAttachment(
              tasksRpcContract.deleteAttachment.input.parse({
                attachmentId: attachmentId.trim(),
                removeDescriptionReferences: input.options["remove-references"],
              }),
            ),
          );
          if (!result.ok) throw new CliError(result.error.message);
          if (!result.deleted) {
            throw new CliError(`attachment not found: ${attachmentId}`, {
              code: "attachment_not_found",
            });
          }
          return input.options.json
            ? JSON.stringify({
                deleted: true,
                attachment: result.attachment,
              })
            : `Removed attachment ${result.attachment.fileName}  ${result.attachment.id}`;
        });
      },
    }),
  };
}

export { listTaskAttachments };
