import type { ReactElement } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { boundedCode } from "./code.js";

export type DocumentView = "preview" | "raw";
export type DestinationPolicy = Readonly<{ kind: "deny" }>;
export const denyDestinations: DestinationPolicy = Object.freeze({ kind: "deny" });

export type MarkdownDocumentProps = Readonly<{
  text: string;
  view: DocumentView;
  namespace: string;
  destinations?: DestinationPolicy;
}>;

export function MarkdownDocument({ text, view, namespace }: MarkdownDocumentProps): ReactElement {
  return (
    <div className="md-document" data-document-namespace={namespace}>
      {view === "raw" ? (
        <pre className="md-document-raw" aria-label="Raw source" tabIndex={0}>
          {text}
        </pre>
      ) : (
        <article className="md-document-prose">
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[boundedCode]}
            skipHtml
            components={{
              a: ({ children }) => <span>{children}</span>,
              img: ({ alt }) => (
                <span role="img" aria-label={alt || "Image"}>
                  {alt || "Image"}
                </span>
              ),
              table: ({ children }) => (
                <div className="md-document-table" tabIndex={0} role="region" aria-label="Table">
                  <table>{children}</table>
                </div>
              ),
              pre: ({ children }) => <pre tabIndex={0}>{children}</pre>,
            }}
          >
            {text}
          </Markdown>
        </article>
      )}
    </div>
  );
}
