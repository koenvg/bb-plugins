import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Button } from "./components/ui/button";
import { MarkdownDocument } from "./document";
import type { ReaderTarget, ReadResult } from "./source";

export type ReadDocument = (target: ReaderTarget) => Promise<ReadResult>;
export interface ReaderProps {
  target: ReaderTarget;
  readDocument: ReadDocument;
  Original: ComponentType;
}

/** The target owner remounts this reader only when source identity changes. */
export function Reader({ target, readDocument, Original }: ReaderProps) {
  const [result, setResult] = useState<ReadResult | null>(null);
  const [view, setView] = useState<"preview" | "raw">("preview");
  const [refresh, setRefresh] = useState(0);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    let current = true;
    setResult(null);
    void readDocument(target).then(
      next => { if (current) setResult(next); },
      cause => { if (current) setResult({ kind: "error", message: cause instanceof Error ? cause.message : "Could not read this file." }); },
    );
    return () => { current = false; };
  }, [target, readDocument, refresh]);

  if (fallback) return <Original />;
  const snapshot = result?.kind === "ready" ? result.snapshot : null;
  return <section className="markdown-reader" aria-label="Markdown Reader">
    <header className="mr-toolbar">
      <div className="mr-path" title={target.path}>{target.path}</div>
      <div className="mr-controls" role="group" aria-label="Document controls">
        <div className="mr-view-controls" role="group" aria-label="Document view">
          <Button variant="ghost" aria-pressed={view === "preview"} onClick={() => setView("preview")}>Preview</Button>
          <Button variant="ghost" aria-pressed={view === "raw"} onClick={() => setView("raw")}>Raw</Button>
        </div>
        <Button variant="ghost" disabled={!result} onClick={() => setRefresh(n => n + 1)}>Refresh</Button>
        <Button variant="ghost" onClick={() => setFallback(true)}>Open in BB preview</Button>
      </div>
    </header>
    <div className="mr-content">
      {!result && <p className="mr-state" role="status">Loading Markdown...</p>}
      {result && result.kind !== "ready" && <div className="mr-state" role="alert">
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
