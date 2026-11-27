import { useEffect, useState, useMemo, useId, useRef, useCallback } from "react";
import type { ComponentType } from "react";
import { Button } from "./components/ui/button";
import { IconAction } from "./components/ui/icon-action";
import {
  MarkdownDocument,
  createDocumentModel,
  type LineRequest,
} from "@bb-plugins/markdown-document";
import "@bb-plugins/markdown-document/style.css";
import type { ReaderTarget, ReadResult, TextSnapshot } from "./source";
import { revealInReader } from "./navigation";
import { DestinationProvider, type ResolveDocumentDestinations } from "./destination-view";
import { SelectionAction, type ExcerptDestination } from "./selection";
import type { DestinationRequest } from "./destination-types";
const NO_DESTINATIONS: DestinationRequest[] = [];

export type ReadDocument = (target: ReaderTarget) => Promise<ReadResult>;
export interface ReaderProps {
  target: ReaderTarget;
  readDocument: ReadDocument;
  Original: ComponentType;
  lineRange?: LineRequest;
  resolveDestinations?: ResolveDocumentDestinations;
  destination?: ExcerptDestination;
}

/** The target owner remounts this reader only when source identity changes. */
export const Reader = ({
  target,
  readDocument,
  Original,
  lineRange,
  resolveDestinations,
  destination,
}: ReaderProps) => {
  const [request, setRequest] = useState({ target, readDocument, revision: 0 });
  const [settled, setSettled] = useState<{
    request: typeof request;
    result: ReadResult;
    snapshot: TextSnapshot | null;
  } | null>(null);
  if (request.target !== target || request.readDocument !== readDocument)
    setRequest({ target, readDocument, revision: request.revision });
  const refresh = () =>
    setRequest((previous) => ({ ...previous, revision: previous.revision + 1 }));
  const [view, setView] = useState<"preview" | "raw">(lineRange ? "raw" : "preview");
  const [previousLineRange, setPreviousLineRange] = useState(lineRange);
  if (previousLineRange !== lineRange) {
    setPreviousLineRange(lineRange);
    if (lineRange != null) setView("raw");
  }
  const [fallback, setFallback] = useState(false);
  const result = settled?.request === request ? settled.result : null;
  const loading = result === null;
  const snapshot = settled?.snapshot ?? null;
  const namespace = useId();
  const root = useRef<HTMLElement>(null);
  const [showOutline, setShowOutline] = useState(true);
  const model = useMemo(
    () => (snapshot ? createDocumentModel(snapshot.text, namespace) : null),
    [snapshot, namespace],
  );
  const reveal = useCallback((element: HTMLElement) => {
    if (root.current) revealInReader(root.current, element);
  }, []);
  const navigation = useMemo(() => ({ container: root, reveal }), [reveal]);
  useEffect(() => {
    if (fallback) return;
    let current = true;
    const settle = (result: ReadResult) => {
      if (current)
        setSettled((previous) => ({
          request,
          result,
          snapshot: result.kind === "ready" ? result.snapshot : (previous?.snapshot ?? null),
        }));
    };
    void request.readDocument(request.target).then(settle, (error) =>
      settle({
        kind: "error",
        message:
          error instanceof Error ? error.message.slice(0, 1024) : "Could not read this file.",
      }),
    );
    // Every new read invalidates its predecessor. Fallback and unmount also discard results.
    return () => {
      current = false;
    };
  }, [request, fallback]);

  if (fallback) return <Original />;
  const path = snapshot?.target.path ?? target.path;
  const filenameStart = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1;
  const filename = path.slice(filenameStart) || path;
  const directory = path.slice(0, filenameStart);
  return (
    <section ref={root} className="markdown-reader" aria-label="Markdown Reader">
      <header className="mr-toolbar">
        <fieldset className="mr-identity" aria-label={path} title={path}>
          <span className="mr-filename">{filename}</span>
          {directory && <span className="mr-path">{directory}</span>}
        </fieldset>
        <fieldset className="mr-controls" aria-label="Document controls">
          <fieldset className="mr-view-controls" aria-label="Document view">
            <IconAction
              icon="Eye"
              label="Preview"
              aria-pressed={view === "preview"}
              onClick={() => setView("preview")}
            />
            <IconAction
              icon="Code"
              label="Raw"
              aria-pressed={view === "raw"}
              onClick={() => setView("raw")}
            />
          </fieldset>
          <fieldset className="mr-reader-actions" aria-label="Reader actions">
            {view === "preview" && !!model?.headings.length && (
              <IconAction
                icon="ListView"
                label="Outline"
                aria-pressed={showOutline}
                onClick={() => setShowOutline((show) => !show)}
              />
            )}
            <IconAction icon="RotateCcw" label="Refresh" onClick={refresh} />
          </fieldset>
        </fieldset>
      </header>
      <div className="mr-content">
        <DestinationProvider
          snapshot={snapshot}
          requests={model?.requests ?? NO_DESTINATIONS}
          resolve={resolveDestinations}
          enabled={!loading && result?.kind === "ready"}
        >
          {(destinations) => (
            <>
              {loading && (
                <output className="block mr-state">
                  {snapshot
                    ? "Refreshing Markdown. Showing previous snapshot, not verified current."
                    : "Loading Markdown..."}
                </output>
              )}
              {result && result.kind !== "ready" && (
                <div className="mr-state" role="alert">
                  {snapshot && <p>Refresh failed. Showing stale snapshot.</p>}
                  <p>{result.message}</p>
                  <Button variant="outline" onClick={refresh}>
                    Retry
                  </Button>
                  <Button variant="outline" onClick={() => setFallback(true)}>
                    Open in BB preview
                  </Button>
                </div>
              )}
              {snapshot &&
                model &&
                (snapshot.text === "" && view === "preview" ? (
                  <output className="block mr-state">This file is empty.</output>
                ) : (
                  <MarkdownDocument
                    model={model}
                    view={view}
                    destinations={destinations}
                    outline={showOutline}
                    lineRange={lineRange}
                    annotateSourceLines
                    navigation={navigation}
                  />
                ))}
            </>
          )}
        </DestinationProvider>
      </div>
      <SelectionAction
        panel={root}
        snapshot={!loading && result?.kind === "ready" ? snapshot : null}
        view={view}
        destination={destination}
        revision={request.revision}
      />
    </section>
  );
};
