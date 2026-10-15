import { useCallback, useMemo, useRef, type RefObject } from "react";
import { Outline, useWidePanel } from "./outline.js";
import { RawDocument } from "./raw.js";
import {
  DestinationContext,
  denyDestinations,
  destinationKey,
  type DestinationPolicy,
} from "./destinations.js";
import type { DocumentModel } from "./model.js";
import type { LineRequest } from "./source-lines.js";
export { createDocumentModel, type DocumentModel, type DocumentHeading } from "./model.js";
export {
  denyDestinations,
  localDestinations,
  type DestinationPolicy,
  type DestinationRequest,
  type DestinationGrant,
  type LinkReferences,
} from "./destinations.js";
export type { LineRequest } from "./source-lines.js";
export type DocumentView = "preview" | "raw";
export type DocumentNavigation = Readonly<{
  container?: RefObject<HTMLElement | null>;
  reveal: (target: HTMLElement) => void;
}>;
export type MarkdownDocumentProps = Readonly<{
  model: DocumentModel;
  view: DocumentView;
  destinations?: DestinationPolicy;
  outline?: boolean;
  lineRange?: LineRequest;
  annotateSourceLines?: boolean;
  navigation?: DocumentNavigation;
}>;

export function MarkdownDocument({
  model,
  view,
  destinations = denyDestinations,
  outline = false,
  lineRange,
  annotateSourceLines = false,
  navigation,
}: MarkdownDocumentProps) {
  const root = useRef<HTMLDivElement>(null);
  const wide = useWidePanel(navigation?.container ?? root);
  const reveal = useCallback(
    (target: HTMLElement) => {
      if (navigation) navigation.reveal(target);
      else {
        const document = root.current;
        if (document && /^(auto|scroll)$/.test(getComputedStyle(document).overflowY)) {
          document.scrollTop +=
            target.getBoundingClientRect().top - document.getBoundingClientRect().top;
        }
        target.focus({ preventScroll: true });
      }
    },
    [navigation],
  );
  const navigate = (id: string) => {
    const target = Array.from(
      root.current?.querySelectorAll<HTMLElement>(".mr-prose [id]") ?? [],
    ).find((node) => node.id === id);
    if (target) reveal(target);
  };
  const policy = useMemo<DestinationPolicy>(() => {
    if (destinations.kind !== "delegated") return destinations;
    const requests = new Map(model.requests.map((request) => [destinationKey(request), request]));
    return {
      kind: "delegated",
      resolve: (request) => {
        const issued = requests.get(destinationKey(request));
        return issued ? destinations.resolve(issued) : undefined;
      },
    };
  }, [model, destinations]);
  const activate = (event: React.MouseEvent<HTMLElement>) => {
    const anchor = (event.target as Element | null)?.closest?.("a[data-heading-target]");
    if (!anchor) return;
    event.preventDefault();
    if (event.button < 2) navigate(anchor.getAttribute("data-heading-target")!);
  };
  const showOutline = outline && model.headings.length > 0;
  return (
    <div ref={root} className="md-document" data-document-namespace={model.namespace}>
      <DestinationContext.Provider value={policy}>
        {view === "raw" ? (
          <RawDocument
            sourceLines={model.sourceLines}
            request={lineRange}
            annotations={annotateSourceLines}
            reveal={reveal}
          />
        ) : (
          <div
            className="mr-document-layout"
            data-outline={showOutline ? (wide ? "aside" : "inline") : "hidden"}
          >
            {showOutline && !wide && <Outline model={model} wide={false} navigate={navigate} />}
            <article
              className="mr-prose"
              aria-label="Markdown preview"
              onClick={activate}
              onAuxClick={activate}
            >
              {model.content}
            </article>
            {showOutline && wide && <Outline model={model} wide navigate={navigate} />}
          </div>
        )}
      </DestinationContext.Provider>
    </div>
  );
}
