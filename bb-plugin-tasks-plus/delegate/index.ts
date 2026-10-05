import type { BbPluginApi, PluginRpcHandlers } from "@get-bb/plugin-sdk";
import { z } from "zod";
import type {
  Attachment,
  Comment,
  Preset,
  Project,
  Task,
  TasksStore,
  TaskThreadLiveStatus,
} from "../db";
import { publishCommentsChanged, publishTasksChanged, type TasksApiStore } from "../api";
import {
  presetPermissionModeSchema,
  presetReasoningLevelSchema,
  presetServiceTierSchema,
  type ThreadsChangedEvent,
} from "../shared/contract";
import { errorMessage } from "../shared/errors";
import { truncateToWidth } from "../shared/text-measure";
import { delegationRpcContract } from "./contract";

const MAX_DELEGATED_THREAD_TITLE_WIDTH = 120;
const SYSTEM_AUTHOR_NAME = "Tasks";
const MANUAL_PRESET_NAME = "Attached";

const presetExecutionSchema = z
  .object({
    providerId: z.string().trim().min(1),
    model: z.string().trim().min(1),
    reasoningLevel: presetReasoningLevelSchema,
    serviceTier: presetServiceTierSchema.nullable(),
    permissionMode: presetPermissionModeSchema,
  })
  .strict();

type DelegationErrorCode = "project_not_linked" | "spawn_target_invalid";

class DelegationError extends Error {
  constructor(
    readonly code: DelegationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DelegationError";
  }
}

interface SeedPromptInput {
  task: Task;
  project: Project;
  subtasks: readonly Task[];
  blockers: readonly Task[];
  attachments: readonly Pick<Attachment, "id" | "fileName">[];
  recentComments: readonly Comment[];
  presetInstructions: string;
  extraInstructions?: string;
  attachmentPending?: boolean;
}

function markdownSection(title: string, body: string): string {
  return `## ${title}\n\n${body}`;
}

function formatTaskRefs(tasks: readonly Task[]): string {
  if (tasks.length === 0) return "None.";
  return tasks.map((task) => `- ${task.key} · ${task.title} (${task.status})`).join("\n");
}

function formatAttachments(attachments: readonly Pick<Attachment, "id" | "fileName">[]): string {
  if (attachments.length === 0) return "None.";
  return attachments
    .map(
      (attachment) =>
        `- ${attachment.fileName} · ${attachment.id}\n` +
        `  Fetch with: bb tasks attachment get ${attachment.id} --out <path>`,
    )
    .join("\n");
}

function formatComments(comments: readonly Comment[]): string {
  if (comments.length === 0) return "None.";
  return comments
    .map(
      (comment) =>
        `### ${comment.authorName} · ${comment.kind} · ${comment.createdAt}\n\n${comment.body}`,
    )
    .join("\n\n");
}

