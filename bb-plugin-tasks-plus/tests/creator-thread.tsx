import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeTask, rpcInput } from "../test-fixtures";
import { tasksRpcContract } from "../shared/contract";
import "./preview.css";

const app = await loadPluginApp(() => import("../app"));
let task = makeTask({
  key: "CRT-1",
  title: "Creator-thread follow-up",
  status: "backlog",
  createdByThreadId: "thr_creator",
  creatorThreadBlocked: true,
  openBlockerCount: 1,
  blocked: true,
});
const project = {
  id: task.projectId,
  name: "Creator fixture",
  prefix: "CRT",
  nextTaskNumber: 2,
  color: "blue",
  folderId: null,
  linkedBbProjectId: null,
  createdAt: task.createdAt,
};
function updateStatus(status: typeof task.status | undefined) {
  if (status === "todo" && task.creatorThreadBlocked) {
    return {
      ok: false,
      error: {
        code: "creator_thread_open",
        message:
          "Cannot move task to todo: creator thread thr_creator is unarchived or unavailable",
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
    rpc: {
      listProjects: () => ({ projects: [project] }),
      listFolders: () => ({ folders: [] }),
      listPresets: () => ({ presets: [] }),
      listLabels: () => ({ labels: [] }),
      listBbProjects: () => ({ bbProjects: [] }),
      listTasks: (raw) => ({ tasks: rpcInput(raw).parentTaskId ? [] : [task], nextCursor: null }),
      getTaskByKey: () => ({ task }),
      getTask: () => ({ task }),
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
    task = { ...task, creatorThreadBlocked: blocked, openBlockerCount: Number(blocked), blocked };
    await slot.behavior.emitRealtime("tasks:changed", {
      taskId: task.id,
      projectId: task.projectId,
    });
  });
}
