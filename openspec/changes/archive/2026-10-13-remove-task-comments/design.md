# Design

## Context

See `proposal.md` for motivation and scope. The user confirmed full removal rather than hiding controls.

Observed implementation:
- `db/schema.ts` has a versioned migration array. `comments` owns text, author, thread and notification metadata. `attachments` has mutually exclusive `task_id` and `comment_id` ownership, a foreign key to comments, and an owner constraint.
- `db/store.ts` prepares comment statements at startup and writes unblocked comments during task updates. It also serves comment attachment reads. Removing only UI code would leave both storage and automatic writes active.
- `shared/contract.ts` exposes `createComment`, `listComments`, `getTaskActivity`, comment-owner attachment inputs and comment event/types. `api/index.ts` supplies rendering metadata and publishes `comments:changed`.
- `cli/comments.ts` registers posting and optional notification. `cli/tasks.ts` fetches comments for both text and JSON task detail output. `steer/index.ts` routes notification to the latest replying agent.
- `delegate/index.ts` writes dispatch/status comments; `lifecycle/index.ts` writes terminal-thread comments. Those modules also update task state, links and realtime thread state, which remain necessary.
- `views/detail/index.tsx` mounts `TaskActivity` and binds the comment-focus shortcut. `views/activity` owns history, drafts, composer, author presentation, and deferred loading. Existing detail/session and shell tests guard autosave and native-pane retention.
- `scripts/import-bundled-data.sh` copies the bundled database and blobs and rewrites attachment links in comment bodies. Benchmarks and reporting tests include comment fixtures.

Current specs promise comment preservation, comment reporting, and unblocked comments. The seven delta specs supersede those promises. Unrelated PR comments and browser annotations remain supported.

## Goals / Non-Goals

**Goals:** Remove the feature by deleting its runtime paths and simplifying retained interfaces. Make fresh databases and upgraded databases converge on a comment-free active schema. Preserve non-comment records and files.

**Non-Goals:** No preference toggle, soft archive, comment compatibility layer, replacement task timeline, new reporting command, or synthesized task report field. Do not clear native conversation history, historical Orchestrator compatibility records, stored user presets, or already delivered worker instructions.

## Decisions

### 1. Remove contracts, not just controls

Delete comment RPC registrations and schemas, comment CLI registration, activity reads and events, store CRUD/read helpers, and notification-only steering. Task `show` returns no comments field or Comments section, not an always-empty legacy shape. Remove comment selectors from all attachment list, upload and delete interfaces. Old calls fail through normal unknown-command/RPC or input-validation behavior without side effects.

A hidden UI or disabled setting would keep maintenance costs and permit agent posting. A stub API would imply that the feature still exists. Neither matches full removal.

### 2. Append a migration and preserve attachment identity

Keep earlier migration SQL and recorded versions unchanged. Append a transaction that converts each comment-owned attachment to the owning comment's task, then rebuilds the attachments table with required task-only ownership and retained metadata/indexes. Preserve attachment IDs, blob paths, download URLs, file content and timestamps. Drop the comments table and its indexes after no active foreign key refers to it. Run the migration before preparing the store's retained statements.

Comment text and author/notification metadata are deleted, not copied into descriptions or reports. Reparenting files avoids cascading file loss and removes comment ownership entirely. Deleting all comment attachments was considered but would discard useful files beyond the comment feature. Keeping the old table dormant was rejected because the user asked to remove everything.

Use existing SQLite migration transaction semantics and verify foreign keys and integrity. Historical Orchestrator tables remain inactive and have no comment foreign key. The legacy fixture stores a comment ID inside report JSON. Preserve that inert JSON as historical evidence without resolving the removed ID or rewriting the report. Fresh installations run the same migration sequence and end without active comment storage. This is removal from the active database, not a promise to erase backups or previously delivered messages.

### 3. Keep state transitions without activity writes

