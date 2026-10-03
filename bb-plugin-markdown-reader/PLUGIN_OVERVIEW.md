# Markdown Reader

A live workspace Markdown file opener. BB supplies the source identity, chooses the opener, and owns the file tab. The plugin reads through the public SDK and shows read-only Preview and exact Raw views.

## Registered behavior

- One file opener for `md` and `markdown`.
- One validated, read-only RPC method, `read_document`.
- No chat, diff, Git-snapshot, or source-code renderer replacement.
- No theme, content script, settings, CLI command, watcher, or preference mutation.

## Module boundaries

`source.ts` exposes `SourceReader.read` and a narrow `SourceAdapter`. It owns target validation, workspace identity, host/root confinement, text limits, and snapshots with hash and document-directory data. `server.ts` connects the adapter to the verified SDK and registers the wire schema. Host/storage routing and destination resolution can extend this boundary without adding source-specific branches to the view.

`reader.tsx` accepts a target, one read operation, and BB's bound Original component. It owns load state, explicit refresh, view choice, and fallback. A target change remounts the reader; late results cannot overwrite the new target. `document.tsx` only renders loaded text. Its links and images stay inert until typed destination handling exists.

`app.tsx` registers the live-file opener. `app.css` uses reader-scoped host tokens and container width. Tests use these public source and rendered-reader interfaces, not private path or parser helpers.

## Operating constraints

Only workspace sources and UTF-8 text up to 1 MiB are supported in this delivery. Other sources and unsupported content offer BB preview. All code remains plain text. Raw HTML is inactive. No source writes occur. See [README.md](README.md) for selection, installation, checks, and deferred behavior.
