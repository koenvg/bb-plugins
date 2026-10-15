# Proposal

## Why

Long task lists force users to scroll through status sections they do not need. Users must be able to hide those rows and keep that choice when they leave the list and return.

## What Changes

- Make every displayed status section header a collapse and expand control, including Backlog.
- Keep the section name, status icon, task count, and a disclosure chevron visible when collapsed.
- Save collapsed sections on the device, independently for each project, All tasks, and Active work. Restore them after navigation, reload, and app restart.
- Start sections expanded when no saved choice exists. Keep saved choices through filter changes and temporary section absence.
- Exclude hidden rows from keyboard navigation and visible selection order. Use the existing save-before-context-change policy when collapsing a section that contains the selected task.
- Keep subtask expansion settings and task counts independent of section collapse.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-list-presentation`: Add accessible section controls and saved, scope-specific section state.
- `task-list-subtasks`: Clarify that collapsed sections hide matching parents and subtasks without changing filter results, counts, or subtask expansion settings.

## Impact

- `bb-plugin-tasks-plus/views/list/index.tsx` and `list-preference.ts` for controls and saved state.
- `views/list/selection-tree.ts` and its consumers for one consistent visible row order and safe selection reconciliation.
- Existing list persistence, keyboard, scroll restoration, subtask, and browse-workspace tests.
- No database, server API, dependency, board, or sidebar thread-list changes. Device-local storage does not sync settings between devices.