export function buildSeedPrompt(input: SeedPromptInput): string {
  const sections = [
    `# ${input.task.key} · ${input.task.title}`,
    markdownSection("Description", input.task.description.trim() || "No description provided."),
    markdownSection(
      "Project context",
      `- Name: ${input.project.name}\n- Linked bb project: ${input.project.linkedBbProjectId ?? "Not linked"}`,
    ),
    markdownSection("Blocked by", formatTaskRefs(input.blockers)),
    markdownSection("Sub-tasks", formatTaskRefs(input.subtasks)),
    markdownSection("Attachments", formatAttachments(input.attachments)),
    markdownSection("Recent comments", formatComments(input.recentComments)),
    markdownSection(
      "Report-back contract",
      [
        `You are working on task ${input.task.key}. ${input.attachmentPending ? "Local attachment can still be pending. Your creation metadata identifies the task and attempt." : "Your thread is already attached."} Use bb tasks comment ${input.task.key} --body ... for updates and attach result artifacts. Use bb tasks update ${input.task.key} --status in_review when required review remains; use done only when completion criteria are met.`,
        "At meaningful milestones, write one short result or current-state sentence, a blank line, and up to three flat Markdown bullets. Use plain language, real newlines, and one idea per bullet. Aim for 40-80 words; shorter updates are valid. Combine related changes and omit unchanged updates or command-by-command pings.",
        "Keep material limits visible even if the update must be longer. State the outcome, next step, and any blocker or exact decision needed and its effect. Briefly state relevant checks, including unrun or blocked checks; distinguish worker-reported results from checks you verified.",
        "Keep logs, file lists, full commit hashes, internal IDs, and detailed handoff evidence in the attached thread or an artifact. Link to the detail with supported task/thread, PR, or attachment links. Preserve exact commits and baselines in handoffs.",
        "An epic reports overall progress, current work, and the next dependency or decision; summarize a child result's effect rather than copying its report. A subtask reports its own result, checks, and remaining work.",
        "Only the agent already responsible for a parent refreshes its summary when handling a child completion, blocker change, or decision. Read current task state before posting. Treat unavailable or conflicting state as unknown. Count only done children as done. Child done counts do not prove epic acceptance; name remaining integration or acceptance work.",
        "Use only already authorized handoff routes. These rules add no polling, wakeups, coordinator, or permission to dispatch, restructure tasks, or approve work. --notify still targets the latest responding agent, not necessarily the parent. Leave historical comments, descriptions, presets, and previously delivered prompts unchanged.",
        "See the Tasks skill Reporting section for examples and safe multiline posting. This guidance uses the existing CLI and requires no orchestration run; it is not a server-enforced comment limit.",
        `Follow task ${input.task.key}, its linked specifications, acceptance criteria and applicable project instructions. Report explicit outcomes with native tasks_report using taskId ${input.task.id}: completed, review_ready, blocked, failed or needs_decision. Use a stable retry key, a bounded summary, an explicit question for needs_decision, typed result/evidence references and baseline references. Keep the returned report/comment IDs in your final output. Reports can be made during an active turn; idle activity is not task completion. Reporting does not change task status. Set status explicitly with bb tasks update ${input.task.key} --status in_review or --status done only when your ticket gates are met. For CLI/RPC reporting, issue a private file with native tasks_report_context; never print or attach its contents. CLI thread IDs are not report authority. If native reporting is unavailable, state the transport blocker and use an ordinary Tasks comment without claiming a durable report. ${input.attachmentPending ? "Local attachment can still be pending. The original authorized creation claim and native child facts must match before a report is accepted." : "Your thread is attached to the task."}`,
      ].join("\n"),
    ),
  ];

  if (input.presetInstructions.trim()) {
    sections.push(markdownSection("Preset instructions", input.presetInstructions.trim()));
  }
  if (input.extraInstructions?.trim()) {
    sections.push(markdownSection("Additional instructions", input.extraInstructions.trim()));
  }

  return `${sections.join("\n\n")}\n`;
}

function delegatedThreadTitle(task: Task): string {
  return truncateToWidth(`${task.key} · ${task.title}`, MAX_DELEGATED_THREAD_TITLE_WIDTH);
}

function requireTask(store: TasksStore, taskId: string): Task {
  const task = store.getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  return task;
}

function requireProject(store: TasksStore, projectId: string): Project {
  const project = store.getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return project;
}

function requirePreset(store: TasksStore, presetId: string): Preset {
  const preset = store.getPreset(presetId);
  if (!preset) throw new Error(`Preset not found: ${presetId}`);
  return preset;
}

function requireLinkedBbProject(project: Project): string {
  if (project.linkedBbProjectId) return project.linkedBbProjectId;
  throw new DelegationError(
    "project_not_linked",
    `Task project "${project.name}" is not linked to a bb project`,
  );
}

function collectAttachments(
  store: TasksStore,
  taskId: string,
  comments: readonly Comment[],
): Attachment[] {
  const attachments = new Map<string, Attachment>();
  for (const attachment of store.listAttachmentsForTask(taskId)) {
    attachments.set(attachment.id, attachment);
  }
  for (const comment of comments) {
    for (const attachment of store.listAttachmentsForComment(comment.id)) {
      attachments.set(attachment.id, attachment);
    }
  }
  return [...attachments.values()];
}

