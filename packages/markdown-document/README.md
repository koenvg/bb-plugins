# Markdown document interface

This private package renders baseline Markdown and GFM in Preview, and the exact supplied string in Raw. It has no loader, authorization, file identity, toolbar, or writes. Consumers supply React 19 as a peer. The compiled ESM imports React rather than bundling a runtime.

## Public exports

The root exports `MarkdownDocument`, `MarkdownDocumentProps`, `DocumentView`, `DestinationPolicy`, and `denyDestinations`. `style.css` exports the scoped stylesheet. No source paths or wildcard exports are public.

`MarkdownDocument` accepts immutable `text`, `view`, `namespace`, and optional `destinations`. Views are `preview` and `raw`. The namespace identifies a consumer-local document. The only current policy is `{ kind: "deny" }`. Missing policy also denies every destination, including generated footnotes. Link labels and image alt text remain readable. The package does not infer a source root or fetch assets.

Preview uses semantic headings, GFM tables, disabled task checkboxes, and plain code. It skips raw HTML and MDX. Raw uses the original source string in a text node, including BOM, CRLF, frontmatter, and whitespace. The highlighter dependency is reserved but does not run. No heading navigation, active links, images, or highlighting is implemented.

## Build and verify

From this directory, run these commands in order:

```sh
bun install --frozen-lockfile
bun run build
bun run test
bun run typecheck
```

Build this package before installing or checking a consumer's local file dependency. Tasks bundles the compiled code and stylesheet into its own plugin. Markdown Reader adoption is outside this delivery. The approved package-manager exception uses frozen Bun installs rather than the plan's npm ci.
