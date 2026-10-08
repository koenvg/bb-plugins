import { resolve } from "node:path";
import { cliCommand, type BbPluginApi } from "@get-bb/plugin-sdk";
import type { TasksApiStore } from "../api";
import { publishAttachmentChanged, saveAttachmentFromBytes } from "../attachments";
import {
  tasksRpcContract,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Attachment,
  type Task,
  type TaskDependencyRef,
  type TaskMutationResult,
  type Label,
  type Project,
} from "../shared/contract";
import { errorMessage } from "../shared/errors";
import { TASK_SORTS, TASKS_PAGE_DEFAULT_LIMIT, TASKS_PAGE_MAX_LIMIT } from "../shared/pagination";
import {
  CliError,
  JSON_OPTION,
  PROJECT_OPTION,
  MACHINE_OPTION,
  KEY_POSITIONAL,
  guard,
  withWarnings,
  taskAuthor,
  type TasksDomain,
} from "./common";
import {
  selectedProject,
  listProjects,
  resolveProject,
  resolveTask,
  resolveTaskIds,
  projectLabels,
  resolveLabel,
} from "./boundary";
import {
  resolveClientHostId,
  readAttachmentSource,
  readTextOption,
  attachmentFileName,
} from "./client-files";
import { bytes, detail, table } from "./format";

const ACTIVE_THREAD_STATUSES = new Set(["starting", "working"]);

type ListTasksInput = Parameters<TasksDomain["listTasks"]>[0];

function unwrapTask(result: TaskMutationResult): Task {
  if (!result.ok) throw new CliError(result.error.message);
  return result.task;
}

function dependencyTable(refs: readonly TaskDependencyRef[]): string {
  return table(
    ["KEY", "STATUS", "TITLE"],
    refs.map((ref) => [ref.key, ref.status, ref.title]),
    "(none)",
  );
}

function openBlockerKeys(task: Task): string[] {
  return (task.blockedBy ?? [])
    .filter((ref) => ref.status !== "done" && ref.status !== "canceled")
    .map((ref) => ref.key);
}

