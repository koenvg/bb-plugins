import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { tasksRpcContract, type TasksRpcContract, type Label } from "../shared/contract.js";
import { createTaskPreviews, normalizeTaskKey } from "./task-previews.js";
import { createTaskInventory } from "./task-inventory.js";
import {
  claimQuerySnapshotRevision,
  readQuerySnapshot,
  writeQuerySnapshot,
} from "./query-snapshot.js";
import { readTasksRefreshGeneration, subscribeTasksRefresh, useTasksRefresh } from "./refresh.js";

type Rpc = ReturnType<typeof useRpc<TasksRpcContract>>;
function createSessionData(rpc: Rpc) {
  const previews = createTaskPreviews(
    async (taskKey) => (await rpc.call("getTaskByKey", { taskKey })).task,
    readTasksRefreshGeneration,
  );
  let projectsSnapshotRevision = 0;
  const projects = createTaskInventory(
    async () => {
      projectsSnapshotRevision = claimQuerySnapshotRevision("projects");
      return (await rpc.call("listProjects", {})).projects;
    },
    readTasksRefreshGeneration,
    readQuerySnapshot("projects", tasksRpcContract.listProjects.output.shape.projects),
    (current) => writeQuerySnapshot("projects", current, projectsSnapshotRevision),
  );
  const presets = createTaskInventory(
    async () => (await rpc.call("listPresets")).presets,
    readTasksRefreshGeneration,
  );
  const labels = new Map<string, ReturnType<typeof createTaskInventory<Label[]>>>();
  return {
    previews,
    projects,
    presets,
    labels(projectId: string) {
      let resource = labels.get(projectId);
      if (!resource) {
        resource = createTaskInventory(
          async () => (await rpc.call("listLabels", { projectId })).labels,
          readTasksRefreshGeneration,
        );
        labels.set(projectId, resource);
      }
      return resource;
    },
    invalidateInventories() {
      projects.invalidate();
      presets.invalidate();
      labels.forEach((resource) => resource.invalidate());
    },
    dispose() {
      previews.dispose();
      projects.dispose();
      presets.dispose();
      labels.forEach((resource) => resource.dispose());
      labels.clear();
    },
  };
}
const TaskDataContext = createContext<ReturnType<typeof createSessionData> | null>(null);

function useSessionDataLifetime(data: ReturnType<typeof createSessionData>, owned: boolean) {
  const mounted = useRef(new Set<typeof data>());
  useEffect(() => {
    if (!owned) return;
    const sessions = mounted.current;
    sessions.add(data);
    return () => {
      sessions.delete(data);
      // React can replay effect setup/cleanup without closing the page. All
      // subscriptions detach now; release data unless setup resumes this session.
      queueMicrotask(() => {
        if (!sessions.has(data)) data.dispose();
      });
    };
  }, [data, owned]);
}

export function TaskDataProvider({ children }: { children: ReactNode }) {
  const rpc = useRpc<TasksRpcContract>();
  const data = useMemo(() => createSessionData(rpc), [rpc]);
  useSessionDataLifetime(data, true);
  useRealtime("tasks:changed", (payload) => {
    const event = payload as { taskId?: unknown; taskKey?: unknown } | null;
    if (typeof event?.taskKey === "string") data.previews.invalidate(event.taskKey);
    else if (typeof event?.taskId === "string") data.previews.invalidateTask(event.taskId);
    else data.previews.invalidate();
  });
  useRealtime("projects:changed", () => {
    data.invalidateInventories();
    data.previews.invalidate();
  });
  useEffect(() => {
    let generation = readTasksRefreshGeneration();
    return subscribeTasksRefresh(() => {
      const next = readTasksRefreshGeneration();
      if (next === generation) return;
      generation = next;
      data.previews.invalidate();
      data.invalidateInventories();
    });
  }, [data]);
  return <TaskDataContext.Provider value={data}>{children}</TaskDataContext.Provider>;
}

