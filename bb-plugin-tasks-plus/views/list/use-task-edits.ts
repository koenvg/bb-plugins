import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import type { Task } from "../../shared/contract.js";
import { errorMessage } from "../../shared/errors.js";
import { useTasksRpc } from "../../shell/data.js";
import {
  beginEdit,
  pendingIds,
  reconcileEntries,
  settleFailure,
  settleSuccess,
  type TaskEdit,
  type TaskEntries,
} from "./optimistic.js";

interface ListTaskEditController {
  entries: TaskEntries;
  pending: ReadonlySet<string>;
  edit: (task: Task, patch: TaskEdit) => void;
}

function createListEditStore() {
  let entries: TaskEntries = new Map();
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => entries,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(change: (previous: TaskEntries) => TaskEntries) {
      const next = change(entries);
      if (next === entries) return;
      entries = next;
      listeners.forEach((listener) => listener());
    },
  };
}

export function useListTaskEdits(
  serverTasks: readonly Task[] | undefined,
  onError: (message: string) => void,
): ListTaskEditController {
  const rpc = useTasksRpc();
  const store = useMemo(() => createListEditStore(), []);
  const entries = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const genRef = useRef(0);
  const onErrorRef = useRef(onError);
  useLayoutEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (serverTasks !== undefined) store.update((prev) => reconcileEntries(prev, serverTasks));
  }, [serverTasks, store]);

  const edit = useCallback(
    (task: Task, patch: TaskEdit) => {
      const gen = (genRef.current += 1);
      store.update((prev) => beginEdit(prev, task.id, patch, gen));

      void rpc.call("updateTask", { taskId: task.id, ...patch }).then(
        (result) => {
          if (result.ok) {
            store.update((prev) => settleSuccess(prev, task.id, patch, gen, result.task));
          } else {
            store.update((prev) => settleFailure(prev, task.id, patch, gen));
            onErrorRef.current(result.error.message);
          }
          return;
        },
        (updateError: unknown) => {
          store.update((prev) => settleFailure(prev, task.id, patch, gen));
          onErrorRef.current(errorMessage(updateError));
        },
      );
    },
    [rpc, store],
  );

  const pending = useMemo(() => pendingIds(entries), [entries]);

  return { entries, pending, edit };
}
