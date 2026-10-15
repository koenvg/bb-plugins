# Markdown document interface

This private package renders Markdown and GFM in Preview, and the exact supplied string in Raw. It has no loader, authorization, file identity, toolbar, or writes. Consumers supply React 19 as a peer and bundle the document code and scoped stylesheet themselves.

## Public exports

The root exports `MarkdownDocument`, `MarkdownDocumentProps`, `DocumentView`, `DestinationPolicy`, `SourceDestination`, and `denyDestinations`. `style.css` exports the scoped stylesheet. No parser or source transport is public.

`MarkdownDocument` accepts immutable `text`, `view`, `namespace`, optional `destinations`, and optional `outline`. Views are `preview` and `raw`. `outline` defaults to true. Raw preserves the supplied string, including BOM, CRLF, frontmatter, and whitespace. Raw HTML and MDX do not execute. GFM tables, disabled task checkboxes, footnotes, and plain code retain their semantics. Code fences use bounded explicit-language highlighting.

## Fence highlighting

Explicit labels select JSON, JavaScript, TypeScript, Bash, Python, markup, or CSS. Aliases are `js`, `ts`, `sh`, `shell`, `py`, `html`, and `xml`. Labels are case-insensitive. There is no language detection or all-language import.

The inclusive limit is 20,480 UTF-8 bytes per rendered fence, including the parser-added final LF for nonempty code. Missing or unknown labels, larger fences, tokenizer failures, and invalid or lossy token output stay plain. The renderer reconstructs only text and passive spans with filtered classes. Token validation stops above 64 nesting levels or 16,384 nodes. These bounds do not guarantee tokenizer execution time or bound aggregate work across many fences.

Preview follows Markdown parser newline rules. Raw does not reconstruct source from Preview and remains exact. Highlighted JSON values, tabs, and trailing spaces stay text, not inferred status fields.

## Reading layout

All styles stay beneath `.md-document`. A named document container controls responsiveness independently of the viewport. Prose has a 720 px maximum width and 16 px text with 1.75 line height. Containers at most 600 px use 15 px text with 1.8 line height. H1 sizes are 39 px above 900 px, 34 px through 900 px, and 30 px through 600 px. H2 uses 21 px or compact 20 px, with 46 px above and 14 px below each section. H3 uses 18 px. Code uses the host `--font-mono` with a monospace fallback, 13 px text, and 1.9 line height.

Code and tables scroll locally and accept keyboard focus. Focus outlines use `--ring`. Prose, syntax emphasis, borders, selection, and quiet code surfaces use active host tokens. The package has no palette or theme state. Comments use `--muted-foreground`; keywords, booleans, and properties have extra weight; strings have a subdued underline. Custom theme contrast remains the host theme's responsibility.

The Tasks production-overlay fixture covers light, dark, custom tokens, and a narrow document inside a desktop viewport. It measures composited contrast, local overflow, semantic hierarchy, keyboard focus, exact source, one load, live view preservation, and adjacent editor/chat sentinels. File-reader adoption, matched production-reader parity, and installed acceptance remain separate work.

## Heading navigation

Preview derives heading targets and outline labels from the same ReactMarkdown/GFM HAST tree. Labels include inline text, code, link labels, and image alt text, but exclude skipped raw nodes. Labels use NFC Unicode normalization and collapsed whitespace. Fragments use lowercase letters, numbers, combining marks, underscores, and hyphens. Punctuation is removed. An empty slug becomes `section`. Collisions receive the next unused numeric suffix, including collisions with literal suffixed headings.

The consumer namespace and React mount identity prefix every target. Repeated consumer namespaces stay isolated. Generated footnote IDs and their ID references are scoped too. Fragments decode once and target owned elements. Unknown or malformed fragments stay inert. Activation focuses the target and scrolls only a containing scroll region, not the host page or location hash.

**On this page** is a native keyboard-operable disclosure. Its spacing responds to the document container. It appears only with headings and explicit local-fragment permission. `outline={false}` hides the chrome without removing targets. Raw and heading-free documents have no outline.

## Destination policies

Missing policy and `{ kind: "deny" }` deny every destination. Rejected links retain their labels without a native `href`. Rejected images retain accessible alt text. Permissions are independent and default to absent.

