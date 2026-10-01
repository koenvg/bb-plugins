# Design

## Context

See [proposal.md](proposal.md) for the motivation and [the task-thread-start spec](specs/task-thread-start/spec.md) for behavior. The board stores tasks in plugin SQLite and exposes them through RPC and `bb task-board`; `threadId` currently accepts only an existing thread from the same project. The app already has a Tasks nav panel and a `toThread` link. The installed BB Plugin SDK exposes the host's full `experimental_NewThreadComposer` with an `onSubmit(NewThreadRequest)` callback, a nav-panel `subPath`, and server-side `bb.sdk.threads.spawn`. Root `toCompose` only accepts initial prompt and focus, so it cannot reliably carry the task identity and project through submission.

## Goals / Non-Goals

**Goals:**
- Use BB's composer and its resolved user choices rather than duplicate model, environment, permission, attachment, and prompt controls in Tasks.
- Keep task-to-thread attribution stable across two tabs, failed submissions, and an interrupted link save.
- Preserve the existing manual link, task editor, CLI, and independent completion workflow.

**Non-Goals:**
- Automatically mark tasks Done based on agent or thread status.
- Change BB's global new-thread composer or add a new external runner.
- Let a thread spawned from a task belong to another project.

## Decisions

### Route to a task-specific BB composer

Use the existing Tasks nav panel with a subpath such as `start/<task-id>`. Start in the task detail navigates there. Load the task by ID rather than assuming it remains on the filtered or paged board. Render `experimental_NewThreadComposer` with `initialPrompt` from the task, `defaultProjectId` from the task, and a draft key scoped to that task. Its `onSubmit` receives the host-resolved `NewThreadRequest`. Return to Tasks without submitting via browser Back or a visible Back action. For a task already linked, Open thread navigates to the existing thread instead.

The host composer seeds but does not lock its project picker. Show the task's project as the required destination and validate `request.projectId === task.projectId` on the server; a mismatch rejects submission so the composer retains its draft. The user can still edit the prompt and change supported model, reasoning, environment, and permission choices. Do not copy edited composer text into `task.prompt`.

Alternative considered: `toCompose({initialPrompt})` opens BB's top-level composer but lacks a task ID and project selection handoff or a submission callback. Prompt matching would break when the user edits the draft. A custom composer would also need to reimplement host controls.

### Submit through one task-scoped server operation

Add a typed `tasks_start` RPC that accepts the task ID and the composer's request. Validate the task still exists, is unfinished, has no linked thread, has completed prerequisites, and has the same project as the submission. Reuse the existing prerequisite and task update rules, including Focus for an In progress task. Forward the request's prompt input, attachments, environment, provider, model, reasoning, permission, service tier, scheduling, and `executionInputSources` to `bb.sdk.threads.spawn` unchanged, along with plugin-owned task attribution. On success, persist `threadId`, `status: doing`, and `focus: focus`, publish the existing realtime update, and return the thread ID for `toThread` navigation.

If the task became linked after the composer opened, return the existing thread ID without spawning. A BB creation error before a thread exists leaves task state unchanged and rejects `onSubmit` so its draft is preserved. Existing manual `threadId` updates remain supported outside an in-progress launch.

Alternative considered: spawn from the app with `useSdk`, then call `tasks_update`. That would expose a larger gap for concurrent submissions, make plugin attribution and recovery harder, and leave two separately failing client requests.

### Record and reconcile in-flight launches

BB thread creation and plugin SQLite cannot share a transaction. Add a small plugin-owned launch-claim table keyed by task ID. Claim a task before awaiting `threads.spawn`; a second submission sees the claim and does not spawn. Validate and write the claim synchronously with the current task state. Seed the created thread's plugin metadata with the task ID and claim token. Once BB returns a thread ID, finish the task link and clear the claim in one SQLite transaction; use the same checked task-state transition as normal updates. While a claim exists, reject conflicting manual relinks, task deletion, or status changes rather than allowing two owners of the task.

If spawn definitively fails, release the claim and leave the task untouched. If creation may have succeeded but the link write or process was interrupted, retain the claim. On opening the task or resubmitting, reconcile by searching the task project's plugin-origin threads and checking their plugin metadata for the claim token; link the matching thread instead of spawning again. A `thread.created` listener can shorten this recovery path, but recovery cannot rely on receiving that event. If the outcome is still uncertain, show a pending/error state and do not automatically retry creation; without BB-side idempotency, retrying an unresolved spawn could create a duplicate. This favors a recoverable hold over silently starting a second agent.

Alternative considered: using only an in-memory lock or deleting a thread if the task update fails. A process restart loses the lock; deleting a possibly running thread would discard work.

### Recover an unresolved claim deliberately

Expose `active` and the current launch token in `tasks_start_state` alongside pending status. The token is an optimistic concurrency value, not an authorization secret. A pending task detail links to its task-specific page. That page subscribes to `tasks-changed`, reloads the state and task when a different tab completes the link, and has a Recheck action for claims left unresolved. Ignore stale async reload results; a successful recheck shows Open thread.

Add a `tasks_resolve_launch` RPC with the expected launch token and either `link` plus a thread ID or `release` plus an explicit confirmation. Reject both actions while this plugin instance has the task in flight. Before resolution, call the normal reconciliation search across both active and archived plugin-origin threads. If it finds the claimed thread, link that thread instead of applying the requested action. Fail closed on SDK read errors and recheck the token in a synchronous SQLite transaction before changing the claim.

For `link`, validate the chosen thread exists in the task's project, then use the same link/status/Focus transition as automatic recovery. For `release`, show a warning and require an affirmative confirmation that no thread was created; leave the task row untouched and delete only the matching unresolved claim. Neither action spawns or deletes threads. An operator who releases a claim while BB is delayed may later create duplicate work, so no automatic retry follows release. The next Start always requires a separate composer submission. Tests cover active and stale claims, cross-project links, discovery-before-resolution, SDK lookup failure, realtime pending-to-linked, and a changed project selection in the host composer test boundary.

## Risks / Trade-offs

- [The SDK composer is marked experimental] -> Use its documented props, keep host-owned controls behind the task-specific page, and cover request forwarding and navigation in tests. Recheck its contract when upgrading the Plugin SDK.
- [The project picker can be changed despite a fixed task project] -> Explain the required destination on the page and reject mismatched submissions without clearing the draft.
- [BB accepts a thread but the plugin cannot confirm its ID immediately] -> Keep the durable claim and reconcile via plugin metadata. If it remains unresolved, require an operator decision; release warns about duplicate work and never silently retries.
- [Task changes during a saved draft] -> Check current task status, link, prerequisites, and project at submit time. Preserve the user's composer draft on rejection; a changed task prompt does not silently replace it.

## Migration Plan

Use a plugin storage migration for the launch-claim table; existing tasks and links stay unchanged. The new Start action is additive. Rollback can hide the action and leave current task links readable by the old plugin; an unfinished claim must be reconciled before retrying after a rollback or upgrade.
