import { errorMessage } from "../shared/errors.js";

export interface InventorySnapshot<T> {
  data: T | undefined;
  error: string | null;
  isLoading: boolean;
  current: boolean;
}
/** Current project, label or preset inventory only. Never thread/PR lifecycle data. */
export function createTaskInventory<T>(
  fetch: () => Promise<T>,
  readEpoch: () => number,
  initial?: T,
  onCurrent?: (data: T) => void,
) {
  let epoch = readEpoch();
  let snapshot: InventorySnapshot<T> = {
    data: initial,
    error: null,
    isLoading: true,
    current: false,
  };
  let pending: Promise<void> | undefined;
  let revision = 0;
  let disposed = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  function invalidate(emit = true) {
    if (disposed) return;
    epoch = readEpoch();
    revision++;
    pending = undefined;
    snapshot = { ...snapshot, current: false, isLoading: true, error: null };
    if (emit) notify();
  }
  function read() {
    if (epoch !== readEpoch()) invalidate(false);
    return snapshot;
  }
  function load(): Promise<void> {
    read();
    if (disposed || snapshot.current) return Promise.resolve();
    if (pending) return pending;
    const token = ++revision;
    const requestEpoch = epoch;
    const canPublish = () => !disposed && token === revision && requestEpoch === readEpoch();
    snapshot = { ...snapshot, isLoading: true, error: null };
    pending = Promise.resolve()
      .then(fetch)
      .then(
        (data) => {
          if (canPublish()) {
            onCurrent?.(data);
            snapshot = { data, error: null, isLoading: false, current: true };
            notify();
          }
        },
        (error: unknown) => {
          if (canPublish()) {
            snapshot = {
              ...snapshot,
              error: errorMessage(error),
              isLoading: false,
              current: false,
            };
            notify();
          }
        },
      )
      .finally(() => {
        if (token === revision) pending = undefined;
      });
    notify();
    return pending;
  }
  return {
    read,
    load,
    invalidate,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disposed = true;
      revision++;
      pending = undefined;
      listeners.clear();
      snapshot = { data: undefined, error: null, isLoading: true, current: false };
    },
  };
}
