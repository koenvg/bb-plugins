import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import GithubSlugger from "github-slugger";
import { visit } from "unist-util-visit";
import type { Element as HastElement, Root, RootContent } from "hast";
import type { ReactNode } from "react";
import { createSourceLines, type SourceLines } from "./source-lines";
import { DestinationLink, DestinationImage } from "./destination-view";
import { MAX_DESTINATIONS, MAX_DESTINATION_URL_LENGTH, destinationKey, type DestinationRequest } from "./destination-types";

export interface DocumentHeading { level: number; text: string; fragment: string; id: string; line: number }
export interface DocumentModel {
  content: ReactNode;
  headings: readonly DocumentHeading[];
  sourceLines: SourceLines;
  requests: DestinationRequest[];
  fragmentTarget(fragment: string): string | null;
}

// Match visible heading text, including the inert image placeholder. Raw HTML is skipped.
function headingText(node: RootContent): string {
  if (node.type === "text") return node.value;
  if (node.type !== "element") return "";
  if (node.tagName === "img") return String(node.properties.alt || "Image");
  return node.children.map(headingText).join("");
}

/** Namespace parser-generated IDs and their references before source heading IDs
 * are assigned. Passive footnotes retain reader-local accessibility descriptions. */
function scopeGeneratedIds(tree: Root, namespace: string) {
  const ids = new Map<string, string>();
  visit(tree, "element", node => {
    if (node.properties.id) ids.set(String(node.properties.id), `${namespace}-generated-${ids.size}`);
  });
  visit(tree, "element", node => {
    const properties = node.properties;
    if (properties.id) properties.id = ids.get(String(properties.id));
    if (properties.ariaDescribedBy) {
      const references = Array.isArray(properties.ariaDescribedBy) ? properties.ariaDescribedBy : String(properties.ariaDescribedBy).split(" ");
      properties.ariaDescribedBy = references.map(id => ids.get(String(id)) ?? id);
    }
    const href = properties.href;
    if (typeof href === "string" && href.startsWith("#") && ids.has(href.slice(1))) properties.href = `#${ids.get(href.slice(1))}`;
  });
  return ids;
}

/** React-markdown's synchronous renderer parses once. The rehype transform records
 * targets on that exact rendered tree, not on a second heading parser. */
export function createDocumentModel(text: string, namespace: string): DocumentModel {
  const headings: DocumentHeading[] = [];
  const fragments = new Map<string, string>();
  const slugger = new GithubSlugger();
  const requests: DestinationRequest[] = [];
  const requested = new Set<string>();
  const fragmentTarget = (fragment: string) => {
    if (!fragment.startsWith("#")) return null;
    try { return fragments.get(decodeURIComponent(fragment.slice(1))) ?? null; }
    catch { return null; }
  };
  const components: Components = {
    a: ({ href = "", children, id, "aria-describedby": description, "aria-label": label }) =>
      <DestinationLink url={href} fragmentTarget={fragmentTarget} id={id} aria-describedby={description} aria-label={label}>{children}</DestinationLink>,
    img: ({ src = "", alt, title }) => <DestinationImage url={src} alt={alt} title={title} />,
    table: ({ children }) => <div className="mr-table-scroll" tabIndex={0} role="region" aria-label="Markdown table"><table>{children}</table></div>,
    pre: ({ children }) => <pre tabIndex={0} aria-label="Code block">{children}</pre>,
  };
  function collectHeadings() {
    return (tree: Root) => {
      const generated = scopeGeneratedIds(tree, namespace);
      for (const [original, id] of generated) { fragments.set(original, id); fragments.set(id, id); }
      visit(tree, "element", (node: HastElement) => {
        if (node.properties.id) node.properties.tabIndex = -1;
        const url = node.tagName === "a" ? node.properties.href : node.tagName === "img" ? node.properties.src : null;
        if (typeof url === "string" && url.length <= MAX_DESTINATION_URL_LENGTH && !url.startsWith("#")) {
          const request = { url, image: node.tagName === "img" };
          const key = destinationKey(request);
          if (!requested.has(key) && requests.length < MAX_DESTINATIONS) { requested.add(key); requests.push(request); }
        }
        // Only source-backed headings belong in the document outline. The parser
        // also emits a positionless accessibility label for used footnotes.
        if (!/^h[1-6]$/.test(node.tagName) || !node.position) return;
        const label = headingText(node);
        const fragment = slugger.slug(label);
        const id = `${namespace}-heading-${headings.length}`;
        node.properties.id = id;
        node.properties.tabIndex = -1;
        fragments.set(fragment, id);
        headings.push({ level: Number(node.tagName[1]), text: label, fragment, id, line: node.position.start.line });
      });
    };
  }
  const content = Markdown({ children: text, remarkPlugins: [remarkGfm], rehypePlugins: [collectHeadings], components, skipHtml: true, urlTransform: url => url });
  return { content, headings, requests, fragmentTarget, sourceLines: createSourceLines(text) };
}

export function MarkdownDocument({ model, navigate }: { model: DocumentModel; navigate: (id: string) => void }) {
  const activate = (event: React.MouseEvent<HTMLElement>) => {
    const anchor = (event.target as Element | null)?.closest?.("a[data-heading-target]");
    if (!anchor) return;
    event.preventDefault();
    if (event.button < 2) navigate(anchor.getAttribute("data-heading-target")!);
  };
  return <article className="mr-prose" aria-label="Markdown preview" onClick={activate} onAuxClick={activate}>{model.content}</article>;
}
