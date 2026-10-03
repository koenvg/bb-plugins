import { listAllTasks, useTasksQuery } from "../../shell/data.js";
import type {
  Label,
  Task,
  TaskPriority,
  TaskStatus,
} from "../../shared/contract.js";
export { useTaskListMeta, type TaskRowMeta } from "./work-status-data.js";
interface ListTaskFilters {
  statuses: readonly TaskStatus[];
  priorities: readonly TaskPriority[];
  labelIds: readonly string[] | null;
  dependency?: "ready" | "blocked";
}

export function listNeedsScope(
  activeOnly: boolean,
  filters: ListTaskFilters,
): boolean {
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
  const matches = useTasksQuery(
    async (rpc) =>
      listAllTasks(rpc, {
        ...(projectId === null ? {} : { projectId }),
        ...(filters.statuses.length > 0
          ? { statuses: [...filters.statuses] }
          : {}),
        ...(filters.priorities.length > 0
          ? { priorities: [...filters.priorities] }
          : {}),
        ...(filters.labelIds !== null
          ? { labelIds: [...filters.labelIds] }
          : {}),
        ...(filters.dependency !== undefined
          ? { dependency: filters.dependency }
          : {}),
        activeOnly,
      }),
    ["tasks:changed", "threads:changed"],
    [
      projectId,
      activeOnly,
      filters.statuses.join(),
      filters.priorities.join(),
      filters.labelIds === null ? "" : `active:${filters.labelIds.join()}`,
      filters.dependency ?? "",
    ],
  );
  const scope = useTasksQuery<Task[] | null>(
    async (rpc) =>
      needsScope
        ? listAllTasks(rpc, projectId === null ? {} : { projectId })
        : null,
    ["tasks:changed", "threads:changed"],
    [projectId, needsScope],
  );
  return { matches, scope, needsScope };
}

export function useLabels(projectIds: readonly string[]) {
  return useTasksQuery<Label[]>(
    async (rpc) => {
      const results = await Promise.all(
        projectIds.map((projectId) => rpc.call("listLabels", { projectId })),
      );
      return results.flatMap((result) => result.labels);
    },
    ["projects:changed"],
    [projectIds.join()],
  );
}
