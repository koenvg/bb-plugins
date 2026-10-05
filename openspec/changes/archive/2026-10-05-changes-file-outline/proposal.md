## Why

In a long diff, the Changes tab has no list of its files. To find a file, you scroll through all diffs above it. When the tab is wide, there is space for a file outline next to the diff.

## What Changes

- A **file outline** shows at the left of the diff when the Changes tab is wide. It is a folder tree. A folder with only one subfolder shows as one row (`src/ui/lib`).
- Each file row shows the file name, the added and deleted line counts, and the number of pending comments on the file.
- A click on a file row scrolls the diff to that file.
- The outline marks the file that is at the top of the diff while you scroll.
- The tab width alone controls the outline. A narrow tab shows no outline, as today. There is no button to show or hide it.
- **BREAKING (order)**: the file sections show in the order of the outline (folders first, then files, by name), not in the order the environment returns them.
- The review prompt and "Not in this diff" list comments in the same file order.

Out of scope (later changes):
- A search filter, "reviewed" marks, and keyboard navigation in the outline.
- Folders that the user can collapse.
- A button to hide the outline, or an overlay outline in a narrow tab.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `changes-diff-view`: file sections change to outline order, and new requirements for the file outline, the jump to a file, and the current-file mark.
- `changes-review-feedback`: the review prompt lists comments in outline file order.

## Impact

- `bb-plugin-changes/ui/changes-tab.tsx`: layout with the outline beside the scroll area.
- New outline UI and a file-order module in `bb-plugin-changes`.
- `bb-plugin-changes/core/review-prompt.ts` (`sortComments`): file order.
- `bb-plugin-changes/README.md`: the outline and the new file order.
- The baseline is the file tree of OpenForge's self review (`packages/pr-review-ui/src/fileTreeModel.ts`). OpenForge is Svelte, so we copy the rules, not the code.
- No server, RPC, or SDK change.
