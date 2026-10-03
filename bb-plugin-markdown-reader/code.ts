import { refractor } from "refractor/core";
import markup from "refractor/markup";
import css from "refractor/css";
import javascript from "refractor/javascript";
import typescript from "refractor/typescript";
import json from "refractor/json";
import bash from "refractor/bash";
import python from "refractor/python";
import { visit } from "unist-util-visit";
import type { ElementContent, Root, RootContent } from "hast";

// Explicit imports keep the grammar bundle small. Never use refractor/all or detection.
for (const grammar of [markup, css, javascript, typescript, json, bash, python]) refractor.register(grammar);
const languages: Readonly<Record<string, string>> = {
  markup: "markup", html: "markup", xml: "markup",
  css: "css", javascript: "javascript", js: "javascript",
  typescript: "typescript", ts: "typescript", json: "json",
  bash: "bash", sh: "bash", shell: "bash", python: "python", py: "python",
};
const MAX_CODE_BYTES = 20 * 1024;

/** Keep only text and passive token spans, then verify their complete text before use.
 * React-markdown renders this HAST as React nodes, never an HTML string. */
function passiveTokens(nodes: readonly RootContent[]): { nodes: ElementContent[]; text: string } {
  let text = "";
  const safe = nodes.map(node => {
    if (node.type === "text") { text += node.value; return node; }
    if (node.type !== "element" || node.tagName !== "span") throw new Error("Unexpected syntax node");
    const children = passiveTokens(node.children);
    text += children.text;
    const classes = node.properties.className;
    return { type: "element" as const, tagName: "span", properties: {
      className: Array.isArray(classes) ? classes.filter(value => typeof value === "string" && /^[a-z-]+$/.test(value)) : [],
    }, children: children.nodes };
  });
  return { nodes: safe, text };
}

/** One policy for fences on the existing Markdown tree. Plain code is the fallback. */
export function boundedCode() {
  return (tree: Root) => {
    visit(tree, "element", node => {
      if (node.tagName !== "pre" || node.children.length !== 1) return;
      const code = node.children[0];
      if (code?.type !== "element" || code.tagName !== "code" || code.children.length !== 1) return;
      const value = code.children[0];
      if (value?.type !== "text") return;
      const classes = code.properties.className;
      const label = Array.isArray(classes) ? classes.find(c => typeof c === "string" && c.startsWith("language-")) : null;
      const name = typeof label === "string" ? label.slice(9).toLowerCase() : "";
      const language = Object.hasOwn(languages, name) ? languages[name] : undefined;
      // Guard UTF-8 bytes BEFORE invoking the tokenizer, including the rendered newline.
      if (!language || new TextEncoder().encode(value.value).byteLength > MAX_CODE_BYTES) return;
      try {
        const tokens = passiveTokens(refractor.highlight(value.value, language).children);
        if (tokens.text === value.value) code.children = tokens.nodes;
      } catch { /* Syntax failures must not prevent reading this document. */ }
    });
  };
}
