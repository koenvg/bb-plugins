# Tasks

Use the seven delta specs for acceptance conditions and `design.md` for removal, migration and deployment decisions. Each delivery includes its tests and documentation. Before acceptance, check applicable project validation and independent review requirements. Do not deploy to a live tracker or delete its comments during implementation tests.

## 1. Deliver a comment-free data and attachment contract

- [x] 1.1 Append the forward database migration without editing prior migration entries. Reparent comment attachments, rebuild task-only attachment ownership and remove active comment storage; verify populated legacy, fresh database and repeated-startup tests preserve retained records, attachment IDs, metadata and earlier migration versions.
- [x] 1.2 Remove comment types, prepared statements, CRUD helpers and owner-based queries from the store; verify retained task CRUD, dependencies, labels, presets, thread links and task attachment reads/writes work against the migrated schema.
- [x] 1.3 Add migration failure/rollback, foreign-key and integrity checks using the real database. Verify a failed migration leaves the old data intact and inactive Orchestrator records, including inert report JSON comment IDs, remain unchanged without replay.
- [x] 1.4 Simplify public attachment contracts, HTTP ownership parsing and CLI attachment options to task-only ownership; verify uploads, downloads, removal and cross-task isolation, plus rejection of legacy comment fields/query/header/options without file side effects. Verify migrated files still download through existing URLs.
- [x] 1.5 Update attachment and data-compatibility documentation with ownership conversion, permanent comment-text deletion, backup requirements and rollback limits; verify documented inputs match tested public contracts.

## 2. Remove posting and activity access without breaking task actions

- [x] 2.1 Delete comment CLI registration, comment/activity RPC definitions and handlers, display-author lookup, comment events and notification-only steering; verify discovery omits them and old calls fail without task/file mutation, input delivery or agent resume.
- [x] 2.2 Remove comment fetches and fields from task `show`, CLI/domain adapters and JSON/text output; update API/CLI compatibility snapshots and tests to prove retained properties, blockers, blocked tasks, subtasks, files and worker links remain present.
- [x] 2.3 Remove automatic comment writes and publications from task/API actions, delegation, lifecycle and dependency resolution; verify real integration tests preserve dispatch status/link creation, readiness/badges and terminal worker-card updates without comments, replacement history or notifications.
- [x] 2.4 Preserve task/thread realtime events, task-start approval/recovery and task/thread lifecycle independence; verify completed/failed workers do not automatically complete tasks and retained historical workers are not stopped, detached, replayed or sent input by removal.
- [x] 2.5 Update CLI/API and retained workflow documentation; verify no supported example uses `bb tasks comment`, comment activity reads or comment notification and no replacement command/alias is introduced.

## 3. Deliver task details without comment controls

- [x] 3.1 Remove the Activity section, history, composer, activation/loading/error UI, comment draft provider and comment-only author/editor logic from task views and session wiring; verify standalone detail, native Ticket and thread-side Task render retained actions and no comment UI or activity request.
- [x] 3.2 Remove `detail.comment`, the `m` binding and shortcut help entry, plus any comment palette action present in the implementation checkout; verify `m` has no action, other shortcuts still work and typing/menu/modifier/focus safeguards remain intact.
- [x] 3.3 Retain description/title autosave barriers and native pane/session behavior. Replace comment-dependent safety fixtures with retained edits or saved task files; verify failed saves, late responses, project/task changes, host-tab parking/reopening, recovery placement and selection do not lose or misattribute edits.
- [x] 3.4 Verify retained task attachment controls, preview/download/removal, dependency and subtask sections, delegation, mentions and worker cards through rendered integration tests. Preserve shared task-creation staged-file components; do not introduce new task-detail staged-file behavior.
- [x] 3.5 Update detail, shell and activity documentation to the comment-free layout and remove obsolete activity-only documents/tests. Verify current navigation/editor fixtures no longer create comments or assert removed UI, while retained safety assertions still pass.

## 4. Deliver comment-free guidance, imports and fixtures

- [x] 4.1 Update delegated-worker report-back guidance and bundled Tasks skill/references to use linked-thread outcomes, checks, limits and questions; verify reporting/context integration tests keep authorization, blocker, status/review gates, full requirements, attachment manifests and authored-context budgets intact with no comment commands.
- [x] 4.2 Replace comment reporting procedures and task-record examples in README and plugin overview; verify evidence links and reported-versus-verified distinctions remain documented and stored presets/previously delivered prompts are not rewritten.
- [x] 4.3 Update bundled-data import to skip comment-body processing and require the forward migration before imported reads. Verify imported task keys, files, download links and metadata survive, source storage is unchanged and a populated target is still refused.
- [x] 4.4 Update demo seeds, attachment/context/reporting fixtures, legacy upgrade fixtures and navigation benchmarks to the new contract; verify fresh demo creation, legacy migration coverage and relevant benchmark qualification tests without retaining comment runtime helpers for fixture setup.
- [x] 4.5 Reconcile any already-landed work from `task-detail-commands`, `task-markdown-preview` and `tasks-navigation-performance` with removal. Verify no comment command, comment-card preview or activity loading returns, and document remaining pending-plan conflicts without editing unrelated proposals.

## 5. Verify the complete removal and prepare safe deployment

- [x] 5.1 Run the Tasks plugin test suite, typecheck, lint, format checks and build with package scripts; record actual commands/results and resolve failures without weakening retained safety assertions.
- [x] 5.2 Run project-required live verification in BB for standalone task detail, native Ticket, thread-side Task, keyboard help, retained editing/files/delegation and thread state. Use an isolated fixture tracker rather than live comment data; record evidence and any verification limits.
- [x] 5.3 Audit current runtime code and installed guidance for comment entrypoints, storage access, events and posting instructions; verify remaining references are only historical migration/compatibility data, explicit removal tests, or unrelated PR/browser comments.
- [x] 5.4 Obtain the required fresh independent implementation review, address findings and record review evidence before completion. Verify all data-loss, unavailable-operation and retained-workflow requirements remain covered.
- [x] 5.5 Deliver release/upgrade instructions for paired server/frontend deployment, a consistent pre-upgrade database/blob backup, permanent active-database comment deletion and backup-based rollback. Verify the migration on a disposable legacy copy; leave actual live deployment for explicit operator approval.
