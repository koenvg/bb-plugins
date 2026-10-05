## Why

In the Changes tab, you cannot see which files you already reviewed. After a long agent run you scroll through the same files again, and you cannot easily see a file that the agent changed after you read it. GitHub and OpenForge solve this with a "Viewed" mark per file.

## What Changes

- Each file header in the Changes tab gets a "Viewed" checkbox. A viewed file collapses to its header. Unmarking it expands it again.
- Each file header also gets a chevron to expand or collapse the file without a change to the mark, like GitHub. The chevron state is not saved.
- A mark is linked to the patch the user saw. If the file changes in any way, the mark drops and the file expands again.
- Binary and too-large files have no patch, so they cannot be marked.
- Marks are per thread and per diff target. They are saved in plugin kv storage, so they stay after a bb reload or restart.
- The top of the tab shows "N/M viewed" next to the file count.
- Baseline: the "Reviewed" checkbox of OpenForge's diff viewer, without its file tree.

Out of scope (later changes):
- "Since viewed": a diff of only the lines that changed after the user marked the file.
- A file tree, and a keyboard shortcut to toggle a mark.
- Deleting the marks of archived or deleted threads.

## Capabilities

### New Capabilities

- `changes-viewed-files`: the "Viewed" mark on a file of the Changes tab, when the mark drops, how it is saved, and the viewed counter.

### Modified Capabilities

None.

## Impact

- `bb-plugin-changes/`: new RPCs `getViewed` and `updateViewed` in `contract.ts` and `server.ts`, which use `bb.storage.kv`. New pure module for the patch hash and the marks. Changes in `ui/file-section.tsx` (checkbox, collapse) and `ui/changes-tab.tsx` (counter).
- `review-ui/review-file-diff.tsx`: new optional props for a header slot and collapse. These use the `collapsed` option and `renderHeaderMetadata` of `@pierre/diffs`.
- README and `PLUGIN_OVERVIEW.md` of `bb-plugin-changes`.
- No change to bb core, to `github-insight`, or to the pending review.
