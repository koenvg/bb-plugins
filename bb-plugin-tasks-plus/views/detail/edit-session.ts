import type { Task } from "../../shared/contract.js";
import { errorMessage } from "../../shared/errors.js";

export type TaskEditPatch = Partial<
  Pick<Task, "title" | "description" | "status" | "priority" | "dueDate" | "labelIds">
>;
export type SaveOutcome = { ok: true } | { ok: false; errorMessage: string };
export interface EditSnapshot {
  draft: TaskEditPatch;
  pending: boolean;
  saving: boolean;
  error: string | null;
}
export interface TaskEditSession {
  readonly taskId: string;
  stage(patch: TaskEditPatch, delayMs?: number): void;
  flush(): Promise<SaveOutcome>;
  getSnapshot(): EditSnapshot;
  subscribe(listener: () => void): () => void;
}

/** One mounted ticket's autosaves. flush confirms every edit, including edits
 * made during the request. A failed attempt retains the latest draft for retry.
 * The immutable taskId and single drain prevent cross-task and out-of-order writes. */
export function createTaskEditSession(
  taskId: string,
  options: {
    save(taskId: string, patch: TaskEditPatch): Promise<SaveOutcome>;
    onError?(message: string): void;
    schedule?(run: () => void, delayMs: number): () => void;
  },
): TaskEditSession {
  let snapshot: EditSnapshot = {
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
  const publish = (change: Partial<EditSnapshot>) => {
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
    running = (async (): Promise<SaveOutcome> => {
      while (Object.keys(pending).length > 0) {
        const attempt = pending;
        pending = {};
        let outcome: SaveOutcome;
        try {
          outcome = await options.save(taskId, attempt);
        } catch (cause) {
          outcome = { ok: false, errorMessage: errorMessage(cause) };
        }
        if (!outcome.ok) {
          clearTimer();
          pending = { ...attempt, ...pending };
          publish({ error: outcome.errorMessage });
          options.onError?.(outcome.errorMessage);
          return outcome;
        }
        const draft = { ...snapshot.draft };
        for (const key of Object.keys(attempt) as (keyof TaskEditPatch)[]) {
          if (!(key in pending)) delete draft[key];
        }
        publish({ draft });
      }
      publish({ pending: false });
      return { ok: true };
    })().finally(() => {
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
