import { Markdown } from "@get-bb/plugin-sdk/app";
import { Component, createRef, type ReactNode, useMemo, useRef, useState } from "react";
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
function orderedRows(rows: readonly ViewRow[]) {
  const result: { row: ViewRow; depth: number }[] = [];
  const seen = new Set<string>();
  function visit(row: ViewRow, depth: number) {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    result.push({ row, depth });
    for (const child of rows.filter((r) => r.parentId === row.id))
      visit(child, Math.min(depth + 1, 4));
  }
  for (const row of rows.filter((r) => !r.parentId || !rows.some((p) => p.id === r.parentId)))
    visit(row, 0);
  for (const row of rows) visit(row, 0);
  return result;
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

type ReadingSnapshot = { anchor: Element; top: number } | null;

class ConversationReader extends Component<{ children: ReactNode }, unknown, ReadingSnapshot> {
  private reader = createRef<HTMLDivElement>();

  // Snapshot before React changes notices above the reader.
  override getSnapshotBeforeUpdate(): ReadingSnapshot {
    const reader = this.reader.current!;
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
    _previousProps: unknown,
    _previousState: unknown,
    snapshot?: ReadingSnapshot,
  ) {
    if (!snapshot?.anchor.isConnected) return;
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
}: {
  row: ViewRow;
  presentation: ReturnType<typeof rowPresentation>;
}) {
  const output = useRef<HTMLElement>(null);
  const capture = row.capture;
  const [conversationOpenOnMount] = useState(() => !capture?.finalOutput?.trim());
  const occurrences = new Map<string, number>();
  return (
    <article aria-label="Child detail" className="pi-subagents-detail">
      <header className="pi-subagents-identity">
        <div className="pi-subagents-heading pi-subagents-conversation-heading">
          <h3 className="pi-subagents-purpose">{presentation.purpose}</h3>
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
          <span className="pi-subagents-label">{presentation.label}</span>
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
      <ConversationReader>
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
          {!capture?.messages?.length && <p>Recent transcript not captured.</p>}
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
  const [selection, setSelection] = useState<{
    target?: string | null;
    overview?: boolean;
    id?: string;
  }>({ target, overview });
  const targetChanged = selection.target !== target || Boolean(selection.overview) !== overview;
  if (targetChanged) setSelection({ target, overview });
  const selected = targetChanged ? target : (selection.id ?? target);
  const setSelected = (id: string) => setSelection({ target, overview, id });
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const items = useMemo(() => orderedRows(state?.rows ?? []), [state]);
  const targetRow = state?.rows.find(
    (r) => r.id === target && r.source === "background" && !r.parentId,
  );
  const row = selected
    ? state?.rows.find(
        (r) =>
          r.id === selected &&
          ((!targetChanged && selection.id !== undefined) ||
            selected !== target ||
            r === targetRow),
      )
    : target === undefined && !overview
      ? items[0]?.row
      : undefined;
  if (loading && !state) return <p role="status">Loading captured subagents...</p>;
  return (
    <section aria-label="Subagents" className="pi-subagents">
      <header className="pi-subagents-heading">
        <h2>Subagents</h2>
        <span className="pi-subagents-muted">Read-only</span>
      </header>
      {overview && !row && <p role="status">Select a captured run to view its detail.</p>}
      {target === null && (
        <p role="alert">Requested subagent target is invalid. Select another captured run.</p>
      )}
      {target && !loading && !targetRow && (
        <p role="alert">Requested background detail is unavailable. Select another captured run.</p>
      )}
      {error && <p role="alert">{error} Previously captured detail stays visible.</p>}
      {warning && <p role="status">{warning}</p>}
      {state?.availability !== "available" && (
        <p role="status">
          {state?.reason || "Subagent observation is not available for this thread."}
        </p>
      )}
      {state && state.omitted > 0 && (
        <p role="status">{state.omitted} entries omitted by the capture budget.</p>
      )}
      {!items.length && <p>No child work has been captured. Ordinary Pi work remains available.</p>}
      {!!items.length && (
        <details className="pi-subagents-runs" open={overview}>
          <summary>
            Runs <span className="pi-subagents-muted">{items.length} captured</span>
          </summary>
          <nav aria-label="Observed children">
            <ul>
              {items.map(({ row: item, depth }, index) => {
                const presentation = rowPresentation(item, index);
                return (
                  <li key={item.id} style={{ paddingInlineStart: `${depth * 12}px` }}>
                    <button
                      ref={(button) => {
                        buttons.current[index] = button;
                      }}
                      type="button"
                      aria-pressed={item.id === row?.id}
                      aria-label={[
                        presentation.purpose,
                        presentation.label,
                        presentation.entryLabel,
                        presentation.childLabel,
                        item.state,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setSelected(item.id)}
                      onKeyDown={(event) => {
                        let next = index;
                        if (event.key === "ArrowDown") next = Math.min(items.length - 1, index + 1);
                        else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
                        else if (event.key === "Home") next = 0;
                        else if (event.key === "End") next = items.length - 1;
                        else return;
                        event.preventDefault();
                        setSelected(items[next]!.row.id);
                        buttons.current[next]?.focus();
                        buttons.current[next]?.scrollIntoView({
                          block: "nearest",
                          behavior: "instant",
                        });
                      }}
                    >
                      <strong className="pi-subagents-purpose">{presentation.purpose}</strong>
                      <span className="pi-subagents-row-meta">
                        <span className="pi-subagents-label">{presentation.label}</span>
                        <span className="pi-subagents-reference">{presentation.entryLabel}</span>
                        {presentation.childLabel && <span>{presentation.childLabel}</span>}
                        <span className="pi-subagents-state" data-state={item.state}>
                          {item.state}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </details>
      )}
      {row && (
        <CapturedConversation
          key={row.id}
          row={row}
          presentation={rowPresentation(
            row,
            items.findIndex((item) => item.row.id === row.id),
          )}
        />
      )}
    </section>
  );
}
