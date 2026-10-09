# Markdown Reader

A read-only file opener for live workspace, absolute-host, and thread-storage `.md` and `.markdown` files. It uses a centered prose column, generous spacing, bounded code highlighting, and quiet tables. BB keeps its own tabs and file-opening preferences.

BBP-27 through BBP-31 implement this package. BBP-32 records assembled checks and a temporary, approved local installation followed by removal. The package is not published. Required native acceptance remains open.

## Use

After an explicit installation, select Markdown Reader with BB's one-off **Open with** choice or under **File openers**. Keep BB selected there if you prefer its built-in preview. This plugin does not change those preferences.

- Preview renders ordinary Markdown and GFM, including tables, read-only task lists, quotes, and fenced code. Native list markers remain visible under BB's reset, including ordered starts, nested lists and generated footnotes. Only task items suppress their marker; ordinary items in mixed task lists keep theirs.
- Preview hides a leading YAML frontmatter block delimited by `---`. It does not interpret the metadata. Body headings retain their original source line numbers. Ordinary separators and Setext headings remain Markdown.
- Raw shows the complete loaded text, including frontmatter, line endings, and code spaces. It is not an editor. Switching views does not read or write the file.
- Refresh reads the current file again and updates both views. There is no automatic file watching. During refresh, the reader labels retained content as not verified current. If refresh fails, it reports the failure and marks the retained snapshot stale. Retry reads the source again and clears that label only after success.
- Failed or unsupported reads offer Open in BB preview beside Retry. It renders BB's `Original` component, already bound to this file. It does not open the file again through plugin selection.

## Heading and line navigation

Outline lists only headings from the rendered Markdown parse. It keeps heading levels and visible inline text, including code and link text. Repeated headings have distinct GitHub-style fragment names, such as `#section` and `#section-1`. Non-ASCII names are supported, including percent-encoded fragments. Every mounted reader has separate DOM targets. Outline entries and known fragment links scroll and focus the heading in that reader without opening the file again. Missing or malformed fragments remain inert. Footnote references and return links scroll and focus targets within the same reader. Their accessibility references stay reader-local. The parser's hidden footnote label is not a source heading and does not create an outline entry.

Above 1080 px of reader width, Outline shows a 164 px aside beside the bounded prose column. Narrower readers use a closed **On this page** disclosure. Use Outline to hide it and return space to the document. Heading-free documents have no outline or toggle. The layout measures the reader panel, not the browser window.

BB's `experimental_lineRange` uses inclusive, one-based `startLineNumber` and `endLineNumber` values. A request selects Raw, highlights real source lines, and reveals the start after loading. A new request object with the same values reveals again without a new read or model replacement. Line-only changes do not reload the source. You can still select Preview or Raw manually.

Reversed integer bounds are put in order and clamped to existing lines. Invalid, fractional, non-finite, or unsafe integer bounds do not highlight lines. Empty text has nothing to highlight. Removing the request clears its highlight, not the manual view choice. Raw wraps long lines but keeps one target per source line, including the empty line after a final newline. CRLF, frontmatter, Unicode, and code spaces stay unchanged. Navigation never writes the file.

The header shows the actual filename above quiet directory context. Its complete path remains available by title and accessible name. Preview/Raw form one compact group of named host icon buttons. All toolbar buttons have hover/focus hints that Escape dismisses. Outline keeps a visible pressed state. Desktop readers use one header row; readers at or below 600 px use two rows, with further control wrapping if needed. Keyboard users can reach the buttons with Tab and activate them with Enter or Space. Code and tables have their own scroll regions. Appearance follows the active host tokens, not a reader theme switch.

## Supported sources and limits

All supported files use the same Preview/Raw reader and read-only `read_document` RPC. The source module validates the opener target, then uses `bb.sdk.files.read` with an explicit `hostId`, absolute `path`, and confined `rootPath`. The browser cannot supply an arbitrary root or a separate filesystem command. No server-local filesystem access or document writes occur.

