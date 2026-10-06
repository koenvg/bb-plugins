import { listAllTasks, useTasksQuery } from "../../shell/data.js";
import type { Task, TaskPriority, TaskStatus } from "../../shared/contract.js";
export { useTaskListMeta, type TaskRowMeta } from "./work-status-data.js";
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
  const matches = useTasksQuery(
    (rpc) => listAllTasks(rpc, input),
    ["tasks:changed", "threads:changed"],
    [input],
  );
  const scope = useTasksQuery<Task[] | null>(
    async (rpc) => (needsScope ? listAllTasks(rpc, projectId === null ? {} : { projectId }) : null),
    ["tasks:changed", "threads:changed"],
    [projectId, needsScope],
  );
  return { matches, scope, needsScope };
}

export { useSessionLabelsForProjects as useLabels } from "../../shell/task-data.js";
