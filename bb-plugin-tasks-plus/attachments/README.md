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
