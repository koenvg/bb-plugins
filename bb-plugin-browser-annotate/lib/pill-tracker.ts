export const PILL_REMOVAL_DELAY_MS = 3000;

export interface PillTrackerDeps {
  remove(threadId: string, id: string): Promise<unknown>;
  clearResolved(threadId: string): Promise<{ removed: string[] }>;
  hide(id: string): void;
  show(id: string): void;
  delayMs?: number;
}

// Missing pills during submission are not user removals. Only onSubmitted
// retires sent pins; failed sends can restore the draft after any duration.
export function createPillTracker(deps: PillTrackerDeps) {
  const delayMs = deps.delayMs ?? PILL_REMOVAL_DELAY_MS;
  const seen = new Map<string, Set<string>>();
  const submitting = new Map<string, Set<string>>();
  const pending = new Map<string, Map<string, ReturnType<typeof setTimeout>>>();

  const pendingFor = (threadId: string) => {
    let timers = pending.get(threadId);
    if (!timers) {
      pending.set(threadId, (timers = new Map()));
    }
    return timers;
  };

  return {
    observe(threadId: string, ids: readonly string[], isSubmitting = false) {
      const present = new Set(ids);
      const known = seen.get(threadId) ?? new Set<string>();
      const timers = pendingFor(threadId);
      if (isSubmitting) {
        if (!submitting.has(threadId)) {
          submitting.set(threadId, new Set(known));
        }
        for (const [id, timer] of timers) {
          clearTimeout(timer);
          deps.show(id);
        }
        timers.clear();
      } else {
        submitting.delete(threadId);
      }
      for (const id of present) {
        const timer = timers.get(id);
        if (timer !== undefined) {
          clearTimeout(timer);
          timers.delete(id);
          deps.show(id);
        }
        known.add(id);
      }
      for (const id of known) {
        if (isSubmitting || present.has(id) || timers.has(id)) {
          continue;
        }
        deps.hide(id);
        timers.set(
          id,
          setTimeout(() => {
            timers.delete(id);
            known.delete(id);
            void deps.remove(threadId, id).catch(() => deps.show(id));
          }, delayMs),
        );
      }
      seen.set(threadId, known);
    },
    submitted(threadId: string) {
      const timers = pendingFor(threadId);
      const known = seen.get(threadId);
      for (const id of submitting.get(threadId) ?? known ?? []) {
        const timer = timers.get(id);
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        timers.delete(id);
        deps.hide(id);
        known?.delete(id);
      }
      // Keep this submission captured until isSubmitting becomes false.
      // Annotations added to the next draft must not join the completed send.
      submitting.set(threadId, new Set());
      // Accepted queued messages can resolve mentions after this event.
      // Resolution cleanup must not restore their pins or delete their captures.
      void deps.clearResolved(threadId).catch(() => undefined);
    },
    dispose() {
      for (const timers of pending.values()) {
        for (const timer of timers.values()) {
          clearTimeout(timer);
        }
      }
      pending.clear();
      seen.clear();
      submitting.clear();
    },
  };
}
