import type { PluginThreadHeaderActionProps } from "@get-bb/plugin-sdk";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import type { Task } from "../../shared/contract.js";
import { useTasksQuery } from "../../shell/data.js";
import { TasksRefreshProvider } from "../../shell/refresh.js";
import { openTaskInSidePanel } from "../../shell/routes.js";
import { STATUS_LABELS } from "../list/lib.js";
import { StatusIcon } from "../list/icons.js";

function useThreadTasks(threadId: string): Task[] {
  const { data } = useTasksQuery(
    async (rpc) => (await rpc.call("getTasksForThread", { threadId })).tasks,
    ["tasks:changed", "threads:changed"],
    [threadId],
  );
  return data ?? [];
}

function ThreadHeaderTaskChip({ threadId, isCompactViewport }: PluginThreadHeaderActionProps) {
  const navigate = useBbNavigate();
  const [task, ...others] = useThreadTasks(threadId);
  if (!task) return null;

  const statusLabel = STATUS_LABELS[task.status];
  return (
    <button
      type="button"
      aria-label={`${task.key} ${statusLabel}, open task`}
      title={task.title}
      onClick={() => openTaskInSidePanel(navigate, task.key)}
      className="inline-flex h-7 max-w-64 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <StatusIcon status={task.status} />
      <span className="font-mono text-foreground">{task.key}</span>
      {isCompactViewport ? null : <span className="truncate">{statusLabel}</span>}
      {others.length > 0 ? <span className="tabular-nums">+{others.length}</span> : null}
    </button>
  );
}

export function ThreadHeaderTask(props: PluginThreadHeaderActionProps) {
  return (
    <TasksRefreshProvider>
      <ThreadHeaderTaskChip key={props.threadId} {...props} />
    </TasksRefreshProvider>
  );
}
