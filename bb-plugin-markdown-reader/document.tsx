import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// All destinations stay inert until the source module owns safe resolution.
// Do not pass href/src through to the browser, even for apparent HTTP(S) URLs.
const components: Components = {
  a: ({ children }) => <span className="mr-inert-link">{children}</span>,
  img: ({ alt }) => <span className="mr-image-placeholder">{alt || "Image"}</span>,
  table: ({ children }) => <div className="mr-table-scroll" tabIndex={0} role="region" aria-label="Markdown table"><table>{children}</table></div>,
  pre: ({ children }) => <pre tabIndex={0} aria-label="Code block">{children}</pre>,
};
const plugins = [remarkGfm];

/** Presentation accepts a snapshot's text; it does not load or rewrite it. */
export function MarkdownDocument({ text }: { text: string }) {
  return <article className="mr-prose" aria-label="Markdown preview">
    <Markdown remarkPlugins={plugins} components={components} skipHtml>{text}</Markdown>
  </article>;
}