- Workspace files use a relative path and the supplied environment or project source. Thread-backed targets resolve the actual thread's workspace identity. Project sources select the explicit host, or the unique default source when no host is supplied.
- Absolute-host files use the explicit opener host or the host of the supplied environment. A thread-only host target resolves the thread's actual environment first. Without an explicit host or environment identity, the read fails rather than using the server host. The permitted root is the file's containing directory, not the workspace root or host filesystem root. A read-only host worker resolves that directory's real path on the selected host, so directory aliases such as macOS `/tmp` work. Document reads and local-image leases use this real directory root. File symlinks still pass through SDK confinement checks.
- Thread-storage files require the actual storage thread ID. `threads.storageLocation({ threadId })` supplies the host and storage root. The plugin does not construct a storage path from a server data directory or substitute the workspace root.

Supplied thread, project, environment, and host identities must agree with their resolved source. Missing, inconsistent, ambiguous, or unready workspace identity shows an actionable error. Missing files, access failures, and disconnected hosts offer Retry and the bound BB preview. The SDK enforces root confinement, including resolved symlinks, on the selected host. A rejected read does not retry on another host.

Relative workspace/storage paths must be literal Markdown paths. Parent/dot traversal, percent encoding, backslashes, control characters, and colons are not accepted. Host paths must be absolute POSIX, Windows drive, or UNC file paths. Device paths, traversal, encoded paths, and Windows alternate data streams are rejected. Windows roots and files use Windows path semantics even when the server uses a different OS.

The reader accepts complete UTF-8 text up to **1 MiB**, including empty files. Preview reports an empty file; Raw preserves its empty source. Binary or invalid UTF-8 encoding and non-text control characters have explicit unsupported states. Larger or unsupported files offer the bound BB preview and are never returned to the reader for parsing. The current SDK has no stat or byte-limited read option. It can transfer a larger file to the server before this plugin rejects it. The 1 MiB limit bounds reader content, not SDK transfer.

## Links and images

Safe relative file links use BB's public source-aware FileLink. Siblings and literal parents inside the selected root are permitted. Host files cannot escape their containing-directory root. Unsafe schemes, malformed URLs/encodings, encoded traversal, and lexical root escapes stay readable without active href/src or content/navigation effects. Same-document heading and footnote fragments stay within the reader. Cross-file heading fragments are inert because the SDK has no heading-fragment opening location. Project-only workspaces without an environment remain readable, but native links need an environment.

Native local-file navigation uses normal BB opening behavior. It has **no extra plugin guarantee that a final symlink target stays inside the reader root**. Reader reads and local-image content requests do retain SDK root and symlink confinement on the actual source host. An attempted confined operation and a root-preview lease before asset validation are permitted. Outside-root content must not be delivered by the SDK.

External HTTP(S) links use BB's opening preferences through UrlLink. Remote images are ordinary browser network images, not authenticated BB proxies. They send no referrer, but the remote site can see the request and may receive its own browser cookies. No data/file/javascript/mail links are activated. Raw document HTML, MDX, scripts, and embedded widgets do not execute. Task checkboxes remain disabled. No report-specific metadata is inferred.

Local raster images support PNG, JPEG, GIF, WebP, AVIF, BMP, and ICO. SVG, HTML, PDF, and TIFF image destinations are inert. Local images share one source/root preview lease per loaded snapshot, with a 60-second TTL. At most 128 distinct destination requests and 32 distinct images are resolved per snapshot. URLs longer than 4096 characters stay individually inert; other valid destinations still work. Encoded path separators and nested path encodings are rejected for both local and external destinations. Image URLs carry an opaque lease, never a raw host/root path. Expiry or a failed asset request leaves readable alt/error text. Refresh renews transport even when text and hash do not change. View changes do not allocate another lease. Refresh, source switching, Original, and unmount remove stale image sources and discard late results. The SDK has no revocation API; abandoned leases expire.

## Code presentation

Fences with an explicit supported language receive lightweight highlighting up to 20 KiB of rendered UTF-8 code, including its final newline. The byte guard runs before tokenization. Unknown or missing languages, larger fences, and tokenizer failures stay plain readable code. There is no auto-detection, JSON parsing, pretty printing, or source reconstruction. Preview preserves the Markdown parser's rendered code text; Raw always preserves the complete exact original, including CRLF.

| Bundled language | Accepted labels         |
| ---------------- | ----------------------- |
| JSON             | `json`                  |
| JavaScript       | `javascript`, `js`      |
| TypeScript       | `typescript`, `ts`      |
| Shell            | `bash`, `sh`, `shell`   |
| Python           | `python`, `py`          |
| Markup           | `markup`, `html`, `xml` |
| CSS              | `css`                   |

