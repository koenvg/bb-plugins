# Proposal

## Why

In the Review tab, only the agent can start a comment draft on a line (through `bb github-insight review comment`). The user can edit and delete drafts, but cannot add one. To add a line comment, the user must ask the agent or go to github.com.

## What Changes

- The Review tab shows a "+" in the diff gutter. A click saves an empty comment draft on that line and side, at the PR head. The draft card opens below the line with the focus in its text box.
- The new draft uses the same storage, the same edit and delete, and the same Submit as agent drafts. It stays after a restart.
- All comment draft cards show the label "Pending comment". The label "Draft from agent" goes away from comment draft cards. Reply drafts in review threads do not change.
- Submit ignores comment drafts with an empty body. The panel count shows only drafts with text. Today Submit fails when a draft is empty.
- The "+" does not show when comment drafts are on an older commit, or when the PR is merged or closed. The older-commit warning tells the user to submit or delete those drafts to add new comments.
- Comments are on one line only. Ranges are out of scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-submit`: the user can start a comment draft from the diff; comment draft cards have a neutral label; Submit and the panel count ignore empty comment drafts; the older-commit warning tells the user how to add new comments.

## Impact

- `bb-plugin-github-insight/contract.ts`: new RPC `createCommentDraft`.
- `bb-plugin-github-insight/review/review-writes.ts`: create action; Submit filters empty drafts.
- `bb-plugin-github-insight/ui/file-diff.tsx`, `ui/review-tab.tsx`: pass `onAddComment` to the shared `ReviewFileDiff`.
- `bb-plugin-github-insight/ui/comment-drafts.tsx`, `ui/older-comment-drafts.tsx`, `ui/submit-panel.tsx`: label, focus, warning text, count.
- `bb-plugin-github-insight/README.md`, `PLUGIN_OVERVIEW.md`.
- No change to `review-ui/review-file-diff.tsx`, the CLI, or the storage format.
