import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ListView, type VisibleTaskOrder } from "../views/list/index.js";
import { DetailView } from "../views/detail/index.js";
import { useTasksSession } from "../views/detail/task-session.js";
import { ShortcutOwner } from "./shortcut-provider.js";
import { TicketPanelContent, useOpenTicketPanel, type TicketAttachment } from "./ticket-panel.js";
import {
  canRestoreBrowseFocus,
  useBrowseFocus,
  useBrowseShortcuts,
  type BrowseFocusTarget,
} from "./browse-keyboard.js";
import {
  PANEL_PATH,
  TaskLinkNavigationContext,
  tasksRouteToSubPath,
  useTasksNavigation,
  type ResolvedTasksRoute,
} from "./routes.js";

export type BrowseRoute = Extract<ResolvedTasksRoute, { kind: "all" | "active" | "project" }>;

/** The accepted route is the only selected identity. The list owns its rendered order;
 * this boundary owns composition and safe requests, never another editor session. */
export function BrowseWorkspace({
  route,
  noProjects = false,
}: {
  route: BrowseRoute;
  noProjects?: boolean;
}) {
  const navigate = useBbNavigate();
  const navigation = useTasksNavigation();
  const session = useTasksSession()!;
  const [order, setOrder] = useState<VisibleTaskOrder>({
    keys: [],
    settled: false,
  });
  const selectedKey = route.taskKey ?? null;
  // Validation gates first lookup; the list reconciles subsequent removals while
  // retaining the originating rendered tree until safe clearing is accepted.
  const [validatedKey, setValidatedKey] = useState<string | null>(null);
  const showTicket = useOpenTicketPanel();
  const [paneUnavailable, setPaneUnavailable] = useState(false);
  const openTicket = useCallback(() => {
    setPaneUnavailable(!showTicket());
  }, [showTicket]);
  const [attachment, setAttachment] = useState<TicketAttachment>(null);
  const detailOutlet = attachment?.element ?? null;
  const detailVisible = attachment !== null;
  const recovering = attachment?.recovery === true;
  const revealedSelection = useRef<string | null>(null);
  const [contextRevision, setContextRevision] = useState(0);
  const latestNoProjects = useRef(noProjects);
  useLayoutEffect(() => {
    latestNoProjects.current = noProjects;
  }, [noProjects]);
  const listRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const detailScroll = useRef({ key: selectedKey, top: 0 });
  const focus = useBrowseFocus(selectedKey, listRef, detailRef);
  const latestOrder = useRef(order);
  useLayoutEffect(() => {
    latestOrder.current = order;
  }, [order]);
  const returnFocus = useRef(false);
  // List and detail can confirm the same removal in one refresh.
  const clearing = useRef(false);
  useLayoutEffect(() => {
    clearing.current = false;
  }, [selectedKey]);

  const commitSelection = useCallback(
    (taskKey: string | null) => {
      if (taskKey === null && clearing.current) return;
      clearing.current = taskKey === null;
      navigate.toPluginPanel(PANEL_PATH, {
        subPath: tasksRouteToSubPath({
          ...route,
          taskKey: taskKey ?? undefined,
        }),
        replace: true,
      });
    },
    [navigate, route],
  );
  const requestContextChange = useCallback(
    (commit: () => void) => {
      focus.cancel();
      void session.request(() => {
        commit();
        // Re-evaluate durable absence after an accepted non-selection context
        // change, even when it replaced a previously failed removal request.
        setContextRevision((revision) => revision + 1);
      });
    },
    [session, focus.cancel],
  );
  const requestSelection = useCallback(
    (taskKey: string | null, target?: BrowseFocusTarget) => {
      focus.cancel();
      // Reveal on the user's request, not after a delayed save. A later host
      // tab switch must not be undone when that save eventually finishes.
      if (taskKey) openTicket();
      void session.request(() => {
        // A saved navigation must still point at a confirmed visible result.
        if (
          target &&
          (!latestOrder.current.settled || !latestOrder.current.keys.includes(taskKey!))
        )
          return;
        // Only an accepted destination consumes its reveal. A failed request
        // retains this callback for Retry, while cancellation consumes nothing.
        revealedSelection.current = taskKey;
        if (target && taskKey) focus.arm(taskKey, target);
        if (taskKey !== selectedKey || !target) commitSelection(taskKey);
      });
    },
    [session, commitSelection, selectedKey, focus.cancel, focus.arm, openTicket],
  );

  useEffect(() => {
    if (selectedKey === null) {
      setValidatedKey(null);
      return;
    }
    if (selectedKey === validatedKey || !order.settled) return;
    if (order.keys.includes(selectedKey)) setValidatedKey(selectedKey);
    else requestSelection(null);
  }, [selectedKey, validatedKey, order, requestSelection]);

  const openTaskLink = useCallback(
    (taskKey: string) => {
      const key = taskKey.toUpperCase();
      if (order.keys.includes(key)) requestSelection(key);
      else navigation.go({ kind: "task", taskKey });
    },
    [order.keys, requestSelection, navigation],
  );
  const onMissing = useCallback(
    (taskKey: string, stillUnavailable: () => boolean = () => true) => {
      if (taskKey !== selectedKey) return;
      focus.cancel();
      void session.request(() => {
        if (stillUnavailable()) commitSelection(null);
      });
    },
    [selectedKey, session, commitSelection, focus.cancel],
  );
  // A restored or externally accepted selection reveals the native Ticket tab.
  // Closing or switching tabs alone must not trigger an automatic reopen.
  useEffect(() => {
    if (selectedKey && selectedKey !== revealedSelection.current) openTicket();
    revealedSelection.current = selectedKey;
  }, [selectedKey, openTicket]);
  useEffect(() => {
    if (noProjects && selectedKey) onMissing(selectedKey, () => latestNoProjects.current);
  }, [noProjects, selectedKey, onMissing, contextRevision]);
  const readyKey = selectedKey === validatedKey ? selectedKey : null;
  const detailHidden = !detailVisible;

  useLayoutEffect(() => {
    if (detailScroll.current.key !== selectedKey) {
      detailScroll.current = { key: selectedKey, top: 0 };
    }
    if (!detailHidden && detailRef.current) {
      detailRef.current.scrollTop = detailScroll.current.top;
    }
  }, [detailHidden, selectedKey, detailOutlet]);
  const backToList = () =>
    requestContextChange(() => {
      returnFocus.current = true;
      setPaneUnavailable(false);
    });
  const paging = useBrowseShortcuts({
    selectedKey,
    order,
    listRef,
    detailRef,
    requestSelection,
    back: backToList,
  });
  useLayoutEffect(() => {
    const list = listRef.current;
    const detail = detailRef.current;
    if (!list || !detail) return;
    const requestedReturn = returnFocus.current;
    if (requestedReturn && recovering) return;
    returnFocus.current = false;
    // Hiding a mounted pane must not leave its controls holding keyboard focus.
    // Resize never focuses an editor, nor steals focus from another BB pane.
    if (
      (requestedReturn && canRestoreBrowseFocus(list, detail)) ||
      (detailHidden && detail.contains(document.activeElement))
    ) {
      const target =
        list.querySelector<HTMLElement>('[data-nav-item][aria-current="true"]') ?? list;
      target.focus({ preventScroll: true });
    }
  }, [detailHidden, contextRevision, recovering]);
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden" data-browse-layout="native">
      {recovering && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-sm"
        >
          <span className="flex-1">BB couldn't open the Ticket pane. Recover your edits here.</span>
          <Button variant="outline" size="sm" onClick={openTicket}>
            Try Ticket pane again
          </Button>
          <Button variant="ghost" size="sm" onClick={backToList}>
            Back to list
          </Button>
        </div>
      )}
      <section
        ref={listRef}
        aria-label="Ticket list"
        hidden={recovering}
        inert={recovering}
        tabIndex={-1}
        className="flex h-full min-h-0 flex-col min-w-0 flex-1"
      >
        <div className="min-h-0 flex-1">
          <ShortcutOwner value={{ rootRef: listRef, allowUnfocused: true }}>
            <ListView
              projectId={route.kind === "project" ? route.projectId : null}
              activeOnly={route.kind === "active"}
              visible={true}
              selectedTaskKey={readyKey}
              onRequestSelection={requestSelection}
              onVisibleOrderChange={setOrder}
              onRequestContextChange={requestContextChange}
              onSelectionUnavailable={onMissing}
              reconcileRevision={contextRevision}
              scopeUnavailable={noProjects}
            />
          </ShortcutOwner>
        </div>
      </section>
      <TicketPanelContent
        onOutletChange={setAttachment}
        onReveal={openTicket}
        recovery={paneUnavailable && selectedKey !== null}
      >
        <section
          ref={detailRef}
          aria-label="Selected ticket"
          hidden={detailHidden}
          inert={detailHidden}
          tabIndex={-1}
          onScroll={(event) => {
            if (!detailHidden) {
              detailScroll.current = {
                key: selectedKey,
                top: event.currentTarget.scrollTop,
              };
            }
          }}
          className="h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain"
        >
          <ShortcutOwner value={{ rootRef: detailRef }}>
            {selectedKey ? (
              <>
                <div className="sticky top-0 z-10 flex min-h-10 bg-background items-center gap-2 border-b border-border-hairline px-3 text-xs text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">{selectedKey}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 pointer-coarse:size-11"
                    aria-label="Previous task"
                    disabled={!paging.previous}
                    onClick={() => paging.move(-1)}
                  >
                    <Icon name="ChevronUp" className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 pointer-coarse:size-11"
                    aria-label="Next task"
                    disabled={!paging.next}
                    onClick={() => paging.move(1)}
                  >
                    <Icon name="ChevronDown" className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                    aria-label="Open standalone ticket"
                    onClick={() => navigation.go({ kind: "task", taskKey: selectedKey })}
                  >
                    <Icon name="ArrowUpRight" className="size-3.5" />
                  </Button>
                </div>
                {readyKey ? (
                  <TaskLinkNavigationContext.Provider value={openTaskLink}>
                    <DetailView
                      taskKey={readyKey}
                      onReady={focus.onReady}
                      onMissing={onMissing}
                      reconcileRevision={contextRevision}
                    />
                  </TaskLinkNavigationContext.Provider>
                ) : (
                  <p role="status" className="p-6 text-sm text-muted-foreground">
                    Waiting for the ticket list…
                  </p>
                )}
              </>
            ) : (
              <p className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                Select a ticket to view and edit
              </p>
            )}
          </ShortcutOwner>
        </section>
      </TicketPanelContent>
    </div>
  );
}