async function listAllTasks(domain: TasksDomain, input: ListTasksInput): Promise<Task[]> {
  const tasks: Task[] = [];
  let cursor = input.cursor;
  do {
    const page = tasksRpcContract.listTasks.output.parse(
      await domain.listTasks(
        tasksRpcContract.listTasks.input.parse({
          ...input,
          limit: TASKS_PAGE_MAX_LIMIT,
          ...(cursor === undefined ? {} : { cursor }),
        }),
      ),
    );
    tasks.push(...page.tasks);
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return tasks;
}

async function labelsForTaskList(
  domain: TasksDomain,
  projects: readonly Project[],
): Promise<Map<string, Label>> {
  const labels = new Map<string, Label>();
  for (const project of projects) {
    for (const label of await projectLabels(domain, project.id)) {
      labels.set(label.id, label);
    }
  }
  return labels;
}

export function taskCommands(bb: BbPluginApi, store: TasksApiStore, domain: TasksDomain) {
  return {
    create: cliCommand({
      summary: "Create a task",
      unexpectedPositionalHint: "the task title belongs in --title <title>.",
      options: {
        project: PROJECT_OPTION,
        title: {
          type: "string",
          required: true,
          aliases: ["name", "subject"],
          description: "Task title",
        },
        description: {
          type: "string",
          placeholder: "markdown",
          aliases: ["body", "details", "text", "content"],
          description: "Markdown description; use --description-file for long text",
        },
        "description-file": {
          type: "string",
          placeholder: "path",
          description: "Read the description from this UTF-8 file on the invoking machine",
        },
        priority: {
          type: "enum",
          values: TASK_PRIORITIES,
          default: "none",
          description: "Task priority",
        },
        label: {
          type: "string",
          repeatable: true,
          split: ",",
          placeholder: "name",
          aliases: ["labels"],
          description: "Existing label name; repeat the flag or pass a comma-separated list",
        },
        due: {
          type: "string",
          placeholder: "YYYY-MM-DD",
          aliases: ["due-date"],
          description: "Due date as a calendar date, YYYY-MM-DD",
        },
        parent: {
          type: "string",
          placeholder: "key-or-id",
          description: "Parent task key or id; tasks support at most one level of sub-tasks",
        },
        attach: {
          type: "string",
          repeatable: true,
          placeholder: "path",
          aliases: ["file", "attachment"],
          description:
            "File to attach, repeatable; read from the invoking machine, at most 25 MB each",
        },
        machine: MACHINE_OPTION,
        json: JSON_OPTION,
      },
      constraints: [
        {
          kind: "at-most-one",
          options: ["description", "description-file"],
        },
      ],
      run(input, ctx) {
        return guard(async () => {
          const attachPaths = input.options.attach.map((path) =>
            resolve(ctx.cwd ?? process.cwd(), path),
          );
          const descriptionFile = input.options["description-file"];
          const usesClientFiles = attachPaths.length > 0 || descriptionFile !== undefined;
          if (input.options.machine !== undefined && !usesClientFiles) {
            throw new CliError("--machine requires --attach or --description-file");
          }
          const clientHostId = usesClientFiles
            ? await resolveClientHostId(bb, domain, input.options.machine, ctx)
            : undefined;
          const attachSources: Array<{ path: string; bytes: Buffer }> = [];
          for (const path of attachPaths) {
            attachSources.push({
              path,
              bytes: await readAttachmentSource(bb, clientHostId, path),
            });
          }
          const project = await selectedProject(domain, ctx, input.options.project, true);
          if (!project) throw new CliError("project is required");
          const labels = await projectLabels(domain, project.id);
          const labelIds = input.options.label.map((name) => resolveLabel(labels, name).id);
          const parentAddress = input.options.parent;
          const parent = parentAddress ? await resolveTask(domain, parentAddress) : undefined;
          const created = tasksRpcContract.createTask.input.parse({
            projectId: project.id,
            title: input.options.title,
            description:
              (await readTextOption(
                bb,
                ctx,
                clientHostId,
                input.options.description,
                descriptionFile,
              )) ?? "",
            priority: input.options.priority,
            dueDate: input.options.due ?? null,
            parentTaskId: parent?.id ?? null,
            labelIds,
          });
          const task = unwrapTask(
            tasksRpcContract.createTask.output.parse(await domain.createTask(created)),
          );
          const attachments: Attachment[] = [];
          const failedAttachments: Array<{ path: string; error: string }> = [];
          for (const source of attachSources) {
            try {
              const attachment = await saveAttachmentFromBytes(store.tasks, source.bytes, {
                taskId: task.id,
                fileName: attachmentFileName(source.path),
              });
              publishAttachmentChanged(bb, store.tasks, attachment);
              attachments.push(attachment);
            } catch (error) {
              failedAttachments.push({
                path: source.path,
                error: errorMessage(error),
              });
            }
          }
          const stdout = input.options.json
            ? JSON.stringify({ task, attachments, failedAttachments })
            : [
                `Created ${task.key}  ${task.title}`,
                ...attachments.map(
                  (attachment) => `Attached ${attachment.fileName}  ${attachment.id}`,
                ),
                ...failedAttachments.map(
                  (entry) => `Failed to attach ${entry.path}: ${entry.error}`,
                ),
                ...failedAttachments.map(
                  (entry) => `Retry with: bb tasks attachment add ${task.key} --file ${entry.path}`,
                ),
              ].join("\n");
          if (failedAttachments.length === 0) return stdout;
          return {
            exitCode: 1,
            stdout,
            stderr: `created ${task.key}, but ${failedAttachments.length} of ${attachPaths.length} attachments failed; see stdout for per-file recovery commands`,
          };
        });
      },
    }),

    list: cliCommand({
      summary: "List and filter tasks",
      options: {
        project: PROJECT_OPTION,
        status: {
          type: "enum",
          values: TASK_STATUSES,
          repeatable: true,
          split: ",",
          aliases: ["statuses", "state"],
          description:
            "Keep only these workflow statuses; repeat the flag or pass a comma-separated list",
        },
        priority: {
          type: "enum",
          values: TASK_PRIORITIES,
          repeatable: true,
          split: ",",
          aliases: ["priorities"],
          description: "Keep only these priorities; repeat the flag or pass a comma-separated list",
        },
        label: {
          type: "string",
          repeatable: true,
          split: ",",
          placeholder: "name",
          aliases: ["labels"],
          description: "Keep only tasks carrying these label names; repeat or comma-separate",
        },
        active: {
          type: "boolean",
          description: "Keep only tasks with a live agent thread",
        },
        ready: {
          type: "boolean",
          description: "Keep only tasks with no open blocker",
        },
        blocked: {
          type: "boolean",
          description: "Keep only tasks with an open blocker",
        },
        search: {
          type: "string",
          placeholder: "query",
          aliases: ["query", "q"],
          description: "Match title and description text",
        },
        sort: {
          type: "enum",
          values: TASK_SORTS,
          default: "manual",
          description: "Row order",
        },
        limit: {
          type: "integer",
          min: 1,
          max: TASKS_PAGE_MAX_LIMIT,
          default: TASKS_PAGE_DEFAULT_LIMIT,
          description: "Rows per page",
        },
        cursor: {
          type: "string",
          placeholder: "opaque",
          description: "Continue from a previous page's nextCursor with identical filters",
        },
        json: JSON_OPTION,
      },
      constraints: [{ kind: "at-most-one", options: ["ready", "blocked"] }],
      run(input, ctx) {
        return guard(async () => {
          const project = await selectedProject(domain, ctx, input.options.project, false);
          const projects = project ? [project] : await listProjects(domain);
          const labelById = await labelsForTaskList(domain, projects);
          const labelIds = input.options.label.map((name) => {
            const matches = [...labelById.values()].filter(
              (label) => label.name.toLowerCase() === name.trim().toLowerCase(),
            );
            if (matches.length === 0) {
              throw new CliError(`label not found: ${name}`, {
                code: "label_not_found",
              });
            }
            if (matches.length > 1 && !project) {
              throw new CliError(
                `label name exists in multiple projects; pass --project: ${name}`,
                { code: "label_ambiguous" },
              );
            }
            return matches[0]!.id;
          });
          const limit = input.options.limit;
          const result = tasksRpcContract.listTasks.output.parse(
            await domain.listTasks(
              tasksRpcContract.listTasks.input.parse({
                projectId: project?.id,
                statuses: input.options.status.length > 0 ? input.options.status : undefined,
                priorities: input.options.priority.length > 0 ? input.options.priority : undefined,
                labelIds: labelIds.length > 0 ? labelIds : undefined,
                activeOnly: input.options.active,
                search: input.options.search,
                dependency: input.options.ready
                  ? "ready"
                  : input.options.blocked
                    ? "blocked"
                    : undefined,
                sort: input.options.sort,
                limit,
                cursor: input.options.cursor,
              }),
            ),
          );
          const tasks = [];
          for (const task of result.tasks) {
            const threadResult = tasksRpcContract.listTaskThreads.output.parse(
              await domain.listTaskThreads(
                tasksRpcContract.listTaskThreads.input.parse({
                  taskId: task.id,
                }),
              ),
            );
            tasks.push({
              ...task,
              labels: task.labelIds.map((id) => labelById.get(id)?.name ?? id),
              agentsWorking: threadResult.taskThreads.filter((thread) =>
                ACTIVE_THREAD_STATUSES.has(thread.liveStatus),
              ).length,
            });
          }
          if (input.options.json) {
            return JSON.stringify({
              tasks,
              nextCursor: result.nextCursor,
              limit,
            });
          }
          const output = table(
            ["KEY", "STATUS", "PRIORITY", "DUE", "TITLE", "LABELS", "AGENTS", "BLOCKED BY"],
            tasks.map((task) => [
              task.key,
              task.status,
              task.priority,
              task.dueDate ?? "-",
              task.title,
              task.labels.join(", ") || "-",
              task.agentsWorking,
              openBlockerKeys(task).join(", ") || "-",
            ]),
            "No tasks.",
          );
          return result.nextCursor === null
            ? output
            : `${output}\n\nMore results are available. Re-run with the same filters and add: --limit ${limit} --cursor ${result.nextCursor}`;
        });
      },
    }),

    show: cliCommand({
      summary: "Show full task details",
      aliases: ["get"],
      suggestFor: ["view", "read", "info", "detail", "details", "describe"],
      positionals: [KEY_POSITIONAL],
      options: { json: JSON_OPTION },
      run(input) {
        return guard(async () => {
          const task = await resolveTask(domain, input.positionals["key-or-id"]);
          const project = await resolveProject(domain, task.projectId);
          const allLabels = await projectLabels(domain, project.id);
          const labelById = new Map(allLabels.map((label) => [label.id, label]));
          const labels = task.labelIds.map((id) => labelById.get(id)!).filter(Boolean);
          const subtasks = await listAllTasks(
            domain,
            tasksRpcContract.listTasks.input.parse({
              parentTaskId: task.id,
            }),
          );
          const comments = tasksRpcContract.listComments.output.parse(
            await domain.listComments(
              tasksRpcContract.listComments.input.parse({
                taskId: task.id,
              }),
            ),
          ).comments;
          const attachments = store.tasks.listTaskAttachments(task.id);
          const taskThreads = tasksRpcContract.listTaskThreads.output.parse(
            await domain.listTaskThreads(
              tasksRpcContract.listTaskThreads.input.parse({
                taskId: task.id,
              }),
            ),
          ).taskThreads;
          const { pullRequests, unavailableThreadIds } =
            tasksRpcContract.listTaskPullRequests.output.parse(
              await domain.listTaskPullRequests(
                tasksRpcContract.listTaskPullRequests.input.parse({
                  taskId: task.id,
                }),
              ),
            );
          if (input.options.json) {
            return JSON.stringify({
              task,
              project,
              labels,
              blockedBy: task.blockedBy ?? [],
              blocks: task.blocks ?? [],
              blocked: task.blocked ?? false,
              subtasks,
              attachments,
              taskThreads,
              pullRequests,
              pullRequestUnavailableThreadIds: unavailableThreadIds,
              comments,
            });
          }
          return [
            detail([
              ["Task", `${task.key} — ${task.title}`],
              ["ID", task.id],
              ["Project", `${project.prefix} — ${project.name}`],
              ["Status", task.status],
              ["Blocked", task.blocked ? `yes, by ${openBlockerKeys(task).join(", ")}` : "no"],
              ["Priority", task.priority],
              ["Due", task.dueDate ?? "-"],
              ["Parent", task.parentTaskId ?? "-"],
              ["Labels", labels.map((label) => label.name).join(", ") || "-"],
              ["Created", task.createdAt],
              ["Updated", task.updatedAt],
            ]),
            `Description\n${task.description || "(none)"}`,
            `Blocked by\n${dependencyTable(task.blockedBy ?? [])}`,
            `Blocks\n${dependencyTable(task.blocks ?? [])}`,
            `Sub-tasks\n${table(
              ["KEY", "STATUS", "PRIORITY", "TITLE"],
              subtasks.map((subtask) => [
                subtask.key,
                subtask.status,
                subtask.priority,
                subtask.title,
              ]),
              "(none)",
            )}`,
            `Attachments\n${table(
              ["ID", "NAME", "SIZE"],
              attachments.map((attachment) => [
                attachment.id,
                attachment.fileName,
                bytes(attachment.sizeBytes),
              ]),
              "(none)",
            )}`,
            `Attached threads\n${table(
              ["THREAD", "STATUS", "PRESET", "TITLE"],
              taskThreads.map((thread) => [
                thread.threadId,
                thread.liveStatus,
                thread.presetName,
                thread.title,
              ]),
              "(none)",
            )}`,
            `Pull requests\n${table(
              ["PR", "STATE", "TITLE", "URL"],
              pullRequests.map((pullRequest) => [
                `#${pullRequest.number}`,
                pullRequest.state,
                pullRequest.title,
                pullRequest.url,
              ]),
              "(none)",
            )}${
              unavailableThreadIds.length > 0
                ? `\nPR lookup unavailable for: ${unavailableThreadIds.join(", ")}`
                : ""
            }`,
            `Comments\n${table(
              ["TIME", "KIND", "AUTHOR", "PROVIDER", "BODY"],
              comments.map((comment) => [
                comment.createdAt,
                comment.kind,
                comment.threadTitle ?? comment.authorName,
                comment.provider?.name ?? "-",
                comment.body,
              ]),
              "(none)",
            )}`,
          ].join("\n\n");
        });
      },
    }),

    update: cliCommand({
      summary: "Update task fields and labels",
      positionals: [KEY_POSITIONAL],
      options: {
        status: {
          type: "enum",
          values: TASK_STATUSES,
          aliases: ["state"],
          description:
            "New workflow status; in_review when implementation needs review, done when the criteria are met",
        },
        priority: {
          type: "enum",
          values: TASK_PRIORITIES,
          description: "New priority",
        },
        title: {
          type: "string",
          aliases: ["name", "subject"],
          description: "New title",
        },
        description: {
          type: "string",
          placeholder: "markdown",
          aliases: ["body", "details", "text", "content"],
          description: "Replacement markdown description; use --description-file for long text",
        },
        "description-file": {
          type: "string",
          placeholder: "path",
          description:
            "Read the replacement description from this UTF-8 file on the invoking machine",
        },
        due: {
          type: "string",
          placeholder: "YYYY-MM-DD",
          aliases: ["due-date"],
          description: "New due date as a calendar date, YYYY-MM-DD",
        },
        "no-due": { type: "boolean", description: "Clear the due date" },
        parent: {
          type: "string",
          placeholder: "key-or-id",
          description: "New parent task key or id; tasks support at most one level of sub-tasks",
        },
        "no-parent": {
          type: "boolean",
          description: "Promote the task to the top level",
        },
        "add-label": {
          type: "string",
          repeatable: true,
          split: ",",
          placeholder: "name",
          description: "Existing label name to add; repeat or comma-separate",
        },
        "remove-label": {
          type: "string",
          repeatable: true,
          split: ",",
          placeholder: "name",
          description: "Label name to remove; repeat or comma-separate",
        },
        "blocked-by": {
          type: "string",
          repeatable: true,
          split: ",",
          placeholder: "key-or-id",
          description: "Task that must be done before this task; repeat or comma-separate",
        },
        "unblocked-by": {
          type: "string",
          repeatable: true,
          split: ",",
          placeholder: "key-or-id",
          description: "Remove this task from the blockers; repeat or comma-separate",
        },
        machine: MACHINE_OPTION,
        json: JSON_OPTION,
      },
      constraints: [
        {
          kind: "at-most-one",
          options: ["description", "description-file"],
        },
        { kind: "at-most-one", options: ["due", "no-due"] },
        { kind: "at-most-one", options: ["parent", "no-parent"] },
        {
          kind: "requires",
          option: "machine",
          needs: ["description-file"],
        },
      ],
      run(input, ctx) {
        return guard(async () => {
          const task = await resolveTask(domain, input.positionals["key-or-id"]);
          const dueDate = input.options.due;
          const noDue = input.options["no-due"];
          const parentAddress = input.options.parent;
          const noParent = input.options["no-parent"];
          const parent =
            parentAddress === undefined ? undefined : await resolveTask(domain, parentAddress);
          const descriptionFile = input.options["description-file"];
          const clientHostId =
            descriptionFile !== undefined
              ? await resolveClientHostId(bb, domain, input.options.machine, ctx)
              : undefined;
          const description = await readTextOption(
            bb,
            ctx,
            clientHostId,
            input.options.description,
            descriptionFile,
          );
          const labels = await projectLabels(domain, task.projectId);
          const nextLabels = new Set(task.labelIds);
          for (const name of input.options["add-label"]) {
            nextLabels.add(resolveLabel(labels, name).id);
          }
          for (const name of input.options["remove-label"]) {
            nextLabels.delete(resolveLabel(labels, name).id);
          }
          const labelsChanged =
            input.options["add-label"].length > 0 || input.options["remove-label"].length > 0;
          const addBlockerTaskIds = await resolveTaskIds(domain, input.options["blocked-by"]);
          const removeBlockerTaskIds = await resolveTaskIds(domain, input.options["unblocked-by"]);
          if (
            input.options.status === undefined &&
            input.options.priority === undefined &&
            input.options.title === undefined &&
            description === undefined &&
            dueDate === undefined &&
            !noDue &&
            parentAddress === undefined &&
            !noParent &&
            !labelsChanged &&
            addBlockerTaskIds.length === 0 &&
            removeBlockerTaskIds.length === 0
          ) {
            throw new CliError("no task changes were provided", {
              code: "no_changes",
            });
          }
          const result = tasksRpcContract.updateTask.output.parse(
            await domain.updateTask(
              tasksRpcContract.updateTask.input.parse({
                taskId: task.id,
                status: input.options.status,
                priority: input.options.priority,
                title: input.options.title,
                description,
                dueDate: noDue ? null : dueDate,
                parentTaskId:
                  parentAddress === undefined && !noParent ? undefined : (parent?.id ?? null),
                labelIds: labelsChanged ? [...nextLabels] : undefined,
                addBlockerTaskIds,
                removeBlockerTaskIds,
                authorName: taskAuthor(ctx),
              }),
            ),
          );
          const updated = unwrapTask(result);
          const warnings = result.ok ? (result.warnings ?? []) : [];
          if (input.options.json) {
            return JSON.stringify(
              warnings.length > 0 ? { task: updated, warnings } : { task: updated },
            );
          }
          return withWarnings(`Updated ${updated.key}  ${updated.title}`, warnings);
        });
      },
    }),
  };
}
