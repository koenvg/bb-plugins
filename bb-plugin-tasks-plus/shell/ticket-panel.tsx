import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { experimental_useAppPanel, type PluginFixedTabRegistration } from "@get-bb/plugin-sdk/app";
import { useShortcutScope } from "./shortcut-provider.js";
import { PaneVisibilityContext } from "../lib/pane-visibility.js";
import { useTasksSession } from "../views/detail/task-session.js";
import { Button } from "../components/ui/button.js";

// BB mounts the page and its fixed tab as separate React trees. Share only the
// plugin-owned outlet, not editor state. The page keeps owning the portal's React
// tree, so hiding or replacing a host tab cannot unmount an edit session.
const outlets = new Set<HTMLElement>();
let owner: HTMLElement | null = null;
const contents = new Set<HTMLElement>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const currentOutlet = () => owner;
const claimOutlet = (element: HTMLElement) => {
  if (!outlets.has(element) || owner === element) return;
  owner = element;
  notify();
};
const hasContent = () => contents.size > 0;

function TicketTab() {
  const root = useRef<HTMLDivElement>(null);
  const populated = useSyncExternalStore(subscribe, hasContent);
  const active = useSyncExternalStore(subscribe, currentOutlet);
  useLayoutEffect(() => {
    const element = root.current!;
    outlets.add(element);
    // First outlet keeps the editor until the user explicitly moves it.
    if (!owner) owner = element;
    notify();
    return () => {
      outlets.delete(element);
      if (owner === element) owner = outlets.values().next().value ?? null;
      notify();
    };
  }, []);
  return (
    <div ref={root} className="h-full min-h-0 min-w-0 overflow-hidden">
      {populated && active !== root.current && (
        <div className="p-6 text-sm text-muted-foreground">
          <p>The ticket is open in another pane.</p>
          <Button variant="outline" className="mt-3" onClick={() => claimOutlet(root.current!)}>
            Show ticket here
          </Button>
        </div>
      )}
      {!populated && (
        <p className="p-6 text-sm text-muted-foreground">
          Choose a ticket from the task list to view and edit it here.
        </p>
      )}
    </div>
  );
}

export const ticketTab = {
  panelId: "tasks",
  id: "ticket",
  title: "Ticket",
  icon: "ListTodo",
  layout: "flush",
  component: TicketTab,
} satisfies PluginFixedTabRegistration;

export function useOpenTicketPanel() {
  const panel = experimental_useAppPanel();
  const latest = useRef(panel);
  useLayoutEffect(() => {
    latest.current = panel;
  }, [panel]);
  return useCallback(
    () =>
      latest.current.openFixedTab({
        surface: { kind: "current" },
        tab: ticketTab,
      }),
    [],
  );
}

export type TicketAttachment = {
  element: HTMLElement;
  recovery: boolean;
} | null;
export function TicketPanelContent({
  children,
  onOutletChange,
  onReveal,
  recovery = false,
}: {
  children: ReactNode;
  onOutletChange: (attachment: TicketAttachment) => void;
  recovery?: boolean;
  onReveal: () => void;
}) {
  const outlet = useSyncExternalStore(subscribe, currentOutlet);
  const session = useTasksSession();
  useLayoutEffect(() => session?.onPendingTransition(onReveal), [session, onReveal]);
  const parking = useRef<HTMLDivElement>(null);
  const [container] = useState(() => {
    const element = document.createElement("div");
    element.className = "@container h-full min-h-0 min-w-0";
    return element;
  });
  const scope = useRef<HTMLElement | null>(container);
  useShortcutScope(scope);
  useLayoutEffect(() => {
    contents.add(container);
    notify();
    return () => {
      contents.delete(container);
      container.remove();
      notify();
    };
  }, [container]);
  useLayoutEffect(() => {
    const target = outlet ?? parking.current!;
    target.appendChild(container);
    onOutletChange(outlet || recovery ? { element: target, recovery: !outlet } : null);
  }, [outlet, recovery, container, onOutletChange]);
  return (
    <>
      <div
        ref={parking}
        hidden={!!outlet || !recovery}
        inert={!!outlet || !recovery}
        className="min-h-0 flex-1"
      />
      {createPortal(
        <PaneVisibilityContext.Provider value={outlet !== null || recovery}>
          {children}
        </PaneVisibilityContext.Provider>,
        container,
      )}
    </>
  );
}