Labels are case-insensitive. JSX, TSX, JSON5, and other unlisted labels remain plain. Markup-like code renders as passive text and spans, not document HTML. Inline code and unlabelled indented blocks stay plain.

The small Refractor core bundle imports only these grammars and their required shared grammar. Code uses live host UI tokens with weight, muted comments, and subdued string underlines. It does not select a separate syntax palette or promise to reproduce BB's VS Code code-theme document. The system monospace fallback yields to the host `--font-mono` token.

The toolbar, reading column, and optional outline respond to the actual reader width. Wide code and tables scroll locally. Images retain their aspect ratio. Live host token changes preserve Preview/Raw and outline state without another read or remount. Git snapshots, deleted-file previews, chat messages, diffs, and unrelated extensions stay with BB. BBP-32 separates fixture results, installed local-host evidence, and pending native checks.

## Compatibility and local build

The package targets BB **>=0.45** and Plugin SDK **>=0.6.15 <0.7**, with declarations pinned to **0.6.15**. Experimental host, line-range, and Original contracts can change; recheck them with a newer BB before use.

From this package directory, with Node 24.15 or newer within Node 24 and a compatible `bb` CLI:

```sh
npm ci
npm test
npm run typecheck
bb plugin types . --check
bb plugin build
```

Local installation requires operator approval. Install only this leaf package after its checks pass:

```sh
bb plugin install .
```

Before installation, record whether the reader already exists, its source/enabled state, and the opener preferences. Confirm that the receipt points to this package. Use one-off Open with for a test; do not change a persistent default opener or global theme. Do not use a Git install command for this unpublished package.

For a newly installed test reader, disable it, check BB's native fallback, then remove that exact receipt ID:

```sh
bb plugin disable <installed-id>
bb plugin remove <installed-id>
```

Keep the source directory. If a reader was already installed, restore its recorded state instead of removing it. Recheck its source before rollback and stop if another person changed it. Selecting BB under File openers is a separate, explicit preference action. This plugin registers no settings, CLI commands, content scripts, themes, or background watchers.

## Tests and browser fixture

Source tests exercise the public source-module interface with an in-memory adapter. Rendered-reader tests use Testing Library and BB's frontend harness. Server tests check the public RPC wire schema, explicit host/root reads, and public SDK imports.

`tests/source-reader.test.tsx` also joins the registered reader to the real server RPC and source module with controlled SDK responses for all three sources. It checks read-only transport, refresh, Retry, limits, and fallback without installing the plugin.

Browser tests use native TypeScript Playwright Test **1.64.0** and owned Chromium contexts. No Python or signed-in browser is needed. From this package directory:

```sh
npm ci
npx playwright install chromium
npm run test:browser
# Target one suite or one matrix case:
npm run test:browser -- navigation.spec.ts
npm run test:browser -- presentation.spec.ts --grep 'presentation 760-light$'
# The former UI --reproduce case:
npm run test:browser -- ui.spec.ts --grep '760-light$'
```

Playwright starts and stops Vite on `http://127.0.0.1:4187`, waits for HTTP readiness, and serves the latest local TSX and CSS. That port must be free. It does not reuse an existing server. Each test has a new browser context. Remote images are routed to synthetic PNGs, and unexpected non-local HTTP traffic is blocked and fails the test. There are no live host reads, real native navigation calls, or BB installation steps.

`npm test` remains the primary Vitest suite. Its `tests/**/*.test.{ts,tsx}` include does not collect the browser `tests/browser/*.spec.ts` files. `npm run typecheck` checks both suites.

### Coverage mapping

All six Python runners are replaced. The 42 browser cases retain their assertions and fixture inputs:

