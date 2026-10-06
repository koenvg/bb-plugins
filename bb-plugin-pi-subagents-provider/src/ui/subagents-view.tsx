import { useMemo, useRef, useState } from "react";
import { type ViewRow, type ViewState } from "../subagents-contract.js";

function elapsed(row: ViewRow) {
  if (row.durationMs !== undefined) return `${Math.floor(row.durationMs / 1000)}s`;
  if (row.startedAt === undefined) return "Elapsed time unavailable";
  return `${Math.max(0, Math.floor(((row.endedAt ?? row.observedAt) - row.startedAt) / 1000))}s at observation`;
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
export function SubagentsView({
  state,
  loading = false,
  error,
}: {
  state?: ViewState;
  loading?: boolean;
  error?: string;
}) {
  const [selected, setSelected] = useState<string>();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const items = useMemo(() => orderedRows(state?.rows ?? []), [state]);
  const row = state?.rows.find((r) => r.id === selected) ?? items[0]?.row;
  if (loading && !state) return <p role="status">Loading captured subagents...</p>;
  return (
    <section
      aria-label="Subagents"
      className="pi-subagents min-w-0 space-y-4 text-sm text-foreground"
    >
      <header>
        <h2 className="font-medium">Subagents</h2>
        <p className="text-xs text-muted-foreground">
          Read-only captured observations. Pi owns execution and delivery.
        </p>
      </header>
      {error && (
        <p role="alert" className="text-destructive">
          {error} Previously captured detail stays visible.
        </p>
      )}
      {state?.availability !== "available" && (
        <p role="status" className="text-muted-foreground">
          {state?.reason || "Subagent observation is not available for this thread."}
        </p>
      )}
      {state && state.omitted > 0 && (
        <p role="status">{state.omitted} entries omitted by the capture budget.</p>
      )}
      {!items.length && <p>No child work has been captured. Ordinary Pi work remains available.</p>}
      {!!items.length && (
        <nav aria-label="Observed children">
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {items.map(({ row: item, depth }, index) => (
              <li key={item.id} style={{ paddingInlineStart: `${depth * 12}px` }}>
                <button
                  ref={(button) => {
                    buttons.current[index] = button;
                  }}
                  type="button"
                  aria-pressed={item.id === row?.id}
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
                  }}
                  className="w-full min-w-0 rounded-md border border-border bg-card px-3 py-2 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-surface-raised"
                >
                  <span className="block break-words font-medium">
                    {item.label || "Label unavailable"}
                  </span>
                  <span className="block break-words text-xs text-muted-foreground">
                    {item.source} · {item.runId}
                    {item.index !== undefined ? ` · child ${item.index}` : ""} · {item.state} ·{" "}
                    {elapsed(item)} · {item.activity || "Activity unavailable"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {row && (
        <article
          aria-label="Child detail"
          className="min-w-0 space-y-3 rounded-md border border-border bg-card p-3"
        >
          <h3 className="break-words font-medium">{row.label || "Label unavailable"}</h3>
          <p className="break-all text-xs text-muted-foreground">
            Run {row.runId}
            {row.index === undefined ? "" : ` · child index ${row.index}`}
          </p>
          <p>
            Execution state: {row.state}
            {row.incomplete
              ? ". Coverage is incomplete; missing data does not prove completion."
              : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Observed {new Date(row.observedAt).toISOString()}
            {row.capture
              ? ` · Captured ${new Date(row.capture.capturedAt).toISOString()}`
              : " · Not captured"}
          </p>
          {row.capture?.attemptedAt !== undefined && (
            <p className="text-xs text-muted-foreground">
              Last capture attempt {new Date(row.capture.attemptedAt).toISOString()}
            </p>
          )}
          {row.capture?.status !== "captured" && (
            <p role="status">
              Capture {row.capture?.status ?? "not-captured"}:{" "}
              {row.capture?.reason ?? "No supported inspection reply has been captured."}
            </p>
          )}
          <h4 className="font-medium">Task</h4>
          <pre className="whitespace-pre-wrap break-words font-sans">
            {row.capture?.task ?? "Task attribution not captured."}
          </pre>
          {row.capture?.truncated?.task && <p>Task text was truncated.</p>}
          <h4 className="font-medium">Recent transcript</h4>
          {row.capture?.messages?.length ? (
            row.capture.messages.map((message, index) => (
              <div key={index}>
                <p className="text-xs text-muted-foreground">
                  {message.role} · {message.kind}
                </p>
                <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                  {message.text}
                </pre>
              </div>
            ))
          ) : (
            <p>Recent transcript not captured.</p>
          )}
          {!!row.capture?.truncated?.messages && (
            <p>{row.capture.truncated.messages} transcript entries omitted.</p>
          )}
          {row.capture?.messages?.some((message) => message.textTruncated) && (
            <p>Transcript text was truncated.</p>
          )}
          <h4 className="font-medium">Final output</h4>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs">
            {row.capture?.finalOutput ??
              "Final output not captured. This does not change the known execution outcome."}
          </pre>
          {row.capture?.truncated?.finalOutput && <p>Final output was truncated.</p>}
        </article>
      )}
    </section>
  );
}
