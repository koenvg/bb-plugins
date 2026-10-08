import type { TaskEditSession } from "./edit-session.js";

/** One active editable ticket, one latest destination. Callers put all route,
 * selection, or context mutations in commit, never before request resolves.
 * Failure keeps that destination for retry; cancel forgets it without saving.
 * request throws on synchronous reentry or during commit, before changing the
 * destination. Requests during an active save still share the latest destination. */
export function createSafeTaskTransition() {
  let editor: TaskEditSession | undefined;
  let destination: (() => void) | undefined;
  let running: Promise<boolean> | undefined;
  let requesting = false;
  let committing = false;
  const pendingListeners = new Set<() => void>();
  const run = (): Promise<boolean> => {
    if (running) return running;
    if (!editor?.getSnapshot().pending) {
      committing = true;
      try {
        const commit = destination;
        destination = undefined;
        commit?.();
        return Promise.resolve(true);
      } finally {
        committing = false;
      }
    }
    running = (async () => {
      while (editor?.getSnapshot().pending) {
        if (!(await editor.flush()).ok) return false;
      }
      // Hold this guard until running clears, including commit's microtasks.
      committing = true;
      const commit = destination;
      destination = undefined;
      commit?.();
      return commit !== undefined;
    })().finally(() => {
      running = undefined;
      committing = false;
    });
    return running;
  };
  return {
    /** Let a retained editor reveal its originating view before a guarded save. */
    onPendingTransition(listener: () => void) {
      pendingListeners.add(listener);
      return () => {
        pendingListeners.delete(listener);
      };
    },
    register(next: TaskEditSession) {
      editor = next;
      return () => {
        if (editor === next) editor = undefined;
      };
    },
    request(commit: () => void) {
      if (requesting || committing) {
        throw new Error(
          "Safe task transition cannot request a destination during another request or commit",
        );
      }
      requesting = true;
      try {
        destination = commit;
        if (editor?.getSnapshot().pending) pendingListeners.forEach((listener) => listener());
        return run();
      } finally {
        requesting = false;
      }
    },
    retry: run,
    cancel() {
      destination = undefined;
    },
  };
}
