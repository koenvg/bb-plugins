import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createSafeTaskTransition } from "./safe-transition.js";
import { CommentDraftsProvider } from "../activity/comment-drafts.js";

const TasksSessionContext = createContext<ReturnType<
  typeof createSafeTaskTransition
> | null>(null);

/** Mount once around the Tasks workspace, not once per selected ticket. */
export function TasksSessionProvider({ children }: { children: ReactNode }) {
  const [transition] = useState(createSafeTaskTransition);
  useEffect(() => () => transition.cancel(), [transition]);
  return (
    <TasksSessionContext.Provider value={transition}>
      <CommentDraftsProvider>{children}</CommentDraftsProvider>
    </TasksSessionContext.Provider>
  );
}

export function useTasksSession() {
  return useContext(TasksSessionContext);
}

/** Host/palette/history route changes also pass the active editor's barrier.
 * Internal navigation should request its commit before changing the host URL. */
export function useSafeTaskTarget(requested: string): string {
  const transition = useTasksSession();
  const [committed, setCommitted] = useState(requested);
  const previous = useRef(requested);
  useLayoutEffect(() => {
    if (previous.current === requested) return;
    previous.current = requested;
    const commit = () => setCommitted(requested);
    if (transition) void transition.request(commit);
    else commit();
  }, [requested, transition]);
  return committed;
}
