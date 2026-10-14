# Task attachment HTTP surface

Attachment upload uses a raw request body at
`POST /api/v1/plugins/tasks-plus/http/attachments/upload`. Raw bytes are the
simplest supported format, but local-auth non-GET plugin routes require JSON,
so upload uses plugin-token auth. Pass the token in `x-bb-plugin-token` (or the
`token` query parameter).
Files belong to tasks only. Migration 12 reparents old comment files while retaining IDs and URLs. Comment text is permanently deleted. See [upgrade and rollback](../COMMENT-REMOVAL-UPGRADE.md) for consistent backup requirements and rollback limits.

Upload metadata uses `taskId`, `fileName` and `mime` query parameters, or `x-task-id`, `x-file-name` and `x-mime-type` headers. A task owner is required. Legacy comment fields and headers are rejected before file writes. The response
`{ attachmentId, url }`.

The returned local-auth frontend URL is
`GET /api/v1/plugins/tasks-plus/http/attachments/download?attachmentId=...`.
Deletion is
`DELETE /api/v1/plugins/tasks-plus/http/attachments/delete?attachmentId=...` and,
because it is a local-auth non-GET request, must use `Content-Type:
application/json`.

## Saved-ID Markdown preview

`GET /api/v1/plugins/tasks-plus/http/attachments/preview?attachmentId=...` explicitly uses the SDK local authentication boundary. It accepts one saved ID of at most 128 ASCII letters, digits, underscores, or hyphens. It rejects extra query parameters, duplicate IDs, paths, and source URLs. Current server metadata determines filename eligibility. `.md` and `.markdown` are case-insensitive; images take priority. MIME need not be Markdown.

The route uses the existing confined blob lookup. Confinement is lexical, not a symlink guarantee. One descriptor supplies actual pre-read and post-read size checks. The read loop consumes at most 1 MiB plus one detection byte before decoding. Exactly 1 MiB succeeds. Oversized or changing files cannot bypass the cap with understated metadata. The descriptor always closes.

Fatal UTF-8 decoding preserves BOM and CRLF. NUL and binary controls are unsupported except TAB, LF, and CR. Success returns a readonly `{ attachmentId, fileName, byteSize, text }` snapshot. Bounded error bodies have `{ error: { code } }` with `invalid-request`, `missing`, `unsupported`, `too-large`, or `failed`. Host auth failures remain distinct. No error contains filesystem paths.

The browser bounds the JSON response with an escaping allowance, then validates identity, filename, UTF-8 byte count, and text controls before passing it to the shared document interface. Tasks owns this source policy. The module denies every destination and never treats attachment storage as a document root.

Preview does not change upload, removal, CLI reads, or original download bytes, headers, and filename. Original downloads above the preview cap remain available within the unchanged 25 MiB allowance. Fake-host registered-route tests bypass authentication. They verify registration but do not prove real-host denial.
