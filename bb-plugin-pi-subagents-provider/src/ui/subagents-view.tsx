import { Markdown } from "@get-bb/plugin-sdk/app";
import {
  Component,
  createRef,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type ViewRow, type ViewState } from "../subagents-contract.js";

function elapsed(row: ViewRow) {
  const terminal = !["queued", "running", "unknown", "detached"].includes(row.state);
  const duration =
    row.durationMs ??
    (row.startedAt !== undefined && (!terminal || row.endedAt !== undefined)
      ? Math.max(0, (row.endedAt ?? row.observedAt) - row.startedAt)
      : undefined);
  if (duration === undefined) return "Duration unavailable";
  return `${terminal ? "Total" : "Elapsed"} ${Math.floor(duration / 1000)}s${terminal ? "" : " at observation"}`;
}
function modelLabel(row: ViewRow) {
  const model = row.capture?.resolvedModel;
  return model ? `Captured model: ${model.model} · ${model.provider}` : "Model unavailable";
}
type OverviewEntry = Readonly<{ row: ViewRow; depth: number; rawPosition: number }>;
function canFlattenWorkflow(row: ViewRow, hasTraversableChild: boolean) {
  const capture = row.capture;
  return (
    row.kind === "workflow" &&
    row.state === "complete" &&
    !row.incomplete &&
    hasTraversableChild &&
    !capture?.task?.trim() &&
    !capture?.finalOutput?.trim() &&
    !capture?.messages?.length &&
    !capture?.resolvedModel &&
    (!capture || capture.status === "captured") &&
    !capture?.reason?.trim() &&
    !capture?.truncated?.task &&
    !capture?.truncated?.finalOutput &&
    !(capture?.truncated && capture.truncated.messages > 0)
  );
}
function projectRows(rows: readonly ViewRow[]) {
  const ordered: ViewRow[] = [];
  const overviewEntries: OverviewEntry[] = [];
  const seen = new Set<string>();
  function visit(row: ViewRow, depth: number) {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    const rawPosition = ordered.length;
    ordered.push(row);
    const children = rows.filter((child) => child.parentId === row.id);
    const hidden = canFlattenWorkflow(
      row,
      children.some((child) => !seen.has(child.id)),
    );
    if (!hidden) overviewEntries.push({ row, depth: Math.min(depth, 4), rawPosition });
    for (const child of children) visit(child, depth + (hidden ? 0 : 1));
  }
  for (const row of rows.filter((r) => !r.parentId || !rows.some((p) => p.id === r.parentId)))
    visit(row, 0);
  for (const row of rows) visit(row, 0);
  return { ordered, overviewEntries };
}
function rowPresentation(row: ViewRow, orderedPosition: number) {
  const kindContext = `${row.source === "background" ? "Background" : "Foreground"} ${row.kind}`;
  return {
    purpose: row.capture?.task?.trim().replace(/\s+/g, " ") || `${kindContext} · task unavailable`,
    label: row.label.trim() ? row.label : "Label unavailable",
    entryLabel: `Entry ${orderedPosition + 1}`,
    childLabel: row.index === undefined ? undefined : `Child ${row.index + 1}`,
  };
}

type Tab = { kind: "agents" } | { kind: "row"; id: string };
type Navigation = { kind: "default" | "overview" | "invalid" } | { kind: "root"; id: string };
type External =
  | { kind: "settled"; consumed: Navigation }
  | { kind: "waiting"; consumed: { kind: "root"; id: string } };
type Tabs = { opened: readonly string[]; active: Tab; external: External };
type TabEvent =
  | { kind: "observe"; navigation: Navigation; rows: ReadonlyMap<string, ViewRow> }
  | { kind: "open"; id: string }
  | { kind: "activate"; tab: Tab }
  | { kind: "close"; id: string }
  | { kind: "cancel-wait" };
