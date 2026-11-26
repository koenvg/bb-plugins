import { listAllTasks, useTasksQuery } from "../../shell/data.js";
import type { Task, TaskPriority, TaskStatus } from "../../shared/contract.js";
export { useTaskListMeta, type TaskRowMeta } from "./work-status-data.js";

// A task can change without a new updatedAt (for example, a dependency's status).
function equalTask(a: Task, b: Task): boolean {
  const fields = Object.keys(a) as (keyof Task)[];
  return (
    fields.length === Object.keys(b).length &&
    fields.every((field) => {
      const before = a[field];
      const after = b[field];
      return (
        Object.hasOwn(b, field) &&
        (before === after ||
          (typeof before === "object" &&
            typeof after === "object" &&
            JSON.stringify(before) === JSON.stringify(after)))
      );
    })
  );
}

function reuseListTasks(previous: Task[] | null | undefined, next: Task[]): Task[] {
  if (!previous) return next;
  const byId = new Map(previous.map((task) => [task.id, task]));
  const tasks = next.map((task) => {
    const old = byId.get(task.id);
    return old && equalTask(old, task) ? old : task;
  });
  return previous.length === tasks.length && tasks.every((task, index) => task === previous[index])
    ? previous
    : tasks;
}
interface ListTaskFilters {
  statuses: readonly TaskStatus[];
  priorities: readonly TaskPriority[];
  labelIds: readonly string[] | null;
  dependency?: "ready" | "blocked";
}

export function listNeedsScope(activeOnly: boolean, filters: ListTaskFilters): boolean {
  return (
    activeOnly ||
    filters.statuses.length > 0 ||
    filters.priorities.length > 0 ||
    filters.labelIds !== null ||
    filters.dependency !== undefined
  );
}

export function useListTasks(
  projectId: string | null,
  activeOnly: boolean,
  filters: ListTaskFilters,
) {
  const needsScope = listNeedsScope(activeOnly, filters);
  const input = {
    ...(projectId === null ? {} : { projectId }),
    ...(filters.statuses.length > 0 ? { statuses: [...filters.statuses] } : {}),
    ...(filters.priorities.length > 0 ? { priorities: [...filters.priorities] } : {}),
    ...(filters.labelIds !== null ? { labelIds: [...filters.labelIds] } : {}),
    ...(filters.dependency !== undefined ? { dependency: filters.dependency } : {}),
    activeOnly,
  };
  const matches = useTasksQuery<Task[]>(
    (rpc) => listAllTasks(rpc, input),
    ["tasks:changed", "threads:changed"],
    [input],
    { reconcile: reuseListTasks },
  );
  const scope = useTasksQuery<Task[] | null>(
    (rpc) =>
      Promise.try(() =>
        needsScope ? listAllTasks(rpc, projectId === null ? {} : { projectId }) : null,
      ),
    ["tasks:changed", "threads:changed"],
    [projectId, needsScope],
    { reconcile: (previous, next) => (next === null ? null : reuseListTasks(previous, next)) },
  );
  return { matches, scope, needsScope };
}

export { useSessionLabelsForProjects as useLabels } from "../../shell/task-data.js";
