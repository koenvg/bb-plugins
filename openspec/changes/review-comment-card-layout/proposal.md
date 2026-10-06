# Proposal

## Why

In the PR Review tab, a review comment with a long unbreakable line (a code block or a long path) pushes the old-code column down to about one character wide. The diff becomes unreadable. The Review tab also has its own `FileDiff` setup, separate from the shared `review-ui` diff that the Changes tab uses. Because of this, a layout fix in one place does not get to the other.

## What Changes

- A comment card in a diff no longer sets the width of its diff column. The card fills the column it is in.
- A wide code block in a review comment scrolls on its own inside the card. The diff does not get wider.
- The PR Review tab renders its diffs through the shared `review-ui` `ReviewFileDiff`, not through a direct `FileDiff` call.
- `ReviewFileDiff` gets an optional `onAddComment`. When no handler is given, the gutter **+** is off. The Review tab has no add-comment flow.
- The Review tab keeps split view. The view does not change.

## Capabilities

### New Capabilities

- `diff-comment-layout`: how comment cards (review threads, comment drafts, pending comments, inline forms) sit inside a file diff without breaking the diff columns.

### Modified Capabilities

None.

## Impact

- `review-ui/review-file-diff.tsx`: optional `onAddComment`, and a wrapper around each annotation that stops the card from setting the column width.
- `bb-plugin-github-insight/ui/file-diff.tsx`: use `ReviewFileDiff` with `view="split"`.
- `bb-plugin-github-insight/ui/review-thread.tsx`: code blocks in the comment body scroll horizontally.
- `bb-plugin-github-insight/tsconfig.json` and `vitest.config.ts`: add the `../review-ui` wiring that `review-ui/README.md` asks for.
- The Changes tab gets the same card fix from the shared component. Its behavior does not change in any other way.
