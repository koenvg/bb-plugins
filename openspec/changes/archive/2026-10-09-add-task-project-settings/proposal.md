# Proposal

## Why

Tasks users can set a project's name and color when they create it, but the current Manage page has no controls to change them later. Restore these controls in Tasks settings without changing project identity or task keys.

## What changes

- Add a Projects tab to Tasks' existing Manage page, reachable through the settings icon. Keep Labels the default and Labels, Presets, and Folders available.
- Show one identity-keyed table row per Tasks tracker project, with an editable name, read-only prefix, and per-row Save and Cancel.
- Deliver name editing first, preserving and showing saved color read-only. Add the existing named color palette to the same rows in delivery 2, not a separate editor.
- Keep drafts local and independent between rows, validate nonblank names, lock editing during a single pending save, and show errors with manual retry.
- Keep displayed rows and controls stable during inventory refresh and saving. Initial loading must not invent a project count.
- Refresh project names and colors through the existing project-change event after a successful save.
- Leave project identities, prefixes, task keys, folders, BB links, linked BB workspace projects, and Tasks browsing scope unchanged.

The user-approved table and stable loading treatment replace the selector proposed at planning revision `20db7c8da2c9b00a6c2f9545f934fb1e38dbc886`. The approved delivery order remains name editing, then color editing.

## Capabilities

### New capabilities

- `tasks-project-settings`: Safely update existing Tasks project names and colors in identity-bound Manage table rows.

### Modified capabilities

None. The existing project-switcher contract and fork compatibility requirements remain unchanged.

## Impact

- UI: `bb-plugin-tasks-plus/views/manage/manage-panel.tsx`, a focused project-settings component in the same directory, and the existing `ColorSwatchPicker` in delivery 2.
- Data: reuse `useProjects`, `useTasksRpc`, `updateProject`, and `projects:changed`. No new API, database migration, dependency, or CLI command.
- Tests: add project-settings interaction and failure-state coverage using the existing slot-test fixtures; verify existing Manage tabs and project consumers still work.
- Scope: only Tasks tracker project settings. Do not rename or recolor the linked BB workspace project, change prefix handling, add project deletion, or refactor unrelated Manage editors. Installed-code replacement and live-data validation need separate approval.