| Former runner                         | TypeScript replacement               | Cases and retained checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/browser-check.py`              | `tests/browser/reader.spec.ts`       | 3 panels: 760/light, 390/dark, 1440/custom. Bounded prose and toolbar geometry, font sizes, inert links/images, local code/table overflow, exact Raw, live token color changes, adjacent styles, keyboard view activation and visible focus, absent ready-state Original, no browser errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `tests/browser-destination-check.py`  | `tests/browser/destination.spec.ts`  | 9 cases: workspace, host and thread-storage at 1440/light, 760/light and 390/dark. Source-aware synthetic FileLink/UrlLink callbacks, rejected script/root-escape/SVG destinations, reader-local heading and footnote focus without hash changes or reopening, exact Raw, bounded image sizing, confined GET denial fallback, one image lease across view changes, a new lease/URL on same-hash refresh, no referrer, routed remote GET, no outside/SVG requests, unmount, no browser errors.                                                                                                                                                                                                                                                                |
| `tests/browser-navigation-check.py`   | `tests/browser/navigation.spec.ts`   | 9 cases: three panel/theme cases plus dynamic resize, heading-free, independent readers, initial line request, and footnotes with/without an actual heading. Exact 164 px aside and 944 px layout/60 px gap, closed narrow disclosure and keyboard focus, repeated/non-ASCII local fragments, modified/middle clicks without a new page or hash, inert file/image destinations, reclaimed outline space, stable heading IDs, exact CRLF Raw and line 18 text, wrapping/highlighting/focus/reveal, repeated identical props without DOM replacement, reversed/clamped range, one read, reader-local scroll and unique IDs, footnote links/hidden label/accessibility references, no browser errors.                                                           |
| `tests/browser-presentation-check.py` | `tests/browser/presentation.spec.ts` | 9 cases: 390/760/1440 panels in light/dark, 760/custom, narrow-in-wide, and heading-free. Centered/bounded layout, typography/section spacing, filename truncation, button bounds, local code/table overflow, image aspect ratio, heading/table counts, exact JSON fence text and passive markup, body/token contrast at least 4.5, custom token colors/radius, live theme/width/view/outline state and DOM identity, exact Raw, full keyboard focus/activation order, local heading/footnote/return navigation and horizontal scrolling, one read/no native calls, adjacent styles, bounded runtime/console/request diagnostics and response counts.                                                                                                        |
| `tests/browser-refresh-check.py`      | `tests/browser/refresh.spec.ts`      | 1 case. Retained Preview, stale alert and unchanged Raw after failed refresh/Retry, no panel overflow, bound Original fallback, no browser errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `tests/browser-ui-check.py`           | `tests/browser/ui.spec.ts`           | 11 cases: 390/760/1440 panels in light/dark, narrow-in-wide, 200% CSS zoom, 390/light and 390/dark with coarse-pointer emulation, and 320/custom with coarse-pointer emulation. Host CSS list reset, ordinary/nested markers and indent, ordered starts 7/12, generated footnotes, mixed disabled tasks, outside reset sentinel, no panel/document overflow, accessible full path/title, filename hierarchy, header groups and row alignment, selected Outline fill, decorative masked icons, empty button text with accessible names, compact header height, exact 28/36 px targets, keyboard Raw/Outline/Refresh activation, exact Raw and refresh reads, tooltip labels/bounds/hover retention, Escape dismissal without moving focus, no browser errors. |

### Evidence and limits

Each run writes an aggregate JSON report at `test-results/results.json` and an HTML report at `playwright-report/index.html`. Each case attaches JSON results. Captures and SHA-256 identities retain all 46 original success screenshots, including the presentation top/code pairs and eight UI captures, and add the 320 px custom and 390 px light/dark coarse-pointer captures for 49 success screenshots. Presentation results include geometry, measured contrast, live contrasts, focus proof, adjacent styles, and bounded browser diagnostics. Failed tests retain a screenshot and trace in `test-results/`. Both output directories are ignored by Git and replaced by the next run. Open the report with `npx playwright show-report`.

The fixtures reuse the existing HTML/TSX pages and the same Reader and MarkdownDocument modules. Navigation uses the committed CRLF source and the `fixture-line-request` event to change public reader props only. Destination and presentation pages use the public SDK registered-app test runtime with synthetic RPC responses, navigation callbacks, image GETs, and confined GET denial. These are local fixture tests, **not installed BB acceptance**. They do not prove real host confinement, live BB routing, extension preference selection, host fonts, or native theme behavior. Default-token contrast is a controlled check, not certification of all palettes. See [token provenance and limits](tests/fixtures/theme-tokens.md).
