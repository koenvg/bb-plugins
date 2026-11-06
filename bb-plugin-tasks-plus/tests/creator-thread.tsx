import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeTask, rpcInput } from "../test-fixtures";
import { tasksRpcContract } from "../shared/contract";
import type { Task, TaskDependencyRef } from "../shared/contract";
import "./preview.css";

const params = new URLSearchParams(location.search);
const relations = params.get("relations");
const populated = relations === "mixed" || relations === "task-only";
const hasCreator = relations !== "task-only";
let creatorArchived = false;
const openTask = makeTask({
  id: "01HZZZZZZZZZZZZZZZZZZZZZT2",
  number: 2,
  key: "CRT-2",
  title: "Approve workspace access",
});
const resolvedTask = makeTask({
  id: "01HZZZZZZZZZZZZZZZZZZZZZT3",
  number: 3,
  key: "CRT-3",
  title: "Confirm rollback coverage",
  status: "done",
});
function dependencyRef({ id, key, title, status }: Task): TaskDependencyRef {
  return { id, key, title, status };
}
const creatorId = params.has("long")
  ? `thr_creator_${"full_saved_identifier_".repeat(5)}`
  : "thr_creator";
const creatorTitle = params.has("long")
  ? "Release readiness review for the shared workspace permissions migration and rollback checks across existing environments ".repeat(
      3,
    )
  : "Creator review thread";
const app = await loadPluginApp(() => import("../app"));
let task = makeTask({
  key: "CRT-1",
  title: "Creator-thread follow-up",
  status: "backlog",
  createdByThreadId: hasCreator ? creatorId : null,
  blockedBy: populated ? [dependencyRef(openTask), dependencyRef(resolvedTask)] : [],
  openBlockerCount: Number(populated),
  blocked: populated,
});
const child = makeTask({
  id: "01HZZZZZZZZZZZZZZZZZZZZZT4",
  number: 4,
  key: "CRT-4",
  title: "Verify workspace permissions before release",
  parentTaskId: task.id,
  status: "backlog",
  createdByThreadId: creatorId,
  blockedBy: [dependencyRef(openTask)],
  openBlockerCount: 1,
  blocked: true,
  openBlockedCount: 1,
});
const downstreamTask = makeTask({
  id: "01HZZZZZZZZZZZZZZZZZZZZZT5",
  number: 5,
  key: "CRT-5",
  title: "Publish release checklist",
  status: "backlog",
  blockedBy: [dependencyRef(child)],
  openBlockerCount: 1,
  blocked: true,
});
child.blocks = [dependencyRef(downstreamTask)];
openTask.blocks = [dependencyRef(task), dependencyRef(child)];
openTask.openBlockedCount = 2;
resolvedTask.blocks = [dependencyRef(task)];
resolvedTask.openBlockedCount = 0;
const tasks = () => (populated ? [task, openTask, resolvedTask, child, downstreamTask] : [task]);
const project = {
  id: task.projectId,
  name: "Creator fixture",
  prefix: "CRT",
  nextTaskNumber: populated ? 6 : 2,
  color: "blue",
  folderId: null,
  linkedBbProjectId: null,
  createdAt: task.createdAt,
};
let completionAttempts = 0;
function updateStatus(status: typeof task.status | undefined) {
  if (status === "done" && params.has("completion-unavailable") && completionAttempts++ === 0) {
    return {
      ok: false,
      error: {
        code: "task_pr_unavailable",
        message: "Could not inspect attached thread pull requests",
      },
    };
  }
  task = { ...task, status: status ?? task.status };
  document.getElementById("stored-status")!.textContent = task.status;
  return { ok: true, task };
}
const slot = renderSlot(
  app.navPanels[0]!,
  {
    subPath: new URLSearchParams(location.search).has("board")
      ? `${project.id}?view=board`
      : "task/CRT-1",
  },
  {
    sdk: {
      threads: {
        get: async ({ threadId }) => {
          if (threadId !== creatorId || params.has("unavailable"))
            throw new Error("Creator unavailable");
          return {
            id: creatorId,
            activeBackgroundAgentCount: 0,
            canEditMessages: true,
            canRestoreEnvironment: false,
            canSpawnChild: false,
            createdAt: 1,
            environmentId: null,
            lastReadAt: null,
            latestAttentionAt: 1,
            lifecycleOwnerThreadId: null,
            originKind: null,
            originPluginId: null,
            parentNotifications: "auto",
            parentThreadId: null,
            pinnedAt: null,
            projectId: "proj_creator_fixture",
            providerId: "fixture",
            queuedMessageCount: 0,
            runtime: { displayStatus: "idle" },
            sectionId: null,
            sourceThreadId: null,
            status: "idle",
            updatedAt: 1,
            visibility: "visible",
            title: params.has("fallback") ? " " : creatorTitle,
            titleFallback: params.has("fallback") ? "Creator fallback title" : null,
            archivedAt: creatorArchived ? 1 : null,
            deletedAt: null,
          };
        },
      },
    },
    rpc: {
      listProjects: () => ({ projects: [project] }),
      listFolders: () => ({ folders: [] }),
      listPresets: () => ({ presets: [] }),
      listLabels: () => ({ labels: [] }),
      listBbProjects: () => ({ bbProjects: [] }),
      listTasks: (raw) => {
        const { parentTaskId } = rpcInput(raw);
        return {
          tasks: tasks().filter((entry) => !parentTaskId || entry.parentTaskId === parentTaskId),
          nextCursor: null,
        };
      },
      getTaskByKey: (raw) => ({
        task: tasks().find((entry) => entry.key === rpcInput(raw).taskKey) ?? null,
      }),
      getTask: (raw) => ({
        task: tasks().find((entry) => entry.id === rpcInput(raw).taskId) ?? null,
      }),
      listAttachments: () => ({ attachments: [] }),
      listTaskThreads: () => ({ taskThreads: [] }),
      listTaskPullRequests: () => ({ pullRequests: [], unavailableThreadIds: [] }),
      updateTask: (raw) => updateStatus(tasksRpcContract.updateTask.input.parse(raw).status),
      boardMove: (raw) => updateStatus(tasksRpcContract.boardMove.input.parse(raw).status),
    },
  },
);
for (const [id, blocked] of [
  ["archive-creator", false],
  ["unarchive-creator", true],
] as const) {
  document.getElementById(id)!.addEventListener("click", async () => {
    creatorArchived = !blocked;
    await slot.behavior.emitRealtime("tasks:changed", {
      taskId: task.id,
      projectId: task.projectId,
    });
  });
}
document.addEventListener("click", () => {
  document.getElementById("host-navigation")!.textContent = JSON.stringify(
    slot.inspection.navigateCalls,
  );
});