const agentsTab: Tab = { kind: "agents" };
function sameTab(left: Tab, right: Tab) {
  return (
    left.kind === right.kind &&
    (left.kind !== "row" || (right.kind === "row" && left.id === right.id))
  );
}
function sameNavigation(left: Navigation, right: Navigation) {
  return (
    left.kind === right.kind &&
    (left.kind !== "root" || (right.kind === "root" && left.id === right.id))
  );
}
function tabKey(tab: Tab) {
  return tab.kind === "agents"
    ? "agents"
    : `row-${Array.from(tab.id, (char) => char.codePointAt(0)!.toString(16)).join("-")}`;
}
function transition(tabs: Tabs, event: TabEvent): Tabs {
  if (event.kind === "observe") {
    const changed = !sameNavigation(tabs.external.consumed, event.navigation);
    if (!changed && tabs.external.kind !== "waiting") return tabs;
    const navigation = event.navigation;
    if (navigation.kind !== "root") {
      return { ...tabs, active: agentsTab, external: { kind: "settled", consumed: navigation } };
    }
    const row = event.rows.get(navigation.id);
    if (row?.source === "background" && !row.parentId) {
      return {
        opened: tabs.opened.includes(row.id) ? tabs.opened : [...tabs.opened, row.id],
        active: { kind: "row", id: row.id },
        external: { kind: "settled", consumed: navigation },
      };
    }
    return changed
      ? { ...tabs, active: agentsTab, external: { kind: "waiting", consumed: navigation } }
      : tabs;
  }
  const external: External = { kind: "settled", consumed: tabs.external.consumed };
  if (event.kind === "cancel-wait") {
    return tabs.external.kind === "waiting" ? { ...tabs, external } : tabs;
  }
  if (event.kind === "open") {
    return {
      opened: tabs.opened.includes(event.id) ? tabs.opened : [...tabs.opened, event.id],
      active: { kind: "row", id: event.id },
      external,
    };
  }
  if (event.kind === "activate") return { ...tabs, active: event.tab, external };
  const index = tabs.opened.indexOf(event.id);
  if (index < 0) return tabs;
  const active =
    tabs.active.kind === "row" && tabs.active.id === event.id
      ? index === 0
        ? agentsTab
        : { kind: "row" as const, id: tabs.opened[index - 1]! }
      : tabs.active;
  return { opened: tabs.opened.filter((id) => id !== event.id), active, external };
}

type ReadingSnapshot = { anchor: Element; top: number } | null;

class ConversationReader extends Component<
  { children: ReactNode; active: boolean },
  unknown,
  ReadingSnapshot
> {
  private reader = createRef<HTMLDivElement>();
  private savedScroll = 0;

  override getSnapshotBeforeUpdate(
    previous: Readonly<{ children: ReactNode; active: boolean }>,
  ): ReadingSnapshot {
    const reader = this.reader.current!;
    if (!previous.active) return null;
    if (!this.props.active) {
      this.savedScroll = reader.scrollTop;
      return null;
    }
    const focused = reader.ownerDocument.activeElement;
    const rect = reader.getBoundingClientRect();
    const top = Math.max(0, rect.top);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    const focusedRect =
      focused !== reader && focused && reader.contains(focused)
        ? focused.getBoundingClientRect()
        : null;
    const focusedChild =
      focusedRect && focusedRect.top >= top && focusedRect.top < bottom ? focused : null;
    if (!reader.scrollTop && !focusedChild) return null;
    const anchor =
      focusedChild ??
      (bottom > top
        ? reader.ownerDocument.elementFromPoint?.(rect.left + rect.width / 2, (top + bottom) / 2)
        : null);
    if (!anchor || anchor === reader || !reader.contains(anchor)) return null;
    return { anchor, top: anchor.getBoundingClientRect().top };
  }

  override componentDidUpdate(
    previous: Readonly<{ children: ReactNode; active: boolean }>,
    _previousState: unknown,
    snapshot?: ReadingSnapshot,
  ) {
    if (!previous.active && this.props.active) {
      this.reader.current!.scrollTop = this.savedScroll;
      return;
    }
    if (!this.props.active || !snapshot?.anchor.isConnected) return;
    // Use the actual anchor delta so native scroll anchoring/clamping is not applied twice.
    const shift = snapshot.anchor.getBoundingClientRect().top - snapshot.top;
    if (shift) this.reader.current!.scrollTop += shift;
  }

  override render() {
    return (
      <div
        ref={this.reader}
        className="pi-subagents-transcript"
        role="region"
        aria-label="Captured conversation"
        tabIndex={0}
      >
        {this.props.children}
      </div>
    );
  }
}

