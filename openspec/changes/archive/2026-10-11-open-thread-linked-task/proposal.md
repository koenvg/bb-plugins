# Proposal

## Why

Selecting Task in a thread's right-side launcher does not open its linked task, although the header chip can open that task. The user confirmed that the chip opens the details, so the change fixes task selection rather than replacing the detail view.

## What Changes

- When the Task panel has no explicit task key, resolve the current thread's linked task through the existing lookup.
- Select the first linked task, matching the header chip, including completed tasks.
- Show clear loading, no-linked-task, and lookup-error states, with manual retry for errors.
- Keep panels opened from header chips and message cards on their explicit task key.
- Preserve the existing detail editor and save-before-switch safeguards.

Out of scope: a task chooser, changes to header presentation, task mutations, backend or database changes, new dependencies, plugin installation, and unrelated UI redesign.

## Capabilities

### New Capabilities

- `thread-task-panel`: Task selection and lookup feedback in a thread's right-side Task panel, including linked-task defaults and explicit task links.

### Modified Capabilities

None. The existing `thread-header-task` selection and navigation requirements remain unchanged. The new capability covers the panel, not the chip.

## Impact

- `bb-plugin-tasks-plus/views/embed/index.tsx` and its slot integration tests.
- Existing `getTasksForThread` RPC, ordered by attachment time and link ID, with no contract change.
- Existing query/refresh and task-session code will be reused. No data migration or new package is needed.
- The screenshot's completely blank display was not reproduced. The source shows a message-card hint for missing params; acceptance must verify the actual Task launcher in BB, not just the component.
