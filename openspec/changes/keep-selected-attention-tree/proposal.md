# Proposal

## Why

Changes in unread output, running work, or PR status currently move a thread tree between Needs attention and In flight even while the user is viewing its parent or a child. The tree disappears from the current list before the user has finished navigating it.

## What Changes

- Keep a selected tree in its existing attention tab, either Needs attention or In flight, even when its current signals would place it in the other tab.
- Keep that temporary placement when selection moves between members of the same tree. Restore normal placement immediately when selection leaves the tree.
- Selection alone does not move a tree to the other tab. Capture its existing placement rather than forcing Needs attention.
- Continue updating read markers, work indicators, and PR badges. Preserve archive, hide, snooze, grouping, sorting, and collapse behavior.
- Keep this state in the mounted sidebar only. Do not change stored unread status or save the temporary placement as a preference.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sidebar-thread-tabs`: Add a selection-based exception to immediate tree reclassification in both Needs attention and In flight.

## Impact

- `bb-plugin-pr-thread-list/app.tsx`: Use the existing `activeThreadId` prop to manage temporary tree placement.
- `bb-plugin-pr-thread-list/list-model.ts`: Reuse the forest and tree classification so the held tree appears in exactly one attention tab.
- `bb-plugin-pr-thread-list/tree-tabs.test.ts` and `app.test.tsx`: Cover signal updates, selection transitions, and existing exclusions at the public list and slot boundaries.
- `bb-plugin-pr-thread-list/README.md`: Explain the selected-tree exception.
- No server, SDK, RPC, dependency, or durable storage changes. All-tab grouping and natural thread/PR priority rules remain unchanged.