type SpawnEnvironment = Parameters<BbPluginApi["sdk"]["threads"]["spawn"]>[0]["environment"];

async function presetSpawnEnvironment(bb: BbPluginApi, preset: Preset): Promise<SpawnEnvironment> {
  if (preset.environmentKind === "project-default") {
    return { type: "project-default" };
  }

  const hostId = preset.machineId ?? (await bb.sdk.system.config()).primaryHostId;
  if (hostId === null) {
    throw new DelegationError(
      "spawn_target_invalid",
      "Could not create a worktree because BB has no default machine",
    );
  }
  return {
    type: "host",
    hostId,
    workspace: {
      type: "managed-worktree",
      baseBranch:
        preset.baseBranch === null
          ? { kind: "default" }
          : { kind: "named", name: preset.baseBranch },
    },
  };
}

function isBbHttpError(error: unknown): error is Error & { code: string | null; status: number } {
  return (
    error instanceof Error &&
    "code" in error &&
    (typeof error.code === "string" || error.code === null) &&
    "status" in error &&
    typeof error.status === "number"
  );
}

const SPAWN_TARGET_ERROR_CODES = new Set([
  "host_not_found",
  "host_unavailable",
  "invalid_request",
  "project_unavailable",
  "unsupported_host",
  "workspace_unavailable",
]);

function mapSpawnTargetError(error: unknown, preset: Preset): never {
  if (
    preset.environmentKind === "new-worktree" &&
    isBbHttpError(error) &&
    error.code !== null &&
    SPAWN_TARGET_ERROR_CODES.has(error.code)
  ) {
    const machine = preset.machineId ?? "the default machine";
    const branch = preset.baseBranch ?? "the default branch";
    const detail = error.message.replace(/^HTTP \d+:\s*/u, "");
    throw new DelegationError(
      "spawn_target_invalid",
      `Could not create a worktree on ${machine} from ${branch}: ${detail}`,
    );
  }
  throw error;
}

export function createSystemComment(
  store: TasksStore,
  input: {
    taskId: string;
    presetName: string;
    threadId: string;
    body: string;
  },
): void {
  store.createComment({
    taskId: input.taskId,
    kind: "system",
    authorName: SYSTEM_AUTHOR_NAME,
    presetName: input.presetName,
    threadId: input.threadId,
    body: input.body,
    notifiedCount: 0,
  });
}

export function publishThreadsChanged(bb: BbPluginApi, taskId: string): void {
  const payload: ThreadsChangedEvent = { taskId };
  bb.realtime.publish("threads:changed", payload);
}

type SdkThread = Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["get"]>>;

function taskThreadLiveStatus(thread: SdkThread): TaskThreadLiveStatus {
  if (thread.deletedAt != null) return "completed";
  switch (thread.status) {
    case "pending":
    case "starting":
      return "starting";
    case "active":
    case "stopping":
      return "working";
    case "idle":
      return "idle";
    case "error":
      return "failed";
  }
}

