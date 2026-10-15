# Markdown document interface

This private build-time package provides the document presentation used by Tasks and Markdown Reader. It owns parsing, headings, Raw, bounded highlighting, outline and scoped CSS. Consumers own source loading, authorization, snapshot lifetime, controls and writes. Either plugin works without the other installed.

## Public interface

```tsx
import { useId, useMemo } from "react";
import {
  createDocumentModel,
  MarkdownDocument,
  denyDestinations,
} from "@bb-plugins/markdown-document";
import "@bb-plugins/markdown-document/style.css";

const namespace = useId();
const model = useMemo(() => createDocumentModel(snapshot.text, namespace), [snapshot, namespace]);
return <MarkdownDocument model={model} view={view} destinations={denyDestinations} />;
```

Create one model for an immutable loaded snapshot and use a mount-unique namespace. Reuse the model across Preview/Raw switches and line requests. The factory derives headings, fragments, destination requests and exact source lines from the supplied string. Model fields are read-only presentation data, never source authority.

`MarkdownDocument` accepts `model`, controlled `view`, optional `destinations`, `outline`, `lineRange`, `annotateSourceLines` and `navigation`. `view` is `preview` or `raw`. The root exports these public types and the source-neutral heading, request, grant and link-reference types. Internal subpaths are not exported.

Preview hides leading YAML frontmatter without changing heading source positions. It renders GFM, disabled task checkboxes and passive syntax tokens. Known fences up to 20 KiB receive highlighting. Unknown languages, larger fences and tokenizer failures remain plain code. Raw preserves the complete source, including BOM, frontmatter, mixed line endings and whitespace. HTML and MDX do not execute.

`outline` defaults to false. When enabled, it uses document-local heading and footnote targets and adapts to the supplied container. `lineRange` has inclusive one-based `startLineNumber` and `endLineNumber` bounds. Valid integers are ordered and clamped. Raw reveals repeated request objects even when their values match. Invalid ranges do not highlight content.

Default Raw uses one text node, including newline-dense files up to the consumer's 1 MiB limit. A valid range request or explicit `annotateSourceLines` enables per-line targets. Reader opts in for source selection and range navigation. Tasks does not. Both paths preserve exactly the same source. Reader's inherited annotation cost is tracked separately in [BBP-249](bbtask://BBP-249).

An optional `navigation` supplies a container ref and `reveal(target)` callback. Markdown Reader uses its toolbar-aware panel reveal. Without that callback, the presenter scrolls only its own root when that root is a scroller, and focuses the target without scrolling ancestors. `.mr-prose`, `.mr-raw` and `[data-source-line]` are retained content hooks for the reader's selection action.

## Destination policies

- Missing policy or `denyDestinations` denies all destinations, including local fragments. Labels and image alt text remain readable.
- `localDestinations` enables only targets in the current model.
- A `delegated` policy resolves checked requests to rejected, fragment, bound-link or image grants. Consumers bind SDK links outside this package. Link/image grant mismatches remain inert.

The package rejects malformed encodings, active schemes, credentials, encoded separators/traversal and unsupported absolute paths before consumer dispatch. It bounds collected requests to 128, URLs to 4096 characters and images to 32. It never derives a filesystem root, host or attachment relationship.

Image grants distinguish `remote` from `source`. Remote grants must match the requested HTTP(S) URL and cannot target the current BB origin. They use anonymous CORS and no referrer, so cross-origin credentials are omitted. A remote host must permit CORS; otherwise readable alt/error text remains. Source-image URLs are explicit consumer-issued local capabilities, not document-provided BB endpoints. The reader validates its opaque image route and keeps host/root confinement outside this package.

Tasks supplies deny-all in this delivery. Markdown Reader supplies only currently verified grants and falls back to local-only while loading or stale. Refresh and fallback revoke source-backed links and image sources without discarding readable stale text.

## Build and verify

Use Bun 1.4.3 and Node 24.15 or newer within Node 24:

```sh
bun install --frozen-lockfile
bun run build
bun run test --maxWorkers=1
bun run typecheck
```

The root and CSS exports intentionally resolve to source ESM/TSX and CSS. BB compiles them into each consumer bundle. This preserves clean plugin builds because BB has no shared-package pre-build hook. `bun run build` separately verifies emitted ESM, declarations and CSS under `dist`; it does not change package exports. React is a consumer-owned peer, not a bundled runtime.

For fresh independent consumer setup and production-bundle checks, run [the BBP-57 clean verifier](../../verification/BBP-57/clean-build.mjs) from the repository root. [The BBP-57 report](../../verification/BBP-57/report.md) separates fixture evidence, build evidence and required installed acceptance.
