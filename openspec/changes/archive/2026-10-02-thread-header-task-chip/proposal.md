## Why

A thread does not show which task it works on. To see the task and its status, the user must open the Tasks panel and find the task.

## What Changes

- The thread top bar shows a chip for the task linked to the thread: status icon, task key, and status label.
- A click on the chip opens the task in the thread's "task" side panel.
- If 2 or more tasks are linked, the chip shows the earliest linked task and a "+N" count.
- If no task is linked, the top bar shows nothing.
- The chip updates live when the task or the link changes.
- New RPC `getTasksForThread` that returns the tasks linked to a thread, earliest link first.

## Capabilities

### New Capabilities

- `thread-header-task`: the linked task shown in the thread top bar, its status, and how it opens the task.

### Modified Capabilities

None.

## Impact

- `bb-plugin-tasks-plus/app.tsx`: registers the chip with `app.slots.experimental_threadHeaderAction`.
- `bb-plugin-tasks-plus/shared/contract.ts`, `api/index.ts`, `db/store.ts`: new read-only RPC and store query.
- New chip component in `bb-plugin-tasks-plus/views/`.
- Depends on an `experimental_` SDK slot. Its API can change in a future SDK release.
