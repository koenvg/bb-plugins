import { useEffect, useState, useMemo, useId, useRef, useCallback } from "react";
import type { ComponentType } from "react";
import { Button } from "./components/ui/button";
import { MarkdownDocument, createDocumentModel } from "./document";
import type { ReaderTarget, ReadResult, TextSnapshot } from "./source";
import { Outline, useWidePanel } from "./outline";
import { RawDocument } from "./raw";
import type { LineRequest } from "./source-lines";
import { revealInReader } from "./navigation";
import { DestinationProvider, type ResolveDocumentDestinations } from "./destination-view";
const NO_DESTINATIONS: import("./destination-types").DestinationRequest[] = [];

export type ReadDocument = (target: ReaderTarget) => Promise<ReadResult>;
export interface ReaderProps {
  target: ReaderTarget;
  readDocument: ReadDocument;
  Original: ComponentType;
  lineRange?: LineRequest;
  resolveDestinations?: ResolveDocumentDestinations;
}

/** The target owner remounts this reader only when source identity changes. */
export function Reader({ target, readDocument, Original, lineRange, resolveDestinations }: ReaderProps) {
  const [state, setState] = useState<{ loading: boolean; result: ReadResult | null; snapshot: TextSnapshot | null }>({ loading: true, result: null, snapshot: null });
  const [view, setView] = useState<"preview" | "raw">(lineRange ? "raw" : "preview");
  const [refresh, setRefresh] = useState(0);
  const [fallback, setFallback] = useState(false);
  const namespace = useId();
  const root = useRef<HTMLElement>(null);
  const wide = useWidePanel(root, !fallback);
  const [showOutline, setShowOutline] = useState(true);
  const model = useMemo(() => state.snapshot ? createDocumentModel(state.snapshot.text, namespace) : null, [state.snapshot, namespace]);
  const navigate = useCallback((id: string) => {
    const panel = root.current;
    const heading = Array.from(panel?.querySelectorAll<HTMLElement>(".mr-prose [id]") ?? []).find(h => h.id === id);
    if (!panel || !heading) return;
    revealInReader(panel, heading);
  }, []);
  useEffect(() => { if (lineRange != null) setView("raw"); }, [lineRange]);
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
  const filenameStart = Math.max(target.path.lastIndexOf("/"), target.path.lastIndexOf("\\")) + 1;
  const filename = target.path.slice(filenameStart) || target.path;
  const directory = target.path.slice(0, filenameStart);
  const { result, snapshot, loading } = state;
  return <section ref={root} className="markdown-reader" aria-label="Markdown Reader">
    <header className="mr-toolbar">
      <div className="mr-identity" role="group" aria-label={target.path} title={target.path}>
        <span className="mr-filename">{filename}</span>
        {directory && <span className="mr-path">{directory}</span>}
      </div>
      <div className="mr-controls" role="group" aria-label="Document controls">
        <div className="mr-view-controls" role="group" aria-label="Document view">
          <Button variant="ghost" aria-pressed={view === "preview"} onClick={() => setView("preview")}>Preview</Button>
          <Button variant="ghost" aria-pressed={view === "raw"} onClick={() => setView("raw")}>Raw</Button>
        </div>
        <div className="mr-reader-actions" role="group" aria-label="Reader actions">
          {view === "preview" && !!model?.headings.length && <Button variant="ghost" aria-pressed={showOutline} onClick={() => setShowOutline(show => !show)}>Outline</Button>}
          <Button variant="ghost" onClick={() => setRefresh(n => n + 1)}>Refresh</Button>
        </div>
      </div>
    </header>
    <div className="mr-content">
      <DestinationProvider snapshot={snapshot} requests={model?.requests ?? NO_DESTINATIONS} resolve={resolveDestinations} enabled={!loading && result?.kind === "ready"}>
      {loading && <p className="mr-state" role="status">{snapshot ? "Refreshing Markdown. Showing previous snapshot, not verified current." : "Loading Markdown..."}</p>}
      {result && result.kind !== "ready" && <div className="mr-state" role="alert">
        {snapshot && <p>Refresh failed. Showing stale snapshot.</p>}
        <p>{result.message}</p>
        <Button variant="outline" onClick={() => setRefresh(n => n + 1)}>Retry</Button>
        <Button variant="outline" onClick={() => setFallback(true)}>Open in BB preview</Button>
      </div>}
      {snapshot && (view === "raw"
        ? <RawDocument sourceLines={model!.sourceLines} request={lineRange} panel={root} />
        : snapshot.text === ""
          ? <p className="mr-state" role="status">This file is empty.</p>
          : <div className="mr-document-layout" data-outline={showOutline && model!.headings.length ? (wide ? "aside" : "inline") : "hidden"}>
            {showOutline && !!model!.headings.length && !wide && <Outline model={model!} wide={false} navigate={navigate} />}
            <MarkdownDocument model={model!} navigate={navigate} />
            {showOutline && !!model!.headings.length && wide && <Outline model={model!} wide navigate={navigate} />}
          </div>)}
      </DestinationProvider>
    </div>
  </section>;
}
