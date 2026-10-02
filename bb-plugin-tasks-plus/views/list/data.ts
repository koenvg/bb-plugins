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
  const input = {
    ...(projectId === null ? {} : { projectId }),
    ...(filters.statuses.length > 0 ? { statuses: [...filters.statuses] } : {}),
    ...(filters.priorities.length > 0
      ? { priorities: [...filters.priorities] }
      : {}),
    ...(filters.labelIds !== null ? { labelIds: [...filters.labelIds] } : {}),
    ...(filters.dependency !== undefined
      ? { dependency: filters.dependency }
      : {}),
    activeOnly,
  };
  const inputKey = JSON.stringify(input);
  const query = useTasksQuery(
    async (rpc) => ({ inputKey, tasks: await listAllTasks(rpc, input) }),
    ["tasks:changed", "threads:changed"],
    [inputKey],
  );
  // A newly resolved label filter changes query inputs before the fetch effect
  // runs. Keep that retained result usable, but never report it as settled.
  const matches = {
    ...query,
    data: query.data?.tasks,
    isLoading:
      query.isLoading ||
      (query.error === null && query.data?.inputKey !== inputKey),
  };
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
  const projectIdsKey = JSON.stringify(projectIds);
  const query = useTasksQuery<{ projectIdsKey: string; labels: Label[] }>(
    async (rpc) => {
      const results = await Promise.all(
        projectIds.map((projectId) => rpc.call("listLabels", { projectId })),
      );
      return {
        projectIdsKey,
        labels: results.flatMap((result) => result.labels),
      };
    },
    ["projects:changed"],
    [projectIdsKey],
  );
  return {
    ...query,
    data: query.data?.labels,
    isLoading:
      query.isLoading ||
      (query.error === null && query.data?.projectIdsKey !== projectIdsKey),
  };
}
