import { createTaskEditSession, type TaskEditSession } from "./edit-session.js";

export interface DescriptionSaveOutcome {
  ok: boolean;
  errorMessage?: string;
}
interface DescriptionSaverOptions {
  save(taskId: string, markdown: string): Promise<DescriptionSaveOutcome>;
  onError(message: string): void;
  delayMs: number;
  schedule?(run: () => void, delayMs: number): () => void;
}
export interface DescriptionSaver {
  onChange(taskId: string, markdown: string): void;
  flush(taskId: string): Promise<DescriptionSaveOutcome>;
  hasPending(): boolean;
}

/** Description-only adapter. Detail uses the same queue for all autosaved fields. */
export function createDescriptionSaver(options: DescriptionSaverOptions): DescriptionSaver {
  const sessions = new Map<string, TaskEditSession>();
  return {
    onChange(taskId, markdown) {
      let session = sessions.get(taskId);
      if (!session) {
        session = createTaskEditSession(taskId, {
          ...options,
          save: async (id, patch) => {
            const result = await options.save(id, patch.description!);
            return result.ok
              ? { ok: true }
              : {
                  ok: false,
                  errorMessage: result.errorMessage ?? "Could not save description.",
                };
          },
        });
        sessions.set(taskId, session);
      }
      session.stage({ description: markdown }, options.delayMs);
    },
    flush: (taskId) => sessions.get(taskId)?.flush() ?? Promise.resolve({ ok: true }),
    hasPending: () => [...sessions.values()].some((session) => session.getSnapshot().pending),
  };
}
