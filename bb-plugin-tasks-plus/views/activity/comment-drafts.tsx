import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { StagedAttachment } from "../../components/staged-attachments.js";

interface CommentDraft {
  body: string;
  bodyRevision: number;
  notify: boolean;
  pendingFiles: StagedAttachment[];
  sending: boolean;
  error: string | null;
}
function createCommentDraft(taskId: string) {
  let snapshot: CommentDraft = {
    body: "",
    bodyRevision: 0,
    notify: true,
    pendingFiles: [],
    sending: false,
    error: null,
  };
  const listeners = new Set<() => void>();
  return {
    taskId,
    getSnapshot: () => snapshot,
    update(change: Partial<CommentDraft> | ((draft: CommentDraft) => Partial<CommentDraft>)) {
      const patch = typeof change === "function" ? change(snapshot) : change;
      const bodyChanged = patch.body !== undefined && patch.body !== snapshot.body;
      snapshot = {
        ...snapshot,
        ...patch,
        bodyRevision: snapshot.bodyRevision + (bodyChanged ? 1 : 0),
      };
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
type DraftRecord = ReturnType<typeof createCommentDraft>;
const DraftsContext = createContext<Map<string, DraftRecord> | null>(null);

/** In-memory only. The provider owns the map for its mounted session; there is
 * no module singleton or storage. Pending explicit sends retain only their own
 * record, never the next ticket's setter. File previews revoke URLs on unmount. */
export function CommentDraftsProvider({ children }: { children: ReactNode }) {
  const [drafts] = useState(() => new Map<string, DraftRecord>());
  return <DraftsContext.Provider value={drafts}>{children}</DraftsContext.Provider>;
}

export function useCommentDraft(taskId: string) {
  const drafts = useContext(DraftsContext);
  const record = useMemo(() => {
    const existing = drafts?.get(taskId);
    if (existing) return existing;
    const created = createCommentDraft(taskId);
    drafts?.set(taskId, created);
    return created;
  }, [drafts, taskId]);
  const snapshot = useSyncExternalStore(record.subscribe, record.getSnapshot);
  return [snapshot, record] as const;
}
