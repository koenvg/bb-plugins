import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { createStore, registerTasksApi } from "./api";
import { registerTasksCli } from "./cli";
import { registerDelegation } from "./delegate";
import { registerMentions } from "./mentions";
import { displayName } from "./shared/display-name";

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

export function reportPolicy(prompt: string): string {
  return prompt.split("## Report-back contract\n\n")[1]?.split("\n\n## ")[0]?.trim() ?? "";
}

// These optional measurements use the same public fixtures as the regression tests.
export function measureContext(kind: string, context: string, authored: string): void {
  if (process.env.TASK_CONTEXT_MEASURE === "1") {
    console.info(
      JSON.stringify({ kind, totalWords: wordCount(context), authoredWords: wordCount(authored) }),
    );
  }
}

export function mentionWrapper(
  context: string,
  fixture: ReturnType<typeof createAgentContextFixture>,
): string {
  const { task, project, subtask, label, thread, comments, taskAttachment, commentAttachment } =
    fixture;
  const values = [
    task.key,
    task.title,
    task.description,
    task.description.trim(),
    project.name,
    displayName(task.status),
    displayName(task.priority),
    task.dueDate!,
    label.name,
    subtask.key,
    subtask.title,
    displayName(subtask.status),
    thread.threadId,
    thread.title,
    displayName(thread.liveStatus),
    ...[taskAttachment, commentAttachment].flatMap((a) => [a.id, a.fileName]),
    ...comments.flatMap((c) => [c.body, c.authorName, displayName(c.kind), c.createdAt]),
  ];
  // Remove long values first so short values cannot alter a description or comment.
  return values
    .sort((a, b) => b.length - a.length)
    .reduce((text, value) => text.replaceAll(value, ""), context);
}

export function createAgentContextFixture() {
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks",
    sdk: {
      threads: {
        spawn: async () => ({ id: "thr_context" }),
        get: async () => makeThreadResponse({ id: "thr_context", status: "starting" }),
      },
    },
  });
  const store = createStore(bb);
  registerTasksApi(bb, store);
  registerTasksCli(bb, store, { name: "Tasks", version: "0.1.2" });
  registerDelegation(bb, store);
  registerMentions(bb, store);
  const provider = harness.registrations.mentionProviders[0];
  if (!provider) throw new Error("task mention provider was not registered");

  const project = store.tasks.createProject({
    name: "Context fixture",
    prefix: "CTX",
    color: "blue",
    linkedBbProjectId: "proj_context",
  });
  const description =
    "\n    Keep this scope restriction and [spec](https://example.test/spec).\n\n" +
    "Complete user requirement. ".repeat(100) +
    "Do not deploy.\n";
  const task = store.tasks.createTask({
    projectId: project.id,
    title: "Assigned context",
    description,
    status: "todo",
    priority: "urgent",
    dueDate: "2026-10-20",
  });
  const subtask = store.tasks.createTask({
    projectId: project.id,
    parentTaskId: task.id,
    title: "Subtask sentinel",
    status: "in_review",
  });
  const blocker = store.tasks.createTask({
    projectId: project.id,
    title: "Blocker sentinel",
    status: "todo",
  });
  store.tasks.addTaskDependency(blocker.id, task.id);
  const label = store.tasks.createLabel({
    projectId: project.id,
    name: "Label sentinel",
    color: "blue",
  });
  store.tasks.addTaskLabel(task.id, label.id);
  const comments = Array.from({ length: 7 }, (_, index) =>
    store.tasks.createComment({
      taskId: task.id,
      kind: "user",
      authorName: "Fixture user",
      body: `Comment sentinel ${index}. ` + "Old permission discussion. ".repeat(100),
    }),
  );
  const taskAttachment = store.tasks.createAttachment({
    taskId: task.id,
    fileName: "task-sentinel.md",
    mime: "text/markdown",
    sizeBytes: 0,
    blobPath: "blobs/task-sentinel.md",
    isImage: false,
  });
  const commentAttachment = store.tasks.createAttachment({
    commentId: comments[0]!.id,
    fileName: "old-comment-sentinel.md",
    mime: "text/markdown",
    sizeBytes: 0,
    blobPath: "blobs/old-comment-sentinel.md",
    isImage: false,
  });
  const thread = store.tasks.upsertTaskThread({
    taskId: task.id,
    threadId: "thr_prior_sentinel",
    title: "Prior thread sentinel",
    presetName: "Attached",
    liveStatus: "idle",
  });
  const presetInstructions =
    "\n" + "Preserve preset restriction. ".repeat(50) + "No unrelated changes.\n";
  const extraInstructions =
    "\n" + "Preserve explicit restriction. ".repeat(50) + "Run the relevant checks.\n";
  const preset = store.tasks.createPreset({
    name: "Fixture worker",
    providerId: "claude-code",
    modelId: "claude-sonnet-5",
    reasoningLevel: "high",
    serviceTier: "fast",
    permissionMode: "full",
    environmentKind: "project-default",
    baseBranch: null,
    machineId: null,
    instructions: presetInstructions,
    builtin: false,
  });
  return {
    bb,
    harness,
    store,
    provider,
    project,
    task,
    subtask,
    blocker,
    comments,
    label,
    thread,
    taskAttachment,
    commentAttachment,
    preset,
    presetInstructions,
    extraInstructions,
  };
}
