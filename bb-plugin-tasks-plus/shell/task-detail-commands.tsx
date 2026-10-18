import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  type ReactNode,
  type RefObject,
} from "react";

export type TaskDetailAction =
  | "status"
  | "priority"
  | "dueDate"
  | "labels"
  | "linkedProject"
  | "dispatch"
  | "previous"
  | "next"
  | "back";
type Actions = Partial<Record<TaskDetailAction, (() => void) | null>>;
type Registration = { taskKey: string; actions: Actions };
type Session = {
  taskKey: string;
  rootRef: RefObject<HTMLElement | null>;
  loadedKey: string | null;
  registrations: Set<Registration>;
  activationFrame: number | null;
};

const sessions = new Set<Session>();
const TaskCommandContext = createContext<Session | null>(null);

function isShown(root: HTMLElement | null): boolean {
  if (!root?.isConnected || root.getClientRects().length === 0) return false;
  for (let element: HTMLElement | null = root; element; element = element.parentElement) {
    const style = getComputedStyle(element);
    if (
      element.hidden ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      style.contentVisibility === "hidden"
    )
      return false;
  }
  return true;
}

function resolve(action: TaskDetailAction): { session: Session; handler: () => void } | null {
  const eligible = [...sessions].filter(
    (session) => session.loadedKey === session.taskKey && isShown(session.rootRef.current),
  );
  if (eligible.length !== 1) return null;
  const session = eligible[0]!;
  const handlers = [...session.registrations]
    .filter((entry) => entry.taskKey === session.taskKey)
    .flatMap((entry) => (entry.actions[action] ? [entry.actions[action]!] : []));
  return handlers.length === 1 ? { session, handler: handlers[0]! } : null;
}

export function canRunTaskDetailAction(action: TaskDetailAction): boolean {
  return resolve(action) !== null;
}

function cancelActivation(session: Session): void {
  if (session.activationFrame !== null) cancelAnimationFrame(session.activationFrame);
  session.activationFrame = null;
}

export function runTaskDetailAction(action: TaskDetailAction): void {
  const target = resolve(action);
  if (!target) return;
  const { session } = target;
  cancelActivation(session);
  // Radix close autofocus can run after the first frame. Activate after that handoff.
  session.activationFrame = requestAnimationFrame(() => {
    session.activationFrame = requestAnimationFrame(() => {
      session.activationFrame = null;
      const current = resolve(action);
      if (current?.session === session) current.handler();
    });
  });
}

export function TaskCommandProvider({
  taskKey,
  rootRef,
  children,
}: {
  taskKey: string | null;
  rootRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const session = useMemo<Session | null>(
    () =>
      taskKey === null
        ? null
        : {
            taskKey,
            rootRef,
            loadedKey: null,
            registrations: new Set(),
            activationFrame: null,
          },
    [taskKey, rootRef],
  );
  useLayoutEffect(() => {
    if (!session) return;
    sessions.add(session);
    return () => {
      cancelActivation(session);
      sessions.delete(session);
    };
  }, [session]);
  return <TaskCommandContext.Provider value={session}>{children}</TaskCommandContext.Provider>;
}

export function useTaskCommandReadiness(taskKey: string, ready: boolean): void {
  const session = useContext(TaskCommandContext);
  useLayoutEffect(() => {
    if (!session || session.taskKey !== taskKey || !ready) return;
    session.loadedKey = taskKey;
    return () => {
      cancelActivation(session);
      session.loadedKey = null;
    };
  }, [session, taskKey, ready]);
}

export function useTaskCommandActions(taskKey: string, actions: Actions): void {
  const session = useContext(TaskCommandContext);
  useLayoutEffect(() => {
    if (!session || session.taskKey !== taskKey) return;
    const entry = { taskKey, actions };
    session.registrations.add(entry);
    return () => {
      session.registrations.delete(entry);
    };
  }, [session, taskKey, actions]);
}
