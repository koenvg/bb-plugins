import { useEffect, useRef } from "react";
import type {
  PluginThreadAction,
  PluginThreadActionDataInput,
  PluginThreadActionItemInput,
  PluginThreadActionRegistration,
} from "@get-bb/plugin-sdk/app";
import type { Task } from "../../shared/contract.js";
import { useTasksQueryWithRefresh } from "../../shell/data.js";
import { useTasksRefreshSource } from "../../shell/refresh.js";
import { openTaskInSidePanel } from "../../shell/routes.js";
import { STATUS_LABELS } from "../list/lib.js";

export type ThreadTaskData = ReadonlyMap<string, readonly Task[]>;

function useThreadTaskData({ threadIds }: PluginThreadActionDataInput): ThreadTaskData {
  const refresh = useTasksRefreshSource();
  const published = useRef<ThreadTaskData>(new Map());
  const { data } = useTasksQueryWithRefresh(
    refresh,
    async (rpc): Promise<ThreadTaskData> => {
      const results = await Promise.allSettled(
        threadIds.map(
          async (threadId) => (await rpc.call("getTasksForThread", { threadId })).tasks,
        ),
      );
      const next = new Map<string, readonly Task[]>();
      threadIds.forEach((id, index) => {
        const result = results[index]!;
        const tasks = result.status === "fulfilled" ? result.value : published.current.get(id);
        if (tasks !== undefined) next.set(id, tasks);
      });
      return next;
    },
    ["tasks:changed", "threads:changed"],
    threadIds,
  );
  useEffect(() => {
    if (data !== undefined) published.current = data;
  }, [data]);
  const visible = new Map<string, readonly Task[]>();
  for (const id of threadIds) {
    const tasks = data?.get(id);
    if (tasks !== undefined) visible.set(id, tasks);
  }
  return visible;
}

function threadTaskItem({
  thread,
  data,
  navigate,
  experimental_panel,
}: PluginThreadActionItemInput<ThreadTaskData>): PluginThreadAction | null {
  const tasks = data.get(thread.id);
  const task = tasks?.[0];
  if (!task) return null;
  const additional = tasks.length - 1;
  return {
    label: `${task.key} ${STATUS_LABELS[task.status]}${additional > 0 ? ` +${additional}` : ""}`,
    detail: task.title,
    icon: "ListTodo",
    run: () => openTaskInSidePanel(navigate, experimental_panel, task.key),
  };
}

export const threadTaskAction: PluginThreadActionRegistration<ThreadTaskData> = {
  id: "task",
  title: "Task",
  icon: "ListTodo",
  group: "open",
  placement: "header",
  useData: useThreadTaskData,
  item: threadTaskItem,
};
