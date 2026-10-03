# Markdown Reader

A read-only file opener for live workspace, absolute-host, and thread-storage `.md` and `.markdown` files. It uses a centered prose column, generous spacing, plain code, and quiet tables. BB keeps its own tabs and file-opening preferences.

This package includes BBP-27 through BBP-30. It is not published or installed by this change.

## Use

After an explicit installation, select Markdown Reader with BB's one-off **Open with** choice or under **File openers**. Keep BB selected there if you prefer its built-in preview. This plugin does not change those preferences.

- Preview renders ordinary Markdown and GFM, including tables, read-only task lists, quotes, and fenced code.
- Raw shows the complete loaded text, including frontmatter, line endings, and code spaces. It is not an editor. Switching views does not read or write the file.
- Refresh reads the current file again and updates both views. There is no automatic file watching. During refresh, the reader labels retained content as not verified current. If refresh fails, it reports the failure and marks the retained snapshot stale. Retry reads the source again and clears that label only after success.
- Open in BB preview renders BB's `Original` component, already bound to this file. It does not open the file again through plugin selection.

## Heading and line navigation

Outline lists only headings from the rendered Markdown parse. It keeps heading levels and visible inline text, including code and link text. Repeated headings have distinct GitHub-style fragment names, such as `#section` and `#section-1`. Non-ASCII names are supported, including percent-encoded fragments. Every mounted reader has separate DOM targets. Outline entries and known fragment links scroll and focus the heading in that reader without opening the file again. Missing or malformed fragments remain inert. Footnote references and return links scroll and focus targets within the same reader. Their accessibility references stay reader-local. The parser's hidden footnote label is not a source heading and does not create an outline entry.

Above 1080 px of reader width, Outline shows a 164 px aside beside the bounded prose column. Narrower readers use a closed **On this page** disclosure. Use Outline to hide it and return space to the document. Heading-free documents have no outline or toggle. The layout measures the reader panel, not the browser window.

BB's `experimental_lineRange` uses inclusive, one-based `startLineNumber` and `endLineNumber` values. A request selects Raw, highlights real source lines, and reveals the start after loading. A new request object with the same values reveals again without a new read or model replacement. Line-only changes do not reload the source. You can still select Preview or Raw manually.

Reversed integer bounds are put in order and clamped to existing lines. Invalid, fractional, non-finite, or unsafe integer bounds do not highlight lines. Empty text has nothing to highlight. Removing the request clears its highlight, not the manual view choice. Raw wraps long lines but keeps one target per source line, including the empty line after a final newline. CRLF, frontmatter, Unicode, and code spaces stay unchanged. Navigation never writes the file.

The toolbar stays within the reader and wraps when the panel is narrow. Keyboard users can reach its buttons with Tab and activate them with Enter or Space. Code and tables have their own scroll regions. Appearance follows the active host tokens, not a reader theme switch.

## Supported sources and limits

All supported files use the same Preview/Raw reader and read-only `read_document` RPC. The source module validates the opener target, then uses `bb.sdk.files.read` with an explicit `hostId`, absolute `path`, and confined `rootPath`. The browser cannot supply an arbitrary root or a separate filesystem command. No server-local filesystem access or document writes occur.

- Workspace files use a relative path and the supplied environment or project source. Thread-backed targets resolve the actual thread's workspace identity. Project sources select the explicit host, or the unique default source when no host is supplied.
- Absolute-host files use the explicit opener host or the host of the supplied environment. A thread-only host target resolves the thread's actual environment first. Without an explicit host or environment identity, the read fails rather than using the server host. The permitted root is the file's containing directory, not the workspace root or host filesystem root.
- Thread-storage files require the actual storage thread ID. `threads.storageLocation({ threadId })` supplies the host and storage root. The plugin does not construct a storage path from a server data directory or substitute the workspace root.

Supplied thread, project, environment, and host identities must agree with their resolved source. Missing, inconsistent, ambiguous, or unready workspace identity shows an actionable error. Missing files, access failures, and disconnected hosts offer Retry and the bound BB preview. The SDK enforces root confinement, including resolved symlinks, on the selected host. A rejected read does not retry on another host.

Relative workspace/storage paths must be literal Markdown paths. Parent/dot traversal, percent encoding, backslashes, control characters, and colons are not accepted. Host paths must be absolute POSIX, Windows drive, or UNC file paths. Device paths, traversal, encoded paths, and Windows alternate data streams are rejected. Windows roots and files use Windows path semantics even when the server uses a different OS.

The reader accepts complete UTF-8 text up to **1 MiB**, including empty files. Preview reports an empty file; Raw preserves its empty source. Binary or invalid UTF-8 encoding and non-text control characters have explicit unsupported states. Larger or unsupported files offer the bound BB preview and are never returned to the reader for parsing. The current SDK has no stat or byte-limited read option. It can transfer a larger file to the server before this plugin rejects it. The 1 MiB limit bounds reader content, not SDK transfer.

## Links and images

