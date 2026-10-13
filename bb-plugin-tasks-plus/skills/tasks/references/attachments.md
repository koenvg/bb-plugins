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
