# Markdown Reader

A read-only file opener for live workspace `.md` and `.markdown` files. It uses a centered prose column, generous spacing, plain code, and quiet tables. BB keeps its own tabs and file-opening preferences.

This package is the first reader delivery for BBP-27. It is not published or installed by this change.

## Use

After an explicit installation, select Markdown Reader with BB's one-off **Open with** choice or under **File openers**. Keep BB selected there if you prefer its built-in preview. This plugin does not change those preferences.

- Preview renders ordinary Markdown and GFM, including tables, read-only task lists, quotes, and fenced code.
- Raw shows the complete loaded text, including frontmatter, line endings, and code spaces. It is not an editor. Switching views does not read or write the file.
- Refresh reads the current file again. There is no automatic file watching. An unsuccessful refresh removes the previous document and shows an error with Retry.
- Open in BB preview renders BB's `Original` component, already bound to this file. It does not open the file again through plugin selection.

The toolbar stays within the reader and wraps when the panel is narrow. Keyboard users can reach its buttons with Tab and activate them with Enter or Space. Code and tables have their own scroll regions. Appearance follows the active host tokens, not a reader theme switch.

## Supported sources and limits

Workspace targets use the supplied environment, project, and optional host identity. Thread-backed targets resolve the thread's workspace identity. The source module reads through `bb.sdk.files.read` with an explicit `hostId`, absolute `path`, and confined `rootPath`. It never reads the server's filesystem directly and never writes document data.

A missing, ambiguous, inconsistent, or unready workspace identity shows an error rather than a server-local substitute. The SDK enforces root confinement, including resolved symlinks. Workspace paths must be relative Markdown paths. Absolute paths, parent traversal, percent encoding, backslashes, control characters, and colons are not accepted in this first version. Windows workspace roots use Windows path semantics on the selected host.

The reader accepts UTF-8 text up to **1 MiB**, including empty files. Binary encoding and non-text control characters are unsupported. Larger or non-text files show an explanation and the bound BB preview action. The current SDK has no stat or byte-limited read option. It can transfer a larger file to the server before this plugin rejects it, but rejected content is not sent to the reader or parsed as Markdown.

Raw HTML does not become active DOM. MDX, scripts, and embedded HTML widgets do not execute. All Markdown links, including fragments and external URLs, remain inert. Images show only their alt text and make no network requests. Task checkboxes remain disabled. No report-specific badges, dates, or other metadata are inferred.

Host and thread-storage expansion, heading outlines, requested source-line navigation, safe link/image activation, syntax highlighting, and the final visual matrix belong to later tickets. This version renders all fenced languages as plain code without guessing a language or formatting JSON. Git snapshots, deleted-file previews, chat messages, diffs, and unrelated file extensions stay with BB.

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

For a representative fixture without installing the plugin:

```sh
npm run preview:fixture -- --port 4173
# In another shell, with uvx available:
uvx --with playwright python -m playwright install chromium
uvx --with playwright python tests/browser-check.py --url http://127.0.0.1:4173 --out /tmp/bbp-27-browser
```

The fixture uses the same Reader and MarkdownDocument modules with a fixed loaded source and illustrative host tokens. It does not prove live BB routing, extension preference selection, or built-in theme contrast. See [ACCEPTANCE.md](ACCEPTANCE.md) for evidence and limits.
