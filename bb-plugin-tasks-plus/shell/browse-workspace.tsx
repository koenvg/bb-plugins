import { useCallback, useEffect, useRef, useState } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ListView, type VisibleTaskOrder } from "../views/list/index.js";
import { DetailView } from "../views/detail/index.js";
import { useTasksSession } from "../views/detail/task-session.js";
import { ShortcutOwner } from "./shortcut-provider.js";
import {
  PANEL_PATH,
  TaskLinkNavigationContext,
  tasksRouteToSubPath,
  useTasksNavigation,
  type ResolvedTasksRoute,
} from "./routes.js";

export type BrowseRoute = Extract<
  ResolvedTasksRoute,
  { kind: "all" | "active" | "project" }
>;

/** The accepted route is the only selected identity. The list owns its rendered order;
 * this boundary owns composition and safe requests, never another editor session. */
export function BrowseWorkspace({
  route,
  split,
}: {
  route: BrowseRoute;
  split: boolean;
}) {
  const navigate = useBbNavigate();
  const navigation = useTasksNavigation();
  const session = useTasksSession()!;
  const [order, setOrder] = useState<VisibleTaskOrder>({
    keys: [],
    settled: false,
  });
  const selectedKey = route.taskKey ?? null;
  // Validate a route target once against a settled list. Dynamic reconciliation
  // after filter/refresh/collapse belongs to the next slice, not this proof.
  const [validatedKey, setValidatedKey] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const listRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);

  const requestSelection = useCallback(
    (taskKey: string | null) => {
      void session.request(() => {
        setShowList(false);
        navigate.toPluginPanel(PANEL_PATH, {
          subPath: tasksRouteToSubPath({
            ...route,
            taskKey: taskKey ?? undefined,
          }),
          replace: true,
        });
      });
    },
    [session, navigate, route],
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
    (taskKey: string) => {
      if (taskKey === selectedKey) requestSelection(null);
    },
    [selectedKey, requestSelection],
  );
  const readyKey = selectedKey === validatedKey ? selectedKey : null;
  const listHidden = !split && selectedKey !== null && !showList;

  return (
    <div
      className="flex h-full min-h-0 overflow-hidden"
      data-browse-layout={split ? "split" : "compact"}
    >
      <section
        ref={listRef}
        aria-label="Ticket list"
        hidden={listHidden}
        className={
          split
            ? "h-full min-h-0 min-w-0 shrink-0 border-r border-border-hairline"
            : "h-full min-h-0 min-w-0 flex-1"
        }
        style={
          split ? { width: "32%", minWidth: 320, maxWidth: 400 } : undefined
        }
      >
        <ShortcutOwner value={{ rootRef: listRef, allowUnfocused: true }}>
          <ListView
            projectId={route.kind === "project" ? route.projectId : null}
            activeOnly={route.kind === "active"}
            selectedTaskKey={readyKey}
            onRequestSelection={requestSelection}
            onVisibleOrderChange={setOrder}
          />
        </ShortcutOwner>
      </section>
      <section
        ref={detailRef}
        aria-label="Selected ticket"
        hidden={!split && !listHidden}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <ShortcutOwner value={{ rootRef: detailRef }}>
          {selectedKey ? (
            <>
              <div className="flex min-h-10 items-center gap-2 border-b border-border-hairline px-3 text-xs text-muted-foreground">
                {!split ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void session.request(() => setShowList(true));
                    }}
                  >
                    <Icon name="ChevronLeft" className="size-3.5" />
                    Back to list
                  </Button>
                ) : null}
                <span className="min-w-0 flex-1 truncate">{selectedKey}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Open standalone ticket"
                  onClick={() =>
                    navigation.go({ kind: "task", taskKey: selectedKey })
                  }
                >
                  <Icon name="ArrowUpRight" className="size-3.5" />
                </Button>
              </div>
              {readyKey ? (
                <TaskLinkNavigationContext.Provider value={openTaskLink}>
                  <DetailView taskKey={readyKey} onMissing={onMissing} />
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
    </div>
  );
}