/** Inventories also work outside the task session, without crossing RPC bindings. */
function useSessionData() {
  const shared = useContext(TaskDataContext);
  const rpc = useRpc<TasksRpcContract>();
  const local = useMemo(() => shared ?? createSessionData(rpc), [shared, rpc]);
  useRealtime("projects:changed", () => {
    if (!shared) local.invalidateInventories();
  });
  useSessionDataLifetime(local, shared === null);
  return local;
}
function useRefreshRead(load: () => Promise<void>, state: { isLoading: boolean }) {
  const { generation, beginGenerationWork, endGenerationWork } = useTasksRefresh();
  const previous = useRef(generation);
  useEffect(() => {
    const changed = previous.current !== generation;
    previous.current = generation;
    if (changed) beginGenerationWork();
    let ended = false;
    const finish = () => {
      if (changed && !ended) {
        ended = true;
        endGenerationWork();
      }
    };
    void load().finally(finish);
    return finish;
  }, [load, generation, beginGenerationWork, endGenerationWork]);
  // Invalidation can replace a cold request while isLoading remains true.
  // Snapshot identity, not a boolean edge, signals its new generation.
  useEffect(() => {
    if (state.isLoading) void load();
  }, [load, state]);
}
function useInventory<T>(
  resource: Pick<
    ReturnType<typeof createTaskInventory<T>>,
    "read" | "subscribe" | "load" | "invalidate"
  >,
) {
  const state = useSyncExternalStore(resource.subscribe, resource.read);
  useRefreshRead(resource.load, state);
  const refresh = useCallback(() => {
    resource.invalidate();
    void resource.load();
  }, [resource]);
  return { data: state.data, error: state.error, isLoading: state.isLoading, refresh };
}
export function useSessionProjects() {
  return useInventory(useSessionData().projects);
}
export function useSessionLabelsForProjects(projectIds: readonly string[]) {
  const data = useSessionData();
  const ids = JSON.stringify(projectIds);
  const group = useMemo(() => {
    const resources = projectIds.map((id) => data.labels(id));
    let last = resources.map((resource) => resource.read());
    const combine = () => ({
      data: last.every((state) => state.data !== undefined)
        ? last.flatMap((state) => state.data!)
        : undefined,
      error: last.find((state) => state.error)?.error ?? null,
      isLoading: last.some((state) => state.isLoading),
      current: last.every((state) => state.current),
    });
    let snapshot = combine();
    return {
      read() {
        const next = resources.map((resource) => resource.read());
        if (next.some((state, index) => state !== last[index])) {
          last = next;
          snapshot = combine();
        }
        return snapshot;
      },
      subscribe(listener: () => void) {
        const releases = resources.map((resource) => resource.subscribe(listener));
        return () => releases.forEach((release) => release());
      },
      load: async () => {
        await Promise.all(resources.map((resource) => resource.load()));
      },
      invalidate: () => resources.forEach((resource) => resource.invalidate()),
    };
  }, [data, ids]);
  return useInventory(group);
}
export function useSessionPresets() {
  return useInventory(useSessionData().presets);
}
export function useSessionLabels(projectId: string) {
  return useInventory(useSessionData().labels(projectId));
}
export function useTaskPreviews() {
  const data = useContext(TaskDataContext);
  if (!data) throw new Error("Task previews require a Tasks session");
  return data.previews;
}
export function useTaskPreview(rawKey: string) {
  const previews = useTaskPreviews();
  const key = normalizeTaskKey(rawKey);
  const load = useCallback(() => previews.load(key), [previews, key]);
  const subscribe = useCallback(
    (listener: () => void) => previews.subscribe(key, listener),
    [previews, key],
  );
  const read = useCallback(() => previews.read(key), [previews, key]);
  const state = useSyncExternalStore(subscribe, read);
  useRefreshRead(load, state);
  const refresh = useCallback(() => {
    previews.invalidate(key);
    void previews.load(key);
  }, [previews, key]);
  return { ...state, refresh };
}
