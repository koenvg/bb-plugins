# Markdown Reader

A live Markdown file opener for workspace, absolute-host, and thread-storage files. BB supplies the source identity, chooses the opener, and owns the file tab. The plugin reads through the public SDK and shows read-only Preview and exact Raw views.

## Registered behavior

- One file opener for `md` and `markdown`.
- One validated, read-only RPC method, `read_document`.
- No chat, diff, Git-snapshot, or source-code renderer replacement.
- No theme, content script, settings, CLI command, watcher, or preference mutation.

## Module boundaries

`source.ts` exposes `SourceReader.read` and a narrow `SourceAdapter`. It owns target validation, all three source identities, host/root confinement, text limits, and snapshots with hash and document-directory data. `server.ts` connects the adapter to the verified SDK and registers the wire schema. Future safe destinations can use this identity/root data without adding source-specific branches to the view.

`reader.tsx` accepts a target, one read operation, and BB's bound Original component. It owns load state, explicit refresh, view choice, and fallback. Retained snapshots are unverified during refresh and explicitly stale on failure. A source identity change remounts the reader. Superseded reads, fallback, and unmount discard late results. `document.tsx` only renders loaded text. Links and images remain inert.

`app.tsx` registers the live-file opener. `app.css` uses reader-scoped host tokens and container width. Tests use these public source and rendered-reader interfaces, not private path or parser helpers.

## Operating constraints

UTF-8 text up to 1 MiB is supported across all three sources. Unsupported content offers BB preview. The SDK may transfer an oversized file to the server before rejection; the reader never receives it. Absolute-host reads are confined to the containing directory. Workspace and storage reads use their resolved source root. All code remains plain text. Raw HTML is inactive. No source writes or automatic watching occur. See [README.md](README.md) for selection, installation, checks, and deferred behavior.
