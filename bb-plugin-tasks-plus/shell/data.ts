import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { z } from "zod";
import { tasksRpcContract, type TasksRpcContract } from "../shared/contract.js";
import type { Task, TaskPriority, TaskStatus } from "../shared/contract.js";
import { errorMessage } from "../shared/errors.js";
import { TASKS_PAGE_MAX_LIMIT, type TaskSort } from "../shared/pagination.js";
import type { MentionItem } from "../editor/extensions.js";
import {
  claimQuerySnapshotRevision,
  readQuerySnapshot,
  writeQuerySnapshot,
} from "./query-snapshot.js";
import { useTasksRefresh, type TasksRefreshState } from "./refresh.js";
import { useSessionProjects, useSessionPresets } from "./task-data.js";

export function useTasksRpc() {
  return useRpc<TasksRpcContract>();
}

export type TasksRpc = ReturnType<typeof useTasksRpc>;

interface TaskListQuery {
  projectId?: string;
  statuses?: TaskStatus[];
  priorities?: TaskPriority[];
  labelIds?: string[];
  activeOnly?: boolean;
  parentTaskId?: string | null;
  search?: string;
  sort?: TaskSort;
}

export async function listAllTasks(rpc: TasksRpc, input: TaskListQuery = {}): Promise<Task[]> {
  const tasks: Task[] = [];
  let cursor: string | null | undefined;
  const pages = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          if (cursor === null) return { done: true as const, value: undefined };
          const page = await rpc.call("listTasks", {
            ...input,
            limit: TASKS_PAGE_MAX_LIMIT,
            ...(cursor === undefined ? {} : { cursor }),
          });
          cursor = page.nextCursor ?? null;
          return { done: false as const, value: page.tasks };
        },
      };
    },
  };
  for await (const page of pages) tasks.push(...page);
  return tasks;
}

const INVALIDATION_CHANNELS = ["tasks:changed", "projects:changed", "threads:changed"] as const;

type InvalidationChannel = (typeof INVALIDATION_CHANNELS)[number];

export function useInvalidation(
  channels: readonly InvalidationChannel[],
  onInvalidate: () => void,
): void {
  const ref = useRef({ channels, onInvalidate });
  useLayoutEffect(() => {
    ref.current = { channels, onInvalidate };
  });
  const fire = useCallback((channel: InvalidationChannel) => {
    if (ref.current.channels.includes(channel)) ref.current.onInvalidate();
  }, []);
  useRealtime("tasks:changed", () => fire("tasks:changed"));
  useRealtime("projects:changed", () => fire("projects:changed"));
  useRealtime("threads:changed", () => fire("threads:changed"));
}

interface TasksQuery<T> {
  data: T | undefined;
  error: string | null;
  isLoading: boolean;
  refresh: () => void;
}

interface TasksQuerySnapshot<T> {
  name: string;
  schema: z.ZodType<T>;
}

interface TasksQueryOptions<T> {
  snapshot?: TasksQuerySnapshot<T>;
  reconcile?: (previous: T | undefined, next: T) => T;
}

