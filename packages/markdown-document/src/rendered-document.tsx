import type { Element, Root, RootContent } from "hast";
import { destination, type Destination, type DestinationPolicy } from "./destinations.js";

export type Heading = Readonly<{ id: string; fragment: string; label: string; level: number }>;
export type RenderedDocument = Readonly<{
  headings: readonly Heading[];
  fragments: ReadonlyMap<string, string>;
}>;
export type DocumentData = {
  document?: RenderedDocument;
  destination?: Destination;
};
declare module "hast" {
  interface ElementData extends DocumentData {}
}
function label(node: RootContent): string {
  if (node.type === "text") return node.value;
  if (node.type !== "element") return "";
  if (node.tagName === "img") return String(node.properties.alt || "Image");
  return node.children.map(label).join("");
}
function walk(nodes: RootContent[], visit: (node: Element) => void) {
  for (const node of nodes) {
    if (node.type !== "element") continue;
    visit(node);
    walk(node.children, visit);
  }
}
export function renderedDocument(options: { prefix: string; policy: DestinationPolicy }) {
  return (tree: Root) => {
    const headings: Heading[] = [];
    const fragments = new Map<string, string>();
    const used = new Set<string>();
    const generated = new Map<string, string>();
    walk(tree.children, (node) => {
      if (node.properties.id) {
        const original = String(node.properties.id);
        const scoped = `${options.prefix}-generated-${original}`;
        generated.set(original, scoped);
        node.properties.id = scoped;
      }
      if (
        !/^h[1-6]$/.test(node.tagName) ||
        String(node.properties.id || "") === `${options.prefix}-generated-footnote-label`
      )
        return;
      const text = node.children.map(label).join("").normalize("NFC").replace(/\s+/gu, " ").trim();
      const base =
        text
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\p{M}_\s-]/gu, "")
          .replace(/\s+/gu, "-") || "section";
      let fragment = base;
      let suffix = 1;
      while (used.has(fragment)) fragment = `${base}-${suffix++}`;
      used.add(fragment);
      const id = `${options.prefix}-heading-${fragment}`;
      node.properties.id = id;
      headings.push(
        Object.freeze({ id, fragment, label: text || "Section", level: Number(node.tagName[1]) }),
      );
      fragments.set(fragment, id);
    });
    for (const [original, scoped] of generated) {
      if (!fragments.has(original)) fragments.set(original, scoped);
      fragments.set(scoped, scoped);
    }
    walk(tree.children, (node) => {
      if (node.properties.ariaDescribedBy) {
        const ids = node.properties.ariaDescribedBy;
        node.properties.ariaDescribedBy = ids.map((id) => generated.get(id) || id);
      }
      if (node.tagName === "a" || node.tagName === "img") {
        const attribute = node.tagName === "a" ? "href" : "src";
        const original = String(node.properties[attribute] || "");
        let parsed = destination(original, options.policy);
        if (
          parsed.kind === "fragment" &&
          (node.properties.dataFootnoteRef !== undefined ||
            node.properties.dataFootnoteBackref !== undefined)
        ) {
          const scoped = generated.get(parsed.fragment);
          if (scoped) parsed = { kind: "fragment", fragment: scoped };
        }
        node.data = { ...node.data, destination: parsed };
        delete node.properties[attribute];
      }
    });
    const document: RenderedDocument = Object.freeze({
      headings: Object.freeze(headings),
      fragments,
    });
    tree.children = [
      {
        type: "element",
        tagName: "div",
        properties: {},
        data: { document },
        children: tree.children.filter((node) => node.type !== "doctype"),
      },
    ];
  };
}