export function handlers(
  bb: BbPluginApi,
  store: TasksApiStore,
): PluginRpcHandlers<typeof delegationRpcContract> {
  return {
    async delegate(input) {
      const prepared = await prepareTaskWorker(
        bb,
        store.tasks,
        input.taskId,
        input.presetId,
        input.extraInstructions,
      );
      const { task, preset, args } = prepared;
      const title = args.title;
      const thread = await bb.sdk.threads
        .spawn(args)
        .catch((error: unknown) => mapSpawnTargetError(error, preset));

      const taskThread = store.transaction(() => {
        const attached = store.tasks.upsertTaskThread({
          taskId: task.id,
          threadId: thread.id,
          presetName: preset.name,
          title,
          liveStatus: "starting",
        });

        if (task.status === "backlog" || task.status === "todo") {
          store.tasks.updateTask(task.id, { status: "in_progress" });
          createSystemComment(store.tasks, {
            taskId: task.id,
            presetName: preset.name,
            threadId: thread.id,
            body: `Status changed to In Progress · dispatched to ${preset.name}`,
          });
        }

        createSystemComment(store.tasks, {
          taskId: task.id,
          presetName: preset.name,
          threadId: thread.id,
          body: `Dispatched to ${preset.name}`,
        });
        return attached;
      });

      try {
        const currentThread = await bb.sdk.threads.get({ threadId: thread.id });
        const currentLiveStatus = taskThreadLiveStatus(currentThread);
        if (currentLiveStatus !== taskThread.liveStatus) {
          store.tasks.updateTaskThreadStatus(taskThread.id, currentLiveStatus);
        }
      } catch (error) {
        bb.log.warn(
          `Could not read delegated thread ${thread.id} after attach: ${errorMessage(error)}`,
        );
      }

      publishThreadsChanged(bb, task.id);
      publishTasksChanged(bb, task.id, task.projectId);
      publishCommentsChanged(bb, task.id);
      return { threadId: thread.id };
    },

    async taskThreadsAttach(input) {
      const task = requireTask(store.tasks, input.taskId);
      const thread = await bb.sdk.threads.get({ threadId: input.threadId });
      const title = truncateToWidth(
        thread.title ?? thread.titleFallback ?? delegatedThreadTitle(task),
        MAX_DELEGATED_THREAD_TITLE_WIDTH,
      );

      store.tasks.upsertTaskThread({
        taskId: task.id,
        threadId: thread.id,
        presetName: MANUAL_PRESET_NAME,
        title,
        liveStatus: taskThreadLiveStatus(thread),
      });

      publishThreadsChanged(bb, task.id);
      publishTasksChanged(bb, task.id, task.projectId);
      return { threadId: thread.id };
    },

    async taskThreadsDetach(input) {
      const task = requireTask(store.tasks, input.taskId);
      const taskThread = store.tasks.getTaskThreadByThreadId(task.id, input.threadId);
      if (!taskThread) {
        throw new Error(`Thread ${input.threadId} is not attached to ${task.key}`);
      }
      store.tasks.deleteTaskThread(taskThread.id);

      publishThreadsChanged(bb, task.id);
      publishTasksChanged(bb, task.id, task.projectId);
      return { threadId: taskThread.threadId };
    },
  };
}

// Shared creation input. Orchestration adds durable claim and parent correlation;
// legacy delegation keeps its current warning and always-spawn behavior.
export async function prepareTaskWorker(
  bb: BbPluginApi,
  store: TasksStore,
  taskId: string,
  presetId: string,
  extraInstructions?: string,
  attachmentState: "attached" | "pending" = "attached",
) {
  const task = requireTask(store, taskId);
  const project = requireProject(store, task.projectId);
  const projectId = requireLinkedBbProject(project);
  const preset = requirePreset(store, presetId);
  const execution = presetExecutionSchema.parse({
    providerId: preset.providerId,
    model: preset.modelId,
    reasoningLevel: preset.reasoningLevel,
    serviceTier: preset.serviceTier,
    permissionMode: preset.permissionMode,
  });
  const comments = store.listComments(task.id);
  const prompt = buildSeedPrompt({
    task,
    project,
    subtasks: store.listSubtasks(task.id),
    blockers: store.listBlockers(task.id),
    attachments: collectAttachments(store, task.id, comments),
    recentComments: comments.slice(-5),
    presetInstructions: preset.instructions,
    extraInstructions,
    attachmentPending: attachmentState === "pending",
  });
  const args = {
    projectId,
    environment: await presetSpawnEnvironment(bb, preset),
    providerId: execution.providerId,
    model: execution.model,
    reasoningLevel: execution.reasoningLevel,
    ...(execution.serviceTier === null ? {} : { serviceTier: execution.serviceTier }),
    permissionMode: execution.permissionMode,
    title: delegatedThreadTitle(task),
    prompt,
  };
  return { task, preset, args };
}

export function registerDelegation(bb: BbPluginApi, store: TasksApiStore): void {
  bb.rpc.register(delegationRpcContract, handlers(bb, store));
}
