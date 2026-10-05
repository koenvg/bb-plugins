## Why

The file outline has a fixed width of 240px, so long names get cut off and you cannot make it larger. Its rows are plain text, so a folder and a file look almost the same, and you cannot see if a file is new, changed, or deleted. OpenForge's self review solves both with a tree like the VS Code explorer. We use that as the baseline.

## What Changes

- A drag handle on the right edge of the outline changes its width. Double-click resets it. Arrow keys move it in 10px steps. The width stays after a reload.
- Folder rows get a chevron and a folder icon. A click on a folder row folds or unfolds it. A merged folder shows its parts with separators (`src / ui / lib`).
- Thin indent guides show the folder level of each row.
- File rows get a file-type icon and a status badge: A (added), M (modified), D (deleted), R (renamed), C (copied), T (type change), U (untracked).
- The server passes the change kind and origin of each file from bb's diff to the UI.
- The file-type icons are 46 SVGs from the MIT-licensed Material Icon Theme, copied from OpenForge with their license notice.

Out of scope (later changes):
- Keyboard navigation inside the tree.
- Search, "reviewed" marks.
- Fold state that stays after a reload.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `changes-diff-view`: file rows add an icon and a status badge, and new requirements cover the outline width handle, folder folding, and the folder row look.

## Impact

- `bb-plugin-changes/core/changes.ts` and `server.ts`: `ChangedFile` gets a `status` field.
- `bb-plugin-changes/ui/file-outline.tsx`: new row look, folding, resize handle.
- New `bb-plugin-changes/ui/file-icons/` with the icon map, the SVG strings, and the MIT notice.
- `bb-plugin-changes/README.md`.
- Baseline: OpenForge `packages/plugin-sdk/src/ui/ResizablePanel.svelte`, `packages/pr-review-ui/src/FileTreeRow.svelte`, `packages/plugin-sdk/src/fileIcons.ts`.
- No new npm dependency.
