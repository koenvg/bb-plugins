# Proposal

## Why

Tasks project settings can edit names and colours, but cannot delete a project and its tasks. Adding a third text action would crowd each row, so the agreed flow uses row icons and a separate prefix-confirmed deletion dialog.

## What Changes

- Replace row Save and Cancel text buttons with check-mark and undo icon buttons. Add a red trash icon, separated from the editing actions. Give all three buttons tooltips, accessible names and full-size click targets.
- Open a confirmation dialog for the saved project identity, name and prefix. Show its total task count, including subtasks and completed tasks, and warn that deletion is permanent.
- Require an exact match to the saved project prefix before enabling the text-labelled `Delete project and tasks` button. Keep the dialog's `Cancel` button text-labelled.
- Delete the Tasks project and all its tasks through the existing forced-deletion RPC. Preserve the linked BB workspace project and BB threads.
- Keep existing name/colour drafts, save safeguards, inventory error handling and compact layouts. Add single-flight deletion, visible errors and manual retry.
- Do not add archive, undo, bulk selection, a new deletion API, schema changes, dependency changes or BB workspace deletion.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tasks-project-settings`: Add prefix-confirmed project deletion and accessible icon row actions while preserving existing editing and inventory behaviour.

## Impact

- UI: `bb-plugin-tasks-plus/views/manage/projects-section.tsx` and `projects-section.css`, plus a local dialog component if needed to keep the confirmation flow separate from row editing.
- Reuse existing Button, Input, Dialog, Tooltip and Icon components, `listAllTasks` for the complete task count, and `deleteProject` with `force: true` for deletion.
- Existing `projects:changed` inventory refresh and Tasks consumers must reflect successful deletion without reloading BB.
- Extend project-settings component and production integration tests, the existing fixture preview and user documentation. API and database tests verify the existing deletion contract rather than adding new deletion behaviour.
- Planning only in this change's proposal phase. Implementation and visual verification require a later apply request.
