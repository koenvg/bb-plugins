# Proposal

## Why

Tasks users can set a project's name and color when they create it, but the current Manage page has no controls to change them later. Restore these controls in Tasks settings without changing project identity or task keys.

## What Changes

- Add a Projects tab to Tasks' existing Manage page, reachable through the settings icon.
- Let users select a Tasks tracker project and edit its name and color with the existing color palette.
- Provide explicit Save and Cancel controls, nonblank name validation, a pending-save state, and visible errors with retry.
- Refresh project names and colors through the existing project-change event after a successful save.
- Leave project prefixes, task keys, folders, and linked BB projects unchanged. Keep the existing Labels, Presets, and Folders tabs.

## Capabilities

### New Capabilities

- `tasks-project-settings`: Select an existing Tasks project in Manage and safely update its name and color.

### Modified Capabilities

None. The existing project-switcher contract and fork compatibility requirements remain unchanged.

## Impact

- UI: `bb-plugin-tasks-plus/views/manage/manage-panel.tsx`, a focused project-settings component in the same directory, and the existing `ColorSwatchPicker`.
- Data: reuse `useProjects`, `useTasksRpc`, `updateProject`, and `projects:changed`. No new API, database migration, dependency, or CLI command.
- Tests: add project-settings interaction and failure-state coverage using the existing slot-test fixtures; verify existing Manage tabs and project consumers still work.
- Scope: only Tasks tracker project settings. Do not rename or recolor the linked BB workspace project, change prefix handling, or add project deletion.
