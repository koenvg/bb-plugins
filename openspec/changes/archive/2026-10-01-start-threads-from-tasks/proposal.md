# Proposal

## Why

Tasks currently help plan work, but starting that work requires creating a BB thread separately and pasting its ID back into the task. Starting from a task should be the usual path into a thread, while leaving the user free to review the prompt and choose execution settings before anything runs.

## What Changes

- Add a Start action for an eligible task without a linked thread. It opens a task-specific page with BB's full new-thread composer, prefilled from the task prompt and set to the task's project.
- Let the user edit the prompt and choose the model, environment, and permissions before submitting. Keep the resulting thread in the task's project.
- On successful submission, create and link one thread, move the task to In progress with Focus attention, then navigate to that thread. Leaving the composer without submitting does not change the task.
- Keep pending task pages current as other tabs finish starting a thread. For an unresolved launch, offer a manual recheck, same-project link, or confirmed claim release without automatically starting or deleting a thread.
- Offer Open thread instead of Start once a task has a linked thread. Retain manual linking and manual task completion; thread activity does not automatically mark a task Done.

## Capabilities

### New Capabilities

- `task-thread-start`: Starting work from a task through a reviewable BB composer and maintaining the task-to-thread link.

### Modified Capabilities

None. This project has no existing OpenSpec capability specs.

## Impact

- `bb-task-board/app.tsx`: task actions and a task-specific composer view.
- `bb-task-board/server.ts`: task-scoped thread creation, validation, and state updates through the BB SDK.
- `bb-task-board/app.test.tsx`, `bb-task-board/server.test.ts`, and task-board documentation: behavior and failure-path coverage.
- Uses the installed BB Plugin SDK's new-thread composer and thread-spawn API; no new external service is planned.