function CapturedConversation({
  row,
  presentation,
  active,
}: {
  row: ViewRow;
  presentation: ReturnType<typeof rowPresentation>;
  active: boolean;
}) {
  const output = useRef<HTMLElement>(null);
  const capture = row.capture;
  const [conversationOpenOnMount] = useState(() => !capture?.finalOutput?.trim());
  const occurrences = new Map<string, number>();
  return (
    <article aria-label="Child detail" className="pi-subagents-detail">
      <header className="pi-subagents-identity">
        <div className="pi-subagents-heading pi-subagents-conversation-heading">
          <h3 className="pi-subagents-label">{presentation.label}</h3>
          <button
            type="button"
            disabled={!capture?.finalOutput}
            onClick={() => {
              output.current?.scrollIntoView({ block: "start", behavior: "instant" });
              output.current?.focus({ preventScroll: true });
            }}
          >
            Final output
          </button>
        </div>
        <div className="pi-subagents-metadata">
          <span className="pi-subagents-reference">{presentation.entryLabel}</span>
          {presentation.childLabel && <span>{presentation.childLabel}</span>}
          <span
            className="pi-subagents-state"
            data-state={row.state}
            aria-label={`Execution state: ${row.state}`}
          >
            {row.state}
          </span>
          <span>{elapsed(row)}</span>
        </div>
        <p className="pi-subagents-muted">Captured observation, not a live feed.</p>
      </header>
      <ConversationReader active={active}>
        {row.incomplete && (
          <p className="pi-subagents-notice">
            Coverage is incomplete; missing data does not prove completion.
          </p>
        )}
        {capture?.status !== "captured" && (
          <p role="status" className="pi-subagents-notice">
            Capture {capture?.status ?? "not-captured"}:{" "}
            {capture?.reason ?? "No supported inspection reply has been captured."}
          </p>
        )}
        {capture?.task !== undefined && (
          <details className="pi-subagents-task" aria-label="Captured task">
            <summary>Task</summary>
            <Markdown className="pi-subagents-prose" content={capture.task} />
          </details>
        )}
        <details className="pi-subagents-conversation" open={conversationOpenOnMount}>
          <summary>
            Conversation{" "}
            <span className="pi-subagents-muted">{capture?.messages?.length ?? 0} entries</span>
          </summary>
          {capture?.messages?.length
            ? capture.messages.map((message) => {
                // Identity follows content, not its position in a changing bounded tail.
                const identity = JSON.stringify(message);
                const occurrence = occurrences.get(identity) ?? 0;
                occurrences.set(identity, occurrence + 1);
                const key = `${identity}:${occurrence}`;
                return message.kind === "text" && message.role !== "toolResult" ? (
                  <section
                    key={key}
                    className="pi-subagents-message"
                    aria-label={`${message.role} message`}
                  >
                    <div className="pi-subagents-heading">
                      <h4>{message.role}</h4>
                    </div>
                    <Markdown className="pi-subagents-prose" content={message.text} />
                  </section>
                ) : (
                  <details key={key} className="pi-subagents-tool">
                    <summary>
                      {message.name || (message.kind === "toolCall" ? "Tool call" : "Tool result")}
                      <span className="pi-subagents-muted">
                        {message.kind === "toolCall" ? "Call" : "Result"} · {message.role}
                      </span>
                      {message.isError && <span className="pi-subagents-tool-error">Error</span>}
                    </summary>
                    <pre>{message.text}</pre>
                    {message.textTruncated && (
                      <p className="pi-subagents-muted">Tool text was truncated.</p>
                    )}
                  </details>
                );
              })
            : null}
        </details>
        <section
          ref={output}
          tabIndex={-1}
          className="pi-subagents-output"
          aria-label="Final output"
        >
          <h4>Final output</h4>
          {capture?.finalOutput !== undefined ? (
            <Markdown className="pi-subagents-prose" content={capture.finalOutput} />
          ) : (
            <p>Final output not captured. This does not change the known execution outcome.</p>
          )}
        </section>
        <details className="pi-subagents-capture">
          <summary>Capture details</summary>
          <p>
            Run {row.runId}
            {row.index === undefined ? "" : ` · child index ${row.index}`} · {row.source} ·{" "}
            {row.kind}
          </p>
          <p>{modelLabel(row)}</p>
          {capture?.task === undefined && <p>Task attribution not captured.</p>}
          {!capture?.messages?.length && (
            <p>
              {capture?.truncated?.messages
                ? "Recent transcript omitted by the capture budget."
                : "Recent transcript not captured."}
            </p>
          )}
          <p>Observed {new Date(row.observedAt).toISOString()}</p>
          <p>
            {capture ? `Captured ${new Date(capture.capturedAt).toISOString()}` : "Not captured"}
          </p>
          {capture?.resolvedModel && (
            <p>Model captured {new Date(capture.resolvedModel.capturedAt).toISOString()}</p>
          )}
          {capture?.attemptedAt !== undefined && (
            <p>Last capture attempt {new Date(capture.attemptedAt).toISOString()}</p>
          )}
          <p>{row.activity || "Activity unavailable"}</p>
          {capture?.truncated?.task && <p>Task text was truncated.</p>}
          {!!capture?.truncated?.messages && (
            <p>{capture.truncated.messages} transcript entries omitted.</p>
          )}
          {capture?.messages?.some((message) => message.textTruncated) && (
            <p>Transcript text was truncated.</p>
          )}
          {capture?.truncated?.finalOutput && <p>Final output was truncated.</p>}
        </details>
      </ConversationReader>
    </article>
  );
}

