# Markdown Reader

A read-only file opener for live workspace, absolute-host, and thread-storage `.md` and `.markdown` files. It uses a centered prose column, generous spacing, plain code, and quiet tables. BB keeps its own tabs and file-opening preferences.

This package includes BBP-27 and BBP-28. It is not published or installed by this change.

## Use

After an explicit installation, select Markdown Reader with BB's one-off **Open with** choice or under **File openers**. Keep BB selected there if you prefer its built-in preview. This plugin does not change those preferences.

- Preview renders ordinary Markdown and GFM, including tables, read-only task lists, quotes, and fenced code.
- Raw shows the complete loaded text, including frontmatter, line endings, and code spaces. It is not an editor. Switching views does not read or write the file.
- Refresh reads the current file again and updates both views. There is no automatic file watching. During refresh, the reader labels retained content as not verified current. If refresh fails, it reports the failure and marks the retained snapshot stale. Retry reads the source again and clears that label only after success.
- Open in BB preview renders BB's `Original` component, already bound to this file. It does not open the file again through plugin selection.

The toolbar stays within the reader and wraps when the panel is narrow. Keyboard users can reach its buttons with Tab and activate them with Enter or Space. Code and tables have their own scroll regions. Appearance follows the active host tokens, not a reader theme switch.

## Supported sources and limits

All supported files use the same Preview/Raw reader and read-only `read_document` RPC. The source module validates the opener target, then uses `bb.sdk.files.read` with an explicit `hostId`, absolute `path`, and confined `rootPath`. The browser cannot supply an arbitrary root or a separate filesystem command. No server-local filesystem access or document writes occur.

- Workspace files use a relative path and the supplied environment or project source. Thread-backed targets resolve the actual thread's workspace identity. Project sources select the explicit host, or the unique default source when no host is supplied.
- Absolute-host files use the explicit opener host or the host of the supplied environment. A thread-only host target resolves the thread's actual environment first. Without an explicit host or environment identity, the read fails rather than using the server host. The permitted root is the file's containing directory, not the workspace root or host filesystem root.
- Thread-storage files require the actual storage thread ID. `threads.storageLocation({ threadId })` supplies the host and storage root. The plugin does not construct a storage path from a server data directory or substitute the workspace root.

Supplied thread, project, environment, and host identities must agree with their resolved source. Missing, inconsistent, ambiguous, or unready workspace identity shows an actionable error. Missing files, access failures, and disconnected hosts offer Retry and the bound BB preview. The SDK enforces root confinement, including resolved symlinks, on the selected host. A rejected read does not retry on another host.

Relative workspace/storage paths must be literal Markdown paths. Parent/dot traversal, percent encoding, backslashes, control characters, and colons are not accepted. Host paths must be absolute POSIX, Windows drive, or UNC file paths. Device paths, traversal, encoded paths, and Windows alternate data streams are rejected. Windows roots and files use Windows path semantics even when the server uses a different OS.

The reader accepts complete UTF-8 text up to **1 MiB**, including empty files. Preview reports an empty file; Raw preserves its empty source. Binary or invalid UTF-8 encoding and non-text control characters have explicit unsupported states. Larger or unsupported files offer the bound BB preview and are never returned to the reader for parsing. The current SDK has no stat or byte-limited read option. It can transfer a larger file to the server before this plugin rejects it. The 1 MiB limit bounds reader content, not SDK transfer.

Raw HTML does not become active DOM. MDX, scripts, and embedded HTML widgets do not execute. All Markdown links, including fragments and external URLs, remain inert. Images show only their alt text and make no network requests. Task checkboxes remain disabled. No report-specific badges, dates, or other metadata are inferred.

Heading outlines, requested source-line navigation, safe link/image activation, syntax highlighting, and the final visual matrix belong to later tickets. This version renders all fenced languages as plain code without guessing a language or formatting JSON. Git snapshots, deleted-file previews, chat messages, diffs, and unrelated file extensions stay with BB.

## Compatibility and local build

Verified against BB Plugin SDK **0.5.29** and the current BB build command. The manifest requires BB **>=0.44** and SDK **>=0.5.29 <0.6**. Experimental host and Original contracts can change; recheck them with a newer BB before use.

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

The fixture uses the same Reader and MarkdownDocument modules with a fixed loaded source and illustrative host tokens. It does not prove live BB routing, extension preference selection, or built-in theme contrast. See [ACCEPTANCE.md](ACCEPTANCE.md) for evidence and limits.
