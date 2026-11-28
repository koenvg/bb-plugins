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
type Action = (() => void) | { run: () => void; isAvailable: () => boolean };
type Actions = Partial<Record<TaskDetailAction, Action | null>>;
interface Registration {
  taskKey: string;
  actions: Actions;
}
interface Session {
  taskKey: string;
  rootRef: RefObject<HTMLElement | null>;
  isReady: () => boolean;
  setReady: (ready: boolean) => void;
  registrations: Set<Registration>;
  activationFrame: number | null;
}

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
    (session) => session.isReady() && isShown(session.rootRef.current),
  );
  const [session] = eligible;
  if (!session || eligible.length !== 1) return null;
  const handlers = [...session.registrations]
    .filter((entry) => entry.taskKey === session.taskKey)
    .flatMap((entry) => {
      const handler = entry.actions[action];
      if (!handler) return [];
      if (typeof handler === "function") return [handler];
      return handler.isAvailable() ? [handler.run] : [];
    });
  const [handler] = handlers;
  return handlers.length === 1 ? { session, handler } : null;
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

export const TaskCommandProvider = ({
  taskKey,
  rootRef,
  children,
}: {
  taskKey: string | null;
  rootRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) => {
  const session = useMemo<Session | null>(() => {
    if (taskKey === null) return null;
    let ready = false;
    return {
      taskKey,
      rootRef,
      isReady: () => ready,
      setReady: (next) => {
        ready = next;
      },
      registrations: new Set(),
      activationFrame: null,
    };
  }, [taskKey, rootRef]);
  useLayoutEffect(() => {
    if (!session) return;
    sessions.add(session);
    return () => {
      cancelActivation(session);
      sessions.delete(session);
    };
  }, [session]);
  return <TaskCommandContext.Provider value={session}>{children}</TaskCommandContext.Provider>;
};

export function useTaskCommandReadiness(taskKey: string, ready: boolean): void {
  const session = useContext(TaskCommandContext);
  useLayoutEffect(() => {
    if (!session || session.taskKey !== taskKey || !ready) return;
    session.setReady(true);
    return () => {
      cancelActivation(session);
      session.setReady(false);
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
