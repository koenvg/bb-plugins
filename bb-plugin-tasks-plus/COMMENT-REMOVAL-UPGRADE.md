# Comment-free Tasks upgrade

Migration 12 permanently deletes task comment text, authors and notification metadata from the active database. It moves comment-owned files to their task before removing the old ownership field. File IDs, bytes, names, MIME types, sizes, timestamps, blob paths and existing fork download URLs stay unchanged.

## Prepare

Do not enable this build against live data without explicit operator approval.

1. Stop use of the old frontend and disable Tasks Plus. Stop any process that can write its database or attachment files. Keep running native worker threads unchanged.
2. Take a consistent pre-upgrade copy of the entire Tasks Plus data directory, including `data.db` and all blob directories. With writers stopped, retain any SQLite WAL/SHM sidecars in the same backup. Record the prior matching server/frontend package and the data-directory path. Verify the backup can be restored.
3. Test on a disposable copy. Check tasks, keys, labels, dependencies, presets, worker links and files before and after startup. Check `PRAGMA integrity_check` and `PRAGMA foreign_key_check`. The automated legacy fixtures cover populated upgrade, startup repetition and rollback after an injected final-version failure.

## Upgrade

Deploy matching server and frontend artifacts together. No old-client compatibility alias is provided. Start Tasks Plus and let its transaction finish before task reads.

Confirm migration 12 is recorded, the comments table and attachment `comment_id` field are absent, retained task data and files still work, and workers retain their links and live state. The frontend has no Activity section, composer, comment draft or `m` action. Task shows have no comments field.

Old `bb tasks comment`, comment/activity RPCs and comment-owner upload/list/delete calls fail without mutation or notification. Existing custom presets and already delivered worker prompts are not rewritten. Update those presets manually if needed. New worker guidance reports outcomes and questions in the existing linked work thread, with the same status/review gates.

## Read migrated files

Former comment files appear in their task's attachment grid, not on comment cards. Their saved IDs, filenames, metadata, and existing downloads remain unchanged. No comment draft or composer is restored. Unsaved staged files have no saved-ID preview until task creation and successful upload.

Saved `.md` and `.markdown` files use the existing read-only task dialog, with case-insensitive filenames and generic MIME support. **Preview** and exact **Raw** share one loaded snapshot. **Download** uses the same saved ID and original bytes, even after a preview failure. Recoverable failures offer **Retry**.

The task keeps its current title and description edits, editor instance, route, scroll, status, and priority while the dialog opens, switches views, and closes. Normal autosaves continue. **Close** and Escape return focus to the connected file card or **Attach file**. A newer overlay keeps focus. Close, replacement, Retry, task changes, unmount, and confirmed deletion invalidate older reads. Deletion pending or failure alone does not close a concurrently opened preview. Failed deletion reports an error and keeps the file usable.

BBP-54 verifies this task-file behavior under the approved replacement scope. Its browser Download check clicks the production dialog link and receives original fixture bytes from the local Vite HTTP fixture. This is not installed acceptance. The API migration test checks the real saved-ID preview and download routes against a disposable legacy database and original blob bytes.

## Import bundled data

Use `scripts/import-bundled-data.sh` while the fork is disabled. It backs up the source database to a temporary copy, rewrites retained description download links and applies the same forward migration before publishing the imported database. It copies blobs without changing the bundled source and refuses a populated target. Node 26.0 or newer within Node 26, package dependencies and SQLite CLI are required.

Imported comment text is deleted from the copy, not the source. Files retain IDs and metadata and become task files. Bundled download routes in descriptions become Tasks Plus routes.

## Roll back

Stop the new plugin. Restore the consistent pre-upgrade database and blob backup, then restore the prior matching server/frontend package. Never run the old package against the new task-only schema. There is no reverse migration or in-product comment archive. Work created after the backup is outside that recovery snapshot. Native thread messages and old backups are not erased by this migration.

## Pending plans

The checkout already includes standalone/native Ticket editing, lightweight task previews, demand-loaded relationships and navigation qualification tooling. Removal keeps their retained behavior and removes the landed Activity requests and comment key.

The pending `task-detail-commands`, `task-markdown-preview` and `tasks-navigation-performance` plans still refer to comments or activity. Implement them against this comment-free contract: no comment command, comment-card preview or activity loading may return. Their proposals have not been edited.