export function useTasksQueryWithRefresh<T>(
  refreshState: Pick<TasksRefreshState, "generation" | "beginGenerationWork" | "endGenerationWork">,
  fetcher: (rpc: TasksRpc) => Promise<T>,
  channels: readonly InvalidationChannel[],
  deps: readonly unknown[] = [],
  options: TasksQueryOptions<T> = {},
): TasksQuery<T> {
  const rpc = useTasksRpc();
  const { generation, beginGenerationWork, endGenerationWork } = refreshState;
  const depsKey = JSON.stringify(deps);
  const scope = useMemo(
    () => ({ rpc, depsKey, generation, beginGenerationWork, endGenerationWork }),
    [rpc, depsKey, generation, beginGenerationWork, endGenerationWork],
  );
  const requestInputs = useRef({ scope, fetcher, options });
  useLayoutEffect(() => {
    requestInputs.current = { scope, fetcher, options };
  });
  const [state, setState] = useState<{
    data: T | undefined;
    error: string | null;
    isLoading: boolean;
    scope: typeof scope;
  }>(() => ({
    data:
      options.snapshot === undefined
        ? undefined
        : readQuerySnapshot(options.snapshot.name, options.snapshot.schema),
    error: null,
    isLoading: true,
    scope,
  }));
  const seqRef = useRef(0);
  const previousGenerationRef = useRef(generation);
  const startRequest = useCallback((inputs: typeof requestInputs.current) => {
    const seq = ++seqRef.current;
    const { scope, fetcher, options } = inputs;
    const { rpc, depsKey } = scope;
    const { snapshot, reconcile } = options;
    const snapshotRevision = snapshot === undefined ? 0 : claimQuerySnapshotRevision(snapshot.name);
    return fetcher(rpc).then(
      (data) => {
        if (snapshot !== undefined) {
          writeQuerySnapshot(snapshot.name, data, snapshotRevision);
        }
        if (seq !== seqRef.current) return;
        return void setState((current) => ({
          data: reconcile
            ? reconcile(current.scope.depsKey === depsKey ? current.data : undefined, data)
            : data,
          error: null,
          isLoading: false,
          scope,
        }));
      },
      (queryError: unknown) => {
        if (seq !== seqRef.current) return;
        setState((current) => ({
          data: current.scope.depsKey === depsKey ? current.data : undefined,
          error: errorMessage(queryError),
          isLoading: false,
          scope,
        }));
      },
    );
  }, []);
  const refresh = useCallback(() => {
    setState((current) => ({ ...current, isLoading: true }));
    return startRequest(requestInputs.current);
  }, [startRequest]);
  useEffect(() => {
    const inputs = requestInputs.current;
    if (inputs.scope !== scope) return;
    const { generation, beginGenerationWork, endGenerationWork } = scope;
    const generationBumped = previousGenerationRef.current !== generation;
    previousGenerationRef.current = generation;
    if (generationBumped) beginGenerationWork();
    let settled = false;
    const finish = () => {
      if (!generationBumped || settled) return;
      settled = true;
      endGenerationWork();
    };
    void startRequest(inputs).finally(finish);
    return () => {
      finish();
    };
  }, [scope, startRequest]);
  useInvalidation(channels, refresh);
  return {
    data: state.data,
    error: state.scope.depsKey === depsKey ? state.error : null,
    // Inputs can change before the fetch effect runs. Retain the old data for
    // display, but never let callers treat it as a settled current result.
    isLoading: state.isLoading || state.scope !== scope,
    refresh,
  };
}

export function useTasksQuery<T>(
  fetcher: (rpc: TasksRpc) => Promise<T>,
  channels: readonly InvalidationChannel[],
  deps: readonly unknown[] = [],
  options: TasksQueryOptions<T> = {},
): TasksQuery<T> {
  return useTasksQueryWithRefresh(useTasksRefresh(), fetcher, channels, deps, options);
}

const foldersSnapshot = {
  name: "folders",
  schema: tasksRpcContract.listFolders.output.shape.folders,
};

export function useFolders() {
  return useTasksQuery(
    async (rpc) => {
      const result = await rpc.call("listFolders");
      return result.folders;
    },
    ["projects:changed"],
    [],
    { snapshot: foldersSnapshot },
  );
}

export const useProjects = useSessionProjects;

export const usePresets = useSessionPresets;

const sidebarSummarySnapshot = {
  name: "sidebar-summary",
  schema: tasksRpcContract.sidebarSummary.output.shape.projects,
};

export function useSidebarSummary() {
  return useTasksQuery(
    async (rpc) => {
      const result = await rpc.call("sidebarSummary");
      return result.projects;
    },
    ["tasks:changed", "projects:changed", "threads:changed"],
    [],
    { snapshot: sidebarSummarySnapshot },
  );
}

export function useMentionItems() {
  const rpc = useTasksRpc();
  return useCallback(
    async (query: string): Promise<MentionItem[]> => {
      const trimmed = query.trim();
      const [taskResult, threadResult] = await Promise.all([
        rpc.call("listTasks", {
          ...(trimmed ? { search: trimmed } : {}),
          limit: 8,
        }),
        rpc.call("searchThreads", { query: trimmed, limit: 5 }).catch(() => ({ threads: [] })),
      ]);
      return [
        ...taskResult.tasks.slice(0, 8).map((task) => ({
          type: "task" as const,
          id: task.id,
          key: task.key,
          title: task.title,
        })),
        ...threadResult.threads.map((thread) => ({
          type: "thread" as const,
          id: thread.id,
          title: thread.title,
        })),
      ];
    },
    [rpc],
  );
}

export function useActiveTasks() {
  return useTasksQuery(
    (rpc) => Promise.try(() => listAllTasks(rpc, { activeOnly: true })),
    ["tasks:changed", "threads:changed"],
  );
}
