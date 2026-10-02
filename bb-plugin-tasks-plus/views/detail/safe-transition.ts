import type { TaskEditSession } from "./edit-session.js";

/** One active editable ticket, one latest destination. Callers put all route,
 * selection, or context mutations in commit, never before request resolves.
 * Failure keeps that destination for retry; cancel forgets it without saving. */
export function createSafeTaskTransition() {
  let editor: TaskEditSession | undefined;
  let destination: (() => void) | undefined;
  let running: Promise<boolean> | undefined;
  const run = (): Promise<boolean> => {
    if (running) return running;
    if (!editor?.getSnapshot().pending) {
      const commit = destination;
      destination = undefined;
      commit?.();
      return Promise.resolve(true);
    }
    running = (async () => {
      while (editor?.getSnapshot().pending) {
        if (!(await editor.flush()).ok) return false;
      }
      const commit = destination;
      destination = undefined;
      commit?.();
      return commit !== undefined;
    })().finally(() => {
      running = undefined;
    });
    return running;
  };
  return {
    register(next: TaskEditSession) {
      editor = next;
      return () => {
        if (editor === next) editor = undefined;
      };
    },
    request(commit: () => void) {
      destination = commit;
      return run();
    },
    retry: run,
    cancel() {
      destination = undefined;
    },
  };
}
