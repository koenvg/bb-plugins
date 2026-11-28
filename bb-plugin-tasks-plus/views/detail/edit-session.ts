import type { Task } from "../../shared/contract.js";
import { errorMessage } from "../../shared/errors.js";

export type TaskEditPatch = Partial<
  Pick<Task, "title" | "description" | "status" | "priority" | "dueDate" | "labelIds">
>;
export type SaveOutcome<Confirmation = undefined> =
  | { ok: true; confirmation?: Confirmation }
  | { ok: false; errorMessage: string };
export interface EditSnapshot<Confirmation = undefined> {
  draft: TaskEditPatch;
  pending: boolean;
  saving: boolean;
  error: string | null;
  confirmation?: Confirmation;
}
export interface TaskEditSession<Confirmation = undefined> {
  readonly taskId: string;
  stage: (patch: TaskEditPatch, delayMs?: number) => void;
  flush: () => Promise<SaveOutcome>;
  getSnapshot: () => EditSnapshot<Confirmation>;
  subscribe: (listener: () => void) => () => void;
}

/** One mounted ticket's autosaves. flush confirms every edit, including edits
 * made during the request. A failed attempt retains the latest draft for retry.
 * The immutable taskId and single drain prevent cross-task and out-of-order writes. */
export function createTaskEditSession<Confirmation = undefined>(
  taskId: string,
  options: {
    save: (taskId: string, patch: TaskEditPatch) => Promise<SaveOutcome<Confirmation>>;
    onError?: (message: string) => void;
    schedule?: (run: () => void, delayMs: number) => () => void;
  },
): TaskEditSession<Confirmation> {
  let snapshot: EditSnapshot<Confirmation> = {
    draft: {},
    pending: false,
    saving: false,
    error: null,
  };
  let pending: TaskEditPatch = {};
  let running: Promise<SaveOutcome> | undefined;
  let cancelTimer: (() => void) | undefined;
  const clearTimer = () => {
    cancelTimer?.();
    cancelTimer = undefined;
  };
  const listeners = new Set<() => void>();
  const publish = (change: Partial<EditSnapshot<Confirmation>>) => {
    snapshot = { ...snapshot, ...change };
    listeners.forEach((listener) => listener());
  };
  const schedule =
    options.schedule ??
    ((run, delay) => {
      const timer = setTimeout(run, delay);
      return () => clearTimeout(timer);
    });
  const flush = (): Promise<SaveOutcome> => {
    clearTimer();
    if (running) return running;
    if (!snapshot.pending) return Promise.resolve({ ok: true });
    publish({ saving: true, error: null });
    const { promise, resolve, reject } = Promise.withResolvers<SaveOutcome>();
    const saveNext = async () => {
      try {
        if (Object.keys(pending).length === 0) {
          publish({ pending: false });
          resolve({ ok: true });
          return;
        }
        const attempt = pending;
        pending = {};
        let outcome: SaveOutcome<Confirmation>;
        try {
          outcome = await options.save(taskId, attempt);
        } catch (error) {
          outcome = { ok: false, errorMessage: errorMessage(error) };
        }
        if (!outcome.ok) {
          clearTimer();
          pending = { ...attempt, ...pending };
          publish({ error: outcome.errorMessage });
          options.onError?.(outcome.errorMessage);
          resolve(outcome);
          return;
        }
        const draft = { ...snapshot.draft };
        for (const key of Object.keys(attempt) as (keyof TaskEditPatch)[]) {
          if (!(key in pending)) Reflect.deleteProperty(draft, key);
        }
        publish({
          draft,
          ...(outcome.confirmation === undefined ? {} : { confirmation: outcome.confirmation }),
        });
        void saveNext();
      } catch (error) {
        reject(error);
      }
    };
    void saveNext();
    running = promise.finally(() => {
      running = undefined;
      publish({ saving: false });
    });
    return running;
  };
  return {
    taskId,
    stage(patch, delayMs = 0) {
      pending = { ...pending, ...patch };
      publish({ draft: { ...snapshot.draft, ...patch }, pending: true });
      cancelTimer?.();
      // After a failure only an explicit flush/retry attempts another write.
      if (snapshot.error) return;
      cancelTimer = schedule(() => {
        void flush();
      }, delayMs);
    },
    flush,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
