import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import GithubSlugger from "github-slugger";
import { visit } from "unist-util-visit";
import type { Element as HastElement, Root, RootContent } from "hast";
import type { ReactNode } from "react";
import { createSourceLines, type SourceLines } from "./source-lines.js";
import { DestinationLink, DestinationImage } from "./destinations.js";
import {
  MAX_DESTINATIONS,
  MAX_IMAGES,
  checkedDestination,
  destinationKey,
  type DestinationRequest,
} from "./destinations.js";
import { boundedCode } from "./code.js";

export interface DocumentHeading {
  readonly level: number;
  readonly text: string;
  readonly fragment: string;
  readonly id: string;
  readonly line: number;
}
export interface DocumentModel {
  readonly content: ReactNode;
  readonly namespace: string;
  readonly headings: readonly DocumentHeading[];
  readonly sourceLines: SourceLines;
  readonly requests: readonly DestinationRequest[];
  readonly fragmentTarget: (fragment: string) => string | null;
}

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
  visit(tree, "element", (node) => {
    if (node.properties.id)
      ids.set(String(node.properties.id), `${namespace}-generated-${ids.size}`);
  });
  visit(tree, "element", (node) => {
    const properties = node.properties;
    if (properties.id) properties.id = ids.get(String(properties.id));
    if (properties.ariaDescribedBy) {
      const references = Array.isArray(properties.ariaDescribedBy)
        ? properties.ariaDescribedBy
        : String(properties.ariaDescribedBy).split(" ");
      properties.ariaDescribedBy = references.map((id) => ids.get(String(id)) ?? id);
    }
    const href = properties.href;
    if (typeof href === "string" && href.startsWith("#") && ids.has(href.slice(1)))
      properties.href = `#${ids.get(href.slice(1))}`;
  });
  return ids;
}

export function createDocumentModel(text: string, namespace: string): DocumentModel {
  const headings: DocumentHeading[] = [];
  const fragments = new Map<string, string>();
  const slugger = new GithubSlugger();
  const requests: DestinationRequest[] = [];
  const requested = new Set<string>();
  const fragmentTarget = (fragment: string) => {
    if (!fragment.startsWith("#")) return null;
    try {
      return fragments.get(decodeURIComponent(fragment.slice(1))) ?? null;
    } catch {
      return null;
    }
  };
  const components: Components = {
    a: ({ href = "", children, id, "aria-describedby": description, "aria-label": label }) => (
      <DestinationLink
        url={href}
        fragmentTarget={fragmentTarget}
        id={id}
        aria-describedby={description}
        aria-label={label}
      >
        {children}
      </DestinationLink>
    ),
    img: ({ src = "", alt, title }) => <DestinationImage url={src} alt={alt} title={title} />,
    table: ({ children }) => (
      <div className="mr-table-scroll" tabIndex={0} role="region" aria-label="Markdown table">
        <table>{children}</table>
      </div>
    ),
    pre: ({ children }) => (
      <pre tabIndex={0} aria-label="Code block">
        {children}
      </pre>
    ),
  };
  function collectHeadings() {
    return (tree: Root) => {
      const generated = scopeGeneratedIds(tree, namespace);
      for (const [original, id] of generated) {
        fragments.set(original, id);
        fragments.set(id, id);
      }
      visit(tree, "element", (node: HastElement) => {
        if (node.properties.id) node.properties.tabIndex = -1;
        const url =
          node.tagName === "a"
            ? node.properties.href
            : node.tagName === "img"
              ? node.properties.src
              : null;
        if (
          typeof url === "string" &&
          !url.startsWith("#") &&
          checkedDestination(url, node.tagName === "img")
        ) {
          const request = Object.freeze({ url, image: node.tagName === "img" });
          const key = destinationKey(request);
          if (
            !requested.has(key) &&
            requests.length < MAX_DESTINATIONS &&
            (!request.image || requests.filter((r) => r.image).length < MAX_IMAGES)
          ) {
            requested.add(key);
            requests.push(request);
          }
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
        headings.push({
          level: Number(node.tagName[1]),
          text: label,
          fragment,
          id,
          line: node.position.start.line,
        });
      });
    };
  }
  const content = Markdown({
    children: text,
    remarkPlugins: [remarkGfm, remarkFrontmatter],
    rehypePlugins: [collectHeadings, boundedCode],
    components,
    skipHtml: true,
    urlTransform: (url) => url,
  });
  return Object.freeze({
    namespace,
    content,
    headings: Object.freeze(headings.map((h) => Object.freeze(h))),
    requests: Object.freeze(requests),
    fragmentTarget,
    sourceLines: createSourceLines(text),
  });
}