export function SubagentsView({
  state,
  loading = false,
  error,
  warning,
  target,
  overview = false,
}: {
  state?: ViewState;
  loading?: boolean;
  error?: string;
  warning?: string;
  target?: string | null;
  overview?: boolean;
}) {
  const { ordered, overviewEntries } = useMemo(() => projectRows(state?.rows ?? []), [state]);
  const rows = useMemo(() => new Map(ordered.map((row) => [row.id, row])), [ordered]);
  const navigation: Navigation =
    target === null
      ? { kind: "invalid" }
      : target !== undefined
        ? { kind: "root", id: target }
        : { kind: overview ? "overview" : "default" };
  const [storedTabs, setTabs] = useState<Tabs>({
    opened: [],
    active: agentsTab,
    external: { kind: "settled", consumed: { kind: "default" } },
  });
  const tabs = transition(storedTabs, { kind: "observe", navigation, rows });
  if (tabs !== storedTabs) setTabs(tabs);
  const root = useRef<HTMLElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const tabButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusRequested = useRef(false);
  const lastRevealed = useRef<Tab>(agentsTab);
  const prefix = useId();
  const tabId = (tab: Tab) => `${prefix}-tab-${tabKey(tab)}`;
  const panelId = (tab: Tab) => `${prefix}-panel-${tabKey(tab)}`;
  const focused = root.current?.ownerDocument.activeElement;
  const focusedOverviewIndex = buttons.current.findIndex((button) => button === focused);
  if (focused && root.current?.contains(focused)) {
    const panel = focused.closest<HTMLElement>("[role=tabpanel]");
    if (panel) {
      const panelTab: Tab =
        panel.dataset.rowId === undefined ? agentsTab : { kind: "row", id: panel.dataset.rowId };
      const evicted =
        panelTab.kind === "row" && !rows.has(panelTab.id) && focused.closest("article");
      if (!sameTab(panelTab, tabs.active) || evicted) focusRequested.current = true;
    }
  }
  useLayoutEffect(() => {
    const button = tabButtons.current.get(tabKey(tabs.active));
    if (focusRequested.current) {
      focusRequested.current = false;
      button?.focus({ preventScroll: true });
    } else if (
      focusedOverviewIndex >= 0 &&
      !focused?.isConnected &&
      tabs.active.kind === "agents"
    ) {
      (
        buttons.current[Math.min(focusedOverviewIndex, overviewEntries.length - 1)] ?? button
      )?.focus({
        preventScroll: true,
      });
    }
    if (!sameTab(lastRevealed.current, tabs.active)) {
      button?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      lastRevealed.current = tabs.active;
    }
  });
  function activate(tab: Tab) {
    focusRequested.current = true;
    setTabs((current) => transition(current, { kind: "activate", tab }));
  }
  function open(id: string) {
    focusRequested.current = true;
    setTabs((current) => transition(current, { kind: "open", id }));
  }
  function close(id: string, button?: HTMLButtonElement) {
    if (
      (tabs.active.kind === "row" && tabs.active.id === id) ||
      button === root.current?.ownerDocument.activeElement
    ) {
      focusRequested.current = true;
    }
    setTabs((current) => transition(current, { kind: "close", id }));
  }
  const allTabs: Tab[] = [agentsTab, ...tabs.opened.map((id) => ({ kind: "row" as const, id }))];
  function tabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: Tab) {
    const index = allTabs.findIndex((item) => sameTab(item, tab));
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % allTabs.length;
    else if (event.key === "ArrowLeft") next = (index + allTabs.length - 1) % allTabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = allTabs.length - 1;
    else if (event.key === "Delete" && tab.kind === "row") {
      event.preventDefault();
      close(tab.id);
      return;
    } else return;
    event.preventDefault();
    activate(allTabs[next]!);
  }
  function renderTab(tab: Tab) {
    const row = tab.kind === "row" ? rows.get(tab.id) : undefined;
    const label =
      tab.kind === "agents" ? "Agents" : row ? rowPresentation(row, 0).label : "Unavailable agent";
    const position = row ? ordered.findIndex((item) => item.id === row.id) : -1;
    const reference = row
      ? rowPresentation(row, position).entryLabel
      : tab.kind === "row"
        ? `View ${tabs.opened.indexOf(tab.id) + 1}`
        : undefined;
    const duplicate =
      tab.kind === "row" &&
      tabs.opened.some((id) => {
        const other = rows.get(id);
        const otherLabel = other ? rowPresentation(other, 0).label : "Unavailable agent";
        return (
          id !== tab.id &&
          otherLabel.trim().replace(/\s+/g, " ") === label.trim().replace(/\s+/g, " ")
        );
      });
    const accessibleLabel = duplicate ? `${label} ${reference}` : label;
    const active = sameTab(tab, tabs.active);
    return (
      <div
        key={tabKey(tab)}
        role="presentation"
        className="pi-subagents-tab-slot"
        data-selected={active}
      >
        <button
          type="button"
          role="tab"
          id={tabId(tab)}
          aria-controls={panelId(tab)}
          aria-label={accessibleLabel}
          aria-selected={active}
          tabIndex={active ? 0 : -1}
          ref={(button) => {
            if (button) tabButtons.current.set(tabKey(tab), button);
            else tabButtons.current.delete(tabKey(tab));
          }}
          onClick={() => activate(tab)}
          onKeyDown={(event) => tabKeyDown(event, tab)}
          aria-description={
            tab.kind === "agents" && state
              ? `${ordered.length} observed entries in available history. Not an active-worker count.`
              : undefined
          }
          title={
            tab.kind === "agents" && state
              ? `Agents · ${ordered.length} observed entries in available history`
              : row
                ? `${label} · ${reference} · ${row.state}`
                : accessibleLabel
          }
        >
          <span className="pi-subagents-tab-label">{label}</span>
          {tab.kind === "row" && (
            <span className="pi-subagents-tab-reference" aria-hidden="true">
              {row ? position + 1 : tabs.opened.indexOf(tab.id) + 1}
            </span>
          )}
          {tab.kind === "agents" && state && (
            <span className="pi-subagents-tab-count" aria-hidden="true">
              {ordered.length}
            </span>
          )}
        </button>
        {tab.kind === "row" && (
          <button
            type="button"
            className="pi-subagents-close-tab"
            aria-label={`Close ${accessibleLabel} tab`}
            title="Close view only. Does not stop the run."
            tabIndex={active ? 0 : -1}
            onClick={(event) => close(tab.id, event.currentTarget)}
          >
            <svg
              viewBox="0 0 16 16"
              width="16"
              height="16"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </button>
        )}
      </div>
    );
  }
  const targetRow = target ? rows.get(target) : undefined;
  const targetAvailable = targetRow?.source === "background" && !targetRow.parentId;
  return (
    <section ref={root} aria-label="Subagents" className="pi-subagents">
      <div role="tablist" aria-label="Subagent views" className="pi-subagents-tablist">
        {renderTab(agentsTab)}
        <div role="presentation" className="pi-subagents-open-tabs">
          {allTabs.slice(1).map(renderTab)}
        </div>
      </div>
      <div className="pi-subagents-inventory">
        <p className="pi-subagents-provenance">
          Read-only · Captured observations, not a live feed.
        </p>
        {loading && !state && <p role="status">Loading captured subagents...</p>}
        {target === null && (
          <p role="alert">Requested subagent target is invalid. Select another captured run.</p>
        )}
        {target && !loading && !targetAvailable && (
          <p role="alert">
            Requested background detail is unavailable. Select another captured run.
          </p>
        )}
        {error && <p role="alert">{error} Previously captured detail stays visible.</p>}
        {warning && (
          <p role="status" className="pi-subagents-history-warning">
            {warning}
          </p>
        )}
        {!(loading && !state) && state?.availability !== "available" && (
          <p role="status">
            {state?.reason || "Subagent observation is not available for this thread."}
          </p>
        )}
        {state && state.omitted > 0 && (
          <p role="status">{state.omitted} entries omitted by the capture budget.</p>
        )}
      </div>
      <div className="pi-subagents-panels">
        <section
          role="tabpanel"
          id={panelId(agentsTab)}
          aria-labelledby={tabId(agentsTab)}
          hidden={tabs.active.kind !== "agents"}
          className="pi-subagents-tabpanel pi-subagents-overview"
        >
          {!overviewEntries.length && !loading && (
            <p>No child work has been captured. Ordinary Pi work remains available.</p>
          )}
          <nav aria-label="Observed children">
            <ul>
              {overviewEntries.map(({ row, depth, rawPosition }, index) => {
                const presentation = rowPresentation(row, rawPosition);
                return (
                  <li key={row.id} style={{ paddingInlineStart: `${depth * 12}px` }}>
                    <button
                      className="pi-subagents-row"
                      data-open={tabs.opened.includes(row.id)}
                      ref={(button) => {
                        buttons.current[index] = button;
                      }}
                      type="button"
                      aria-label={[
                        presentation.label,
                        presentation.purpose,
                        presentation.entryLabel,
                        presentation.childLabel,
                        row.state,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => open(row.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          open(row.id);
                          return;
                        }
                        let next: number;
                        if (event.key === "ArrowDown")
                          next = Math.min(overviewEntries.length - 1, index + 1);
                        else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
                        else if (event.key === "Home") next = 0;
                        else if (event.key === "End") next = overviewEntries.length - 1;
                        else return;
                        event.preventDefault();
                        setTabs((current) => transition(current, { kind: "cancel-wait" }));
                        buttons.current[next]?.focus();
                        buttons.current[next]?.scrollIntoView({
                          block: "nearest",
                          behavior: "instant",
                        });
                      }}
                    >
                      <span className="pi-subagents-row-copy">
                        <span className="pi-subagents-row-title">
                          <strong className="pi-subagents-label" title={presentation.label}>
                            {presentation.label}
                          </strong>
                          <span className="pi-subagents-reference">{presentation.entryLabel}</span>
                        </span>
                        <span className="pi-subagents-purpose pi-subagents-muted">
                          {presentation.purpose}
                        </span>
                        <span className="pi-subagents-row-meta">
                          {presentation.childLabel && (
                            <span className="pi-subagents-optional-meta">
                              {presentation.childLabel}
                            </span>
                          )}
                          <span className="pi-subagents-optional-meta">
                            {row.source} · {row.kind}
                          </span>
                          {row.capture?.status !== "captured" && (
                            <span className="pi-subagents-capture-gap" title={row.capture?.reason}>
                              Capture {row.capture?.status ?? "not-captured"}
                            </span>
                          )}
                          {row.incomplete && (
                            <span className="pi-subagents-capture-gap">Incomplete coverage</span>
                          )}
                        </span>
                      </span>
                      <span className="pi-subagents-row-side">
                        <span
                          className="pi-subagents-state"
                          data-state={row.state}
                          aria-label={`Execution state: ${row.state}`}
                        >
                          <span className="pi-subagents-state-dot" aria-hidden="true" />
                          {row.state}
                        </span>
                        {tabs.opened.includes(row.id) && (
                          <span className="pi-subagents-open-marker">Open</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </section>
        {tabs.opened.map((id) => {
          const row = rows.get(id);
          const tab: Tab = { kind: "row", id };
          const active = sameTab(tab, tabs.active);
          return (
            <section
              key={id}
              role="tabpanel"
              id={panelId(tab)}
              aria-labelledby={tabId(tab)}
              data-row-id={id}
              hidden={!active}
              className="pi-subagents-tabpanel"
            >
              {row ? (
                <CapturedConversation
                  row={row}
                  active={active}
                  presentation={rowPresentation(
                    row,
                    ordered.findIndex((item) => item.id === id),
                  )}
                />
              ) : (
                <p className="pi-subagents-unavailable">
                  This agent is outside the available captured history. Close this view or choose
                  another agent in Agents.
                </p>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
