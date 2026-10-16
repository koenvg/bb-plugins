# Task attachments

Read this file when a task needs files or image references.

## Choose the owner

Files belong to tasks. Use `bb tasks attachment add ABC-12 --file ./screenshot.png`.

Use JSON output when another command needs returned attachment data.

## Add and remove files

Use repeatable `--attach <path>` with `bb tasks create` for initial files.

List IDs with `bb tasks attachment list <key>`. Remove a file with
`bb tasks attachment remove <attachment-id>`.

The remove command deletes the row and the stored file. It rejects a referenced
file unless `--remove-references` confirms description cleanup.

## Select a machine

The invoking machine owns `--file`, `--attach`, `--out` and `--description-file` paths. In a thread, this is the thread machine.

Outside a thread, these paths use the server machine. Use
`--machine <id-or-name>` for another enrolled machine.

## Read Markdown in Tasks

Saved task cards with case-insensitive `.md` or `.markdown` filenames open a read-only dialog. Image preview takes priority. Generic MIME metadata does not prevent a valid Markdown preview.

Select **Preview** or **Raw** without a new read or write. Raw retains the exact source, including BOM and CRLF. Preview renders Markdown and GFM with bounded known-language highlighting and a plain-code fallback. Document-local headings and footnotes navigate within the dialog. HTTP(S) links use BB preferences. Remote raster images require bounded credential-free CORS and can contact their hosts. Relative file links and images stay inactive because attachments have no filesystem root. Raw HTML and MDX do not execute. See the [attachment operating guide](../../../README.md#read-markdown-task-attachments) for destination restrictions and image limits.

Preview reads the saved ID through local authentication and accepts valid UTF-8 through 1 MiB of actual bytes. Invalid encoding and binary controls are unsupported. TAB, LF, and CR are allowed. **Download** keeps the original bytes and filename and remains available on failure. The original upload and download allowance remains 25 MiB. Empty, missing, denied, unsupported, and failed reads have messages; recoverable failures offer **Retry**.

Close or Escape returns focus to the card or the stable **Attach file** control, unless a newer overlay owns focus. Task shortcuts pause while open. Reading does not change the task route, editor, draft, or workflow. Task changes and confirmed active removal close the dialog. CLI attachment operations are unchanged.