Remove system-comment helpers and calls from store updates, API actions, delegation and lifecycle transitions. Keep blocker calculation, task status changes, thread attachment, live status reconciliation and necessary task/thread realtime publications. A terminal worker updates its thread card, not the task's completion status. No removed path sends input or resumes an agent. Already accepted native input is not canceled by the upgrade.

A replacement event log would recreate the unwanted feed, so there is none.

### 4. Remove activity UI and retain independent attachment controls

Delete `TaskActivity`, comment drafts, author-only presentation and composer logic, plus `detail.comment` and its `m` help entry. Remove associated subscriptions, activation controls, loading/error states and any comment-only editor options with no retained callers. Keep shared provider rendering if live thread cards still use it.

Description editing, task attachment upload/list/removal, subtasks, dependencies, delegation, thread cards, native Ticket placement and thread-side Task embeds remain. Do not remove session save barriers just because comment drafts disappear. Preserve shared staged-file controls used by task creation and retained task file uploads; do not add a new staged-file session to task detail. Tests that currently use comment drafts to prove pane retention must use description/title drafts or saved task attachments instead, with the same safety assertions.

### 5. Keep useful reports in existing work threads

Update new delegated-worker guidance and bundled Tasks references to place review readiness, completion, failure, blockers and user decisions in the linked work thread. Keep evidence links, check outcomes, material limits, independent verification distinctions and review/status gates. Do not require a comment or a new posting command. Read-only task mentions remain neutral and do not grant notification or dispatch authority.

Leave stored custom presets and running provider sessions unchanged. Old delivered comment instructions cannot work after removal; document that compatibility break rather than retain a command alias. Native conversation reporting is enough and does not need a replacement task abstraction.

### 6. Import legacy data through the same schema boundary

Keep the documented bundled-data backup/copy procedure and refusal to overwrite a populated fork. Stop rewriting comment bodies. Rewrite retained task-description attachment links as before. The imported legacy database must pass the new migration before serving task reads; only then is it usable in the fork. Its comment files become task files, with IDs and blob copies preserved. Do not mutate the bundled source database or its plugin storage.

Update demo seeds, API/CLI snapshots, attachment ownership fixtures and navigation benchmarks to the comment-free contract. Reconcile in-flight command, Markdown-preview and navigation proposals at implementation time if those changes have landed. Do not retain code solely to support old benchmark fixtures.

## Risks / Trade-offs

- Stored task comment text is lost on upgrade. Document this break and require a recoverable pre-upgrade database/blob backup in the deployment procedure. Rollback needs that backup.
- Rebuilding attachments can break ownership or trigger cascades. Test a populated legacy database, stable IDs/URLs/blob paths, cross-task isolation, foreign keys, migration atomicity and repeated startup.
- Broad removal can cut state publications or safety barriers. Preserve public integration checks for dependency updates, delegation, thread terminal state, task attachments, autosave failures, selection and native-pane retention.
- Previous clients and running workers can still attempt old calls. Deploy frontend and server together; reject old operations without writing, uploading or notifying. Do not claim existing queued native work was canceled.
- Existing reporting documentation and in-flight plans can restore removed assumptions. Update installed guidance and current fixtures; note related plan conflicts in the implementation handoff. No edits to other pending proposals are part of this change.

## Migration Plan

1. Implement and test removal without changing historical migration entries. Prove both fresh initialization and upgrade from pre-removal data, including imported bundled data and inactive Orchestrator history.
2. Run plugin tests, typecheck, lint, formatting checks and build. Verify the public CLI/RPC contracts and installed UI in BB, including native Ticket and thread-side Task views.
3. Before deploying, stop use of the old plugin frontend and take a consistent backup of the Tasks database and attachment storage. State that comments will be permanently removed from the active tracker.
4. Deploy matching server/frontend artifacts. Start the plugin, let the forward migration complete, and confirm retained task data, files, worker cards and comment-free interfaces.
5. For rollback, stop the new version, restore the pre-upgrade database and blobs, and deploy the prior matching package. Do not run the old package against the new comment-free schema. Work created after the backup is outside that recovery snapshot.