```tsx
<MarkdownDocument
  text={snapshot.text}
  view="preview"
  namespace="task-report"
  destinations={{
    kind: "attachment",
    localFragments: true,
    openExternal: navigate.openUrl,
    remoteImages: true,
  }}
/>
```

`attachment` has no root, source binding, or source callback. Relative paths, absolute filesystem paths, protocol-relative URLs, executable schemes, unsupported internal schemes, and file-source images stay inactive. The package does not infer sibling attachments or a storage root.

`bound-source` requires `binding` with trusted `root`, `host`, and absolute `documentPath`, plus a required `activateSource` callback. The shared gate decodes once, resolves against the containing document, normalizes dot segments, checks lexical root containment, and preserves the bound host. It rejects malformed encoding, controls, backslashes, userinfo, ambiguous URL forms, encoded path delimiters, and unsupported schemes before dispatch or active URL attributes. The callback receives `{ host, path, fragment? }`, never a document-chosen host. It owns operation-time authorization and confinement, including filesystem or symlink checks. The public fixture proves this interface, not production Markdown Reader adoption. No file-source image transport is provided.

External HTTP(S) links require `openExternal`. Ordinary primary clicks and Enter prevent browser fallback and call it once. False results or exceptions show `Link could not be opened.` and stay in the document. This deliberately fails closed rather than falling back to browser navigation. Safe external anchors retain real canonical hrefs for copy, context menus, modified activation, and middle clicks. They have no universal `_blank` target. Local fragments remain local even with modifiers or middle activation.

## Remote-image network behavior

`remoteImages: true` permits remote HTTP(S) raster images. This causes requests to the image host. Canonical URLs on the mounted application's origin are rejected before networking, including BB authenticated resources. Relative and file-source images are not fetched.

The package uses CORS fetch with `credentials: "omit"`, `referrerPolicy: "no-referrer"`, and `redirect: "error"`. It never uses an authenticated proxy or retries with a direct image URL. The host must permit CORS. Redirects, CORS failures, HTTP errors, unsupported media types, and decoding failures show readable alt fallback. Supported response types are PNG, JPEG, GIF, WebP, and AVIF. SVG is not loaded.

Each image is limited to 4 MiB of streamed response bytes. Each mounted document permits at most 32 request attempts, four concurrent requests, and 16 MiB of retained or in-flight response bytes. Content-Length can reject early but cannot bypass the streamed limit. Equivalent policy objects preserve image resources and budgets. Replacement, Raw, and unmount abort pending requests and revoke owned blob URLs. Broken images release their blobs. Images fit the prose width and preserve their intrinsic aspect ratio.

Byte limits do not bound decoded-pixel memory. Actual installed BB CSP support for `blob:` images remains unverified. Remote hosts still observe network metadata such as IP addresses. Credential omission does not make remote loading private.

## Behavior evidence

| Contract                                                                                                                                   | Public or rendered check                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| GFM, exact Raw, raw HTML rejection, absent permissions                                                                                     | `test/public.test.tsx`                                               |
| Unicode, formatting, duplicates, literal suffixes, repeated namespaces, local and footnote activation, hidden and empty outlines           | `test/navigation.test.tsx`                                           |
| Pre-dispatch validation, permissive confined source fixture, inert attachment paths and source assets, external failures and modifiers     | `test/navigation.test.tsx`                                           |
| Explicit remote permission, same-origin denial, request options, streams, byte budgets, concurrency, request count, abort and blob release | `test/images.test.tsx`                                               |
| Real CORS and redirect failures, omitted cookies and referrers, image fit and ratio, keyboard disclosure, dialog-local focus and scroll    | Tasks `tests/browser/navigation.spec.ts`                             |
| Native new-tab completion, with a plain-anchor diagnostic for runner failures                                                              | Tasks `tests/browser/navigation.spec.ts` and `native-anchor.spec.ts` |

A check's presence is not a pass. See the delivery evidence for results. Browser fixtures substitute SDK and attachment transport. They do not prove installed BB preference routing, CSP, authentication, or production file-reader adoption.

## Build and verify

From this directory, run these commands in order:

```sh
bun install --frozen-lockfile
bun run build
bun run test
bun run typecheck
```

Build this package before installing or checking a consumer's local file dependency. Tasks bundles the common code and CSS. Its Vitest and browser fixtures deduplicate the consumer-owned React runtime. Markdown Reader adoption is outside this delivery. The approved package-manager exception uses frozen Bun installs rather than the plan's npm ci.
