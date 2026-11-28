import { useRealtime } from "@get-bb/plugin-sdk/app";
import { useMemo } from "react";
import { listAllTasks, useTasksQuery, useTasksRpc } from "../../shell/data.js";
import { useSessionLabels } from "../../shell/task-data.js";
import type { Task, TaskThread, TasksChangedEvent } from "../../shared/contract.js";
import { errorMessage } from "../../shared/errors.js";
import { isActiveThread } from "../detail/meta.js";

export interface BoardCardMeta {
  workingThreads: TaskThread[];
  attachmentCount: number;
  subDone: number;
  subTotal: number;
}

interface BoardInventory {
  tasks: Task[];
  subProgress: Map<string, { done: number; total: number }>;
}

export function useBoardData(projectId: string) {
  const rpc = useTasksRpc();
  const scope = useMemo(() => ({ projectId, rpc }), [projectId, rpc]);
  const inventory = useTasksQuery<{
    scope: typeof scope;
    cards: BoardInventory | undefined;
    error: string | null;
  }>(
    async (rpc) => {
      try {
        const tasks = await listAllTasks(rpc, { projectId });
        const subProgress = new Map<string, { done: number; total: number }>();
        for (const task of tasks) {
          if (task.parentTaskId === null) continue;
          const entry = subProgress.get(task.parentTaskId) ?? { done: 0, total: 0 };
          entry.total += 1;
          if (task.status === "done") entry.done += 1;
          subProgress.set(task.parentTaskId, entry);
        }
        return {
          scope,
          cards: { tasks: tasks.filter((task) => task.parentTaskId === null), subProgress },
          error: null,
        };
      } catch (error) {
        return { scope, cards: undefined, error: errorMessage(error) };
      }
    },
    ["tasks:changed", "projects:changed", "threads:changed"],
    [projectId],
    {
      reconcile: (previous, next) =>
        !next.cards && previous?.scope === next.scope ? { ...next, cards: previous.cards } : next,
    },
  );
  const result = inventory.data?.scope === scope ? inventory.data : undefined;
  const current = result?.cards;
  const taskIds = current?.tasks.map((task) => task.id).sort() ?? [];
  const labels = useSessionLabels(projectId);
  const working = useTasksQuery(
    async (rpc) => {
      const byTaskId = new Map<string, TaskThread[]>();
      if (taskIds.length === 0) return byTaskId;
      const active = await listAllTasks(rpc, { projectId, activeOnly: true }).then(
        (tasks) => new Set(tasks.map((task) => task.id)),
        () => new Set<string>(),
      );
      await Promise.all(
        taskIds
          .filter((id) => active.has(id))
          .map(async (taskId) => {
            const threads = await rpc.call("listTaskThreads", { taskId }).then(
              (result) => result.taskThreads,
              () => [],
            );
            byTaskId.set(taskId, threads.filter(isActiveThread));
          }),
      );
      return byTaskId;
    },
    ["threads:changed"],
    [projectId, taskIds],
  );
  const attachments = useTasksQuery(
    async (rpc) =>
      new Map(
        await Promise.all(
          taskIds.map(async (taskId) => {
            const count = await rpc.call("listAttachments", { taskId }).then(
              (result) => result.attachments.length,
              () => 0,
            );
            return [taskId, count] as const;
          }),
        ),
      ),
    [],
    [projectId, taskIds],
  );
  useRealtime("tasks:changed", (payload) => {
    const event = payload as Partial<TasksChangedEvent> | null;
    if (event?.projectId === projectId && event.resource === "attachments") attachments.refresh();
  });
  const metaByTaskId = new Map<string, BoardCardMeta>(
    current?.tasks.map((task) => [
      task.id,
      {
        workingThreads: working.data?.get(task.id) ?? [],
        attachmentCount: attachments.data?.get(task.id) ?? 0,
        subDone: current.subProgress.get(task.id)?.done ?? 0,
        subTotal: current.subProgress.get(task.id)?.total ?? 0,
      },
    ]),
  );
  return {
    scope,
    tasks: current?.tasks,
    labelsById: new Map(labels.data?.map((label) => [label.id, label])),
    metaByTaskId,
    error: result?.error ?? null,
    refresh: inventory.refresh,
  };
}