Safe relative file links use BB's public source-aware FileLink. Siblings and literal parents inside the selected root are permitted. Host files cannot escape their containing-directory root. Unsafe schemes, malformed URLs/encodings, encoded traversal, and lexical root escapes stay readable without active href/src or content/navigation effects. Same-document heading and footnote fragments stay within the reader. Cross-file heading fragments are inert because the SDK has no heading-fragment opening location. Project-only workspaces without an environment remain readable, but native links need an environment.

Native local-file navigation uses normal BB opening behavior. It has **no extra plugin guarantee that a final symlink target stays inside the reader root**. Reader reads and local-image content requests do retain SDK root and symlink confinement on the actual source host. An attempted confined operation and a root-preview lease before asset validation are permitted. Outside-root content must not be delivered by the SDK.

External HTTP(S) links use BB's opening preferences through UrlLink. Remote images are ordinary browser network images, not authenticated BB proxies. They send no referrer, but the remote site can see the request and may receive its own browser cookies. No data/file/javascript/mail links are activated. Raw document HTML, MDX, scripts, and embedded widgets do not execute. Task checkboxes remain disabled. No report-specific metadata is inferred.

Local raster images support PNG, JPEG, GIF, WebP, AVIF, BMP, and ICO. SVG, HTML, PDF, and TIFF image destinations are inert. Local images share one source/root preview lease per loaded snapshot, with a 60-second TTL. At most 128 distinct destination requests and 32 distinct images are resolved per snapshot. URLs longer than 4096 characters stay individually inert; other valid destinations still work. Encoded path separators and nested path encodings are rejected for both local and external destinations. Image URLs carry an opaque lease, never a raw host/root path. Expiry or a failed asset request leaves readable alt/error text. Refresh renews transport even when text and hash do not change. View changes do not allocate another lease. Refresh, source switching, Original, and unmount remove stale image sources and discard late results. The SDK has no revocation API; abandoned leases expire.

Syntax highlighting and the final visual matrix belong to later tickets. Fenced code stays plain, with no guessed language or JSON formatting. Git snapshots, deleted-file previews, chat messages, diffs, and unrelated extensions stay with BB.

## Compatibility and local build

Verified against BB Plugin SDK **0.5.29** and the current BB build command. The manifest requires BB **>=0.44** and SDK **>=0.5.29 <0.6**. Experimental host, line-range, and Original contracts can change; recheck them with a newer BB before use.

From this package directory, with Node 24.15 or newer within Node 24 and a compatible `bb` CLI:

```sh
npm ci
npm test
npm run typecheck
bb plugin types . --check
bb plugin build
```

A local installation is a separate operator action, not part of these checks:

```sh
bb plugin install .
```

Do not use a Git install command until the package has been published on the selected branch. Disable/remove the plugin or select BB under File openers to restore BB's built-in behavior. No settings, CLI commands, content scripts, themes, or background watchers are registered.

## Tests and browser fixture

Source tests exercise the public source-module interface with an in-memory adapter. Rendered-reader tests use Testing Library and BB's frontend harness. Server tests check the public RPC wire schema, explicit host/root reads, and public SDK imports.

`tests/source-reader.test.tsx` also joins the registered reader to the real server RPC and source module with controlled SDK responses for all three sources. It checks read-only transport, refresh, Retry, limits, and fallback without installing the plugin.

For a representative fixture without installing the plugin:

```sh
npm run preview:fixture -- --port 4173
# In another shell, with uvx available:
uvx --with playwright python -m playwright install chromium
uvx --with playwright python tests/browser-check.py --url http://127.0.0.1:4173 --out /tmp/bbp-27-browser
```

To check the retained stale state, run `uvx --with playwright python tests/browser-refresh-check.py --url http://127.0.0.1:4173 --out /tmp/bbp-28-browser`. The fixture's `?refresh=error` mode keeps the real reader controls and simulates a disconnected read after initial loading.

For heading/Raw navigation, run `uvx --with playwright python tests/browser-navigation-check.py --url http://127.0.0.1:4173 --out /tmp/bbp-29-browser`. Its `?document=navigation` mode uses the committed CRLF source fixture. It checks local fragments, independent readers, panel resizing, keyboard disclosure/focus, exact Raw, wrapped lines, and repeated line props. `?start=18&end=18` checks an initial line target. The `fixture-line-request` event only changes public reader props in this test page.

For destinations, run `uv run --offline --with playwright python tests/browser-destination-check.py --url http://127.0.0.1:4173 --out /tmp/bbp-30-browser`. The page at `/tests/destination-preview.html` uses the real registered reader and public SDK frontend test runtime. Its RPC responses, native navigation callbacks, successful image GETs, and confined GET denial are fixtures, not live BB/host proof.
The fixture uses the same Reader and MarkdownDocument modules with a fixed loaded source and illustrative host tokens. It does not prove live BB routing, extension preference selection, or built-in theme contrast. See [ACCEPTANCE.md](ACCEPTANCE.md) for evidence and limits.
