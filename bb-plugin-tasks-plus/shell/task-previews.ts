import type { Task } from "../shared/contract.js";
import { errorMessage } from "../shared/errors.js";

export const TASK_PREVIEW_ENTRIES = 32;
export const TASK_PREVIEW_BYTES = 2 * 1024 * 1024;
export const TASK_PREVIEW_SPECULATION = 2;
export const normalizeTaskKey = (key: string) => key.trim().toUpperCase();

export interface TaskPreviewSnapshot {
  data: Task | null | undefined;
  error: string | null;
  isLoading: boolean;
  /** Only a response from the current invalidation generation can prove absence. */
  current: boolean;
}
const empty: TaskPreviewSnapshot = {
  data: undefined,
  error: null,
  isLoading: true,
  current: false,
};
interface Entry {
  snapshot: TaskPreviewSnapshot;
  bytes: number;
}
interface Request {
  promise: Promise<void>;
  epoch: number;
}

/** One RPC binding and mounted session. Editors and drafts never enter this store. */
export function createTaskPreviews(
  fetchTask: (key: string) => Promise<Task | null>,
  readEpoch: () => number = () => 0,
) {
  const retained = new Map<string, Entry>();
  const active = new Map<string, TaskPreviewSnapshot>();
  const listeners = new Map<string, Set<() => void>>();
  const requests = new Map<string, Request>();
  // Issued transports keep their slots even if invalidation revokes publication.
  const speculative = new Set<Request>();
  let queued: string[] = [];
  let epoch = readEpoch();
  let bytes = 0;
  let disposed = false;

  function drop(key: string) {
    const entry = retained.get(key);
    if (!entry) return;
    bytes -= entry.bytes;
    retained.delete(key);
  }
  function notify(key: string) {
    listeners.get(key)?.forEach((listener) => listener());
  }
  function read(key: string): TaskPreviewSnapshot {
    if (disposed) return empty;
    synchronize();
    key = normalizeTaskKey(key);
    return active.get(key) ?? retained.get(key)?.snapshot ?? empty;
  }
  function publish(key: string, snapshot: TaskPreviewSnapshot) {
    if (listeners.has(key)) active.set(key, snapshot);
    drop(key);
    if (snapshot.data) {
      const size = new TextEncoder().encode(JSON.stringify(snapshot.data)).byteLength;
      if (size <= TASK_PREVIEW_BYTES) {
        retained.set(key, { snapshot, bytes: size });
        bytes += size;
        while (retained.size > TASK_PREVIEW_ENTRIES || bytes > TASK_PREVIEW_BYTES) {
          // Prefer unselected entries. Active query data can outlive retention,
          // but must not make the retained-data budget grow.
          const victim =
            [...retained.keys()].find((candidate) => !listeners.has(candidate)) ??
            retained.keys().next().value!;
          drop(victim);
        }
      }
    }
    notify(key);
  }
  function invalidateKeys(keys: Iterable<string>, emit = true) {
    queued = [];
    for (const key of keys) {
      requests.delete(key); // Revoke publication rights, not transport cancellation.
      const previous = active.get(key) ?? retained.get(key)?.snapshot ?? empty;
      const snapshot = { ...previous, current: false, isLoading: true, error: null };
      if (listeners.has(key)) active.set(key, snapshot);
      const entry = retained.get(key);
      if (entry) entry.snapshot = snapshot;
      if (emit) notify(key);
    }
  }
  function allKeys() {
    return new Set([...retained.keys(), ...active.keys(), ...requests.keys()]);
  }
  function synchronize() {
    const next = readEpoch();
    if (epoch === next) return;
    epoch = next;
    // External generations also guard reuse when no subscriber has rendered yet.
    invalidateKeys(allKeys(), false);
  }
  function invalidate(key?: string) {
    if (disposed) return;
    synchronize();
    invalidateKeys(key === undefined ? allKeys() : [normalizeTaskKey(key)]);
  }
  function invalidateTask(taskId: string) {
    if (disposed) return;
    synchronize();
    const keys = [...allKeys()].filter((key) => {
      const data = active.get(key)?.data ?? retained.get(key)?.snapshot.data;
      // A cold issued request has no task ID yet; conservatively revoke it.
      return data === undefined || data === null || data.id === taskId;
    });
    invalidateKeys(keys);
  }
  function load(rawKey: string, speculate = false): Promise<void> {
    if (disposed) return Promise.resolve();
    synchronize();
    const key = normalizeTaskKey(rawKey);
    const snapshot = read(key);
    if (snapshot.current) {
      const entry = retained.get(key);
      if (entry) {
        retained.delete(key);
        retained.set(key, entry);
      }
      return Promise.resolve();
    }
    const existing = requests.get(key);
    if (existing) return existing.promise;
    const request: Request = { epoch, promise: Promise.resolve() };
    requests.set(key, request);
    if (speculate) speculative.add(request);
    // Do not reserialize retained descriptions on request start.
    const loading = { ...snapshot, error: null, isLoading: true, current: false };
    if (listeners.has(key)) active.set(key, loading);
    const canPublish = () =>
      !disposed && requests.get(key) === request && readEpoch() === request.epoch;
    request.promise = Promise.resolve()
      .then(() => (canPublish() ? fetchTask(key) : null))
      .then((data) => {
        if (!canPublish()) return;
        // A transport result with the wrong key is not usable matching data.
        if (data && normalizeTaskKey(data.key) !== key)
          throw new Error(`Task lookup did not match ${key}`);
        publish(key, { data, error: null, isLoading: false, current: true });
      })
      .catch((error: unknown) => {
        if (canPublish())
          publish(key, {
            ...snapshot,
            error: errorMessage(error),
            isLoading: false,
            current: false,
          });
      })
      .finally(() => {
        if (requests.get(key) === request) requests.delete(key);
        speculative.delete(request);
        pump();
      });
    notify(key);
    return request.promise;
  }
  function pump() {
    if (disposed) return;
    synchronize();
    while (queued.length && speculative.size < TASK_PREVIEW_SPECULATION) {
      const key = queued.shift()!;
      // Already-issued foreground reads are shared without consuming a new slot.
      if (!requests.has(key) && !read(key).current) void load(key, true);
    }
  }
  function warm(keys: readonly string[]) {
    if (disposed) return;
    synchronize();
    queued = [...new Set(keys.map(normalizeTaskKey).filter(Boolean))].slice(
      0,
      TASK_PREVIEW_SPECULATION,
    );
    pump();
  }
  return {
    read,
    load: (key: string) => load(key),
    warm,
    invalidate,
    invalidateTask,
    /** Revoke reuse during a write without triggering a second route barrier
     * before the originating edit session has finished its save drain. */
    invalidateReuse(rawKey: string) {
      if (disposed) return;
      queued = [];
      const key = normalizeTaskKey(rawKey);
      drop(key);
      requests.delete(key);
    },
    subscribe(rawKey: string, listener: () => void) {
      if (disposed) return () => {};
      const key = normalizeTaskKey(rawKey);
      const callbacks = listeners.get(key) ?? new Set<() => void>();
      callbacks.add(listener);
      listeners.set(key, callbacks);
      if (!active.has(key)) active.set(key, retained.get(key)?.snapshot ?? empty);
      return () => {
        callbacks.delete(listener);
        if (callbacks.size === 0) {
          listeners.delete(key);
          active.delete(key);
        }
      };
    },
    retention: () => ({ entries: retained.size, bytes }),
    dispose() {
      disposed = true;
      queued = [];
      retained.clear();
      active.clear();
      requests.clear();
      speculative.clear();
      listeners.clear();
      bytes = 0;
    },
  };
}

export type TaskPreviews = ReturnType<typeof createTaskPreviews>;
