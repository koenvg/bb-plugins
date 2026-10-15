# Markdown document interface

This private package renders baseline Markdown and GFM in Preview, and the exact supplied string in Raw. It has no loader, authorization, file identity, toolbar, or writes. Consumers supply React 19 as a peer. The compiled ESM imports React rather than bundling a runtime.

## Public exports

The root exports `MarkdownDocument`, `MarkdownDocumentProps`, `DocumentView`, `DestinationPolicy`, and `denyDestinations`. `style.css` exports the scoped stylesheet. No source paths or wildcard exports are public.

`MarkdownDocument` accepts immutable `text`, `view`, `namespace`, and optional `destinations`. Views are `preview` and `raw`. The namespace identifies a consumer-local document. The only current policy is `{ kind: "deny" }`. Missing policy also denies every destination, including generated footnotes. Link labels and image alt text remain readable. The package does not infer a source root or fetch assets.

Preview uses semantic headings, GFM tables, disabled task checkboxes, and bounded fence highlighting. It skips raw HTML and MDX. Raw uses the original source string in a text node, including BOM, CRLF, frontmatter, and whitespace. No heading navigation, outline, active links, or images are implemented.

## Fence highlighting

Explicit labels select JSON, JavaScript, TypeScript, Bash, Python, markup, or CSS. Aliases are `js`, `ts`, `sh`, `shell`, `py`, `html`, and `xml`. Labels are case-insensitive. There is no language detection or all-language import.

The inclusive limit is 20,480 UTF-8 bytes per rendered fence, including the parser-added final LF for nonempty code. Missing or unknown labels, larger fences, tokenizer failures, and invalid or lossy token output stay plain. The renderer reconstructs only text and passive spans with filtered classes. Token validation stops above 64 nesting levels or 16,384 nodes. These bounds do not guarantee tokenizer execution time or bound aggregate work across many fences.

Preview follows Markdown parser newline rules. Raw does not reconstruct source from Preview and remains exact. Highlighted JSON values, tabs, and trailing spaces stay text, not inferred status fields.

## Reading layout

All styles stay beneath `.md-document`. A named document container controls responsiveness independently of the viewport. Prose has a 720 px maximum width and 16 px text with 1.75 line height. Containers at most 600 px use 15 px text with 1.8 line height. H1 sizes are 39 px above 900 px, 34 px through 900 px, and 30 px through 600 px. H2 uses 21 px or compact 20 px, with 46 px above and 14 px below each section. H3 uses 18 px. Code uses the host `--font-mono` with a monospace fallback, 13 px text, and 1.9 line height.

Code and tables scroll locally and accept keyboard focus. Focus outlines use `--ring`. Prose, syntax emphasis, borders, selection, and quiet code surfaces use active host tokens. The package has no palette or theme state. Comments use `--muted-foreground`; keywords, booleans, and properties have extra weight; strings have a subdued underline. Custom theme contrast remains the host theme's responsibility.

The Tasks production-overlay fixture covers light, dark, custom tokens, and a narrow document inside a desktop viewport. It measures composited contrast, local overflow, semantic hierarchy, keyboard focus, exact source, one load, live view preservation, and adjacent editor/chat sentinels. File-reader adoption, optional outline integration, matched production-reader parity, and installed acceptance remain separate work.

## Build and verify

From this directory, run these commands in order:

```sh
bun install --frozen-lockfile
bun run build
bun run test
bun run typecheck
```

Build this package before installing or checking a consumer's local file dependency. Tasks bundles the compiled code and stylesheet into its own plugin. Markdown Reader adoption is outside this delivery. The approved package-manager exception uses frozen Bun installs rather than the plan's npm ci.
