import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Button } from "./components/ui/button";
import { MarkdownDocument } from "./document";
import type { ReaderTarget, ReadResult, TextSnapshot } from "./source";

export type ReadDocument = (target: ReaderTarget) => Promise<ReadResult>;
export interface ReaderProps {
  target: ReaderTarget;
  readDocument: ReadDocument;
  Original: ComponentType;
}

/** The target owner remounts this reader only when source identity changes. */
export function Reader({ target, readDocument, Original }: ReaderProps) {
  const [state, setState] = useState<{ loading: boolean; result: ReadResult | null; snapshot: TextSnapshot | null }>({ loading: true, result: null, snapshot: null });
  const [view, setView] = useState<"preview" | "raw">("preview");
  const [refresh, setRefresh] = useState(0);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    if (fallback) return;
    let current = true;
    setState(previous => ({ ...previous, loading: true, result: null }));
    const settle = (result: ReadResult) => {
      if (current) setState(previous => ({ loading: false, result, snapshot: result.kind === "ready" ? result.snapshot : previous.snapshot }));
    };
    void readDocument(target).then(settle, cause => settle({ kind: "error", message: cause instanceof Error ? cause.message.slice(0, 1024) : "Could not read this file." }));
    // Every new read invalidates its predecessor. Fallback and unmount also discard results.
    return () => { current = false; };
  }, [target, readDocument, refresh, fallback]);

  if (fallback) return <Original />;
  const { result, snapshot, loading } = state;
  return <section className="markdown-reader" aria-label="Markdown Reader">
    <header className="mr-toolbar">
      <div className="mr-path" title={target.path}>{target.path}</div>
      <div className="mr-controls" role="group" aria-label="Document controls">
        <div className="mr-view-controls" role="group" aria-label="Document view">
          <Button variant="ghost" aria-pressed={view === "preview"} onClick={() => setView("preview")}>Preview</Button>
          <Button variant="ghost" aria-pressed={view === "raw"} onClick={() => setView("raw")}>Raw</Button>
        </div>
        <Button variant="ghost" onClick={() => setRefresh(n => n + 1)}>Refresh</Button>
        <Button variant="ghost" onClick={() => setFallback(true)}>Open in BB preview</Button>
      </div>
    </header>
    <div className="mr-content">
      {loading && <p className="mr-state" role="status">{snapshot ? "Refreshing Markdown. Showing previous snapshot, not verified current." : "Loading Markdown..."}</p>}
      {result && result.kind !== "ready" && <div className="mr-state" role="alert">
        {snapshot && <p>Refresh failed. Showing stale snapshot.</p>}
        <p>{result.message}</p>
        <Button variant="outline" onClick={() => setRefresh(n => n + 1)}>Retry</Button>
      </div>}
      {snapshot && (view === "raw"
        ? <pre className="mr-raw" aria-label="Raw Markdown" tabIndex={0}>{snapshot.text}</pre>
        : snapshot.text === ""
          ? <p className="mr-state" role="status">This file is empty.</p>
          : <MarkdownDocument text={snapshot.text} />)}
    </div>
  </section>;
}
