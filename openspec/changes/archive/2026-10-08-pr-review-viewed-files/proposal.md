## Why

In the Changes tab you can mark a file as viewed, and the file collapses. The Review tab of a PR has no such mark. On a PR with 90 files you lose track of which files you already read, and every file stays open.

## What Changes

- Each file in the Review tab that shows a diff gets a "Viewed" checkbox and a collapse button in its header. These work the same as in the Changes tab.
- The top of the Review tab shows "N/M viewed" next to "N files changed".
- A mark belongs to the PR (`owner/repo#number`), not to the thread. All threads on the same PR show the same marks.
- A mark stays valid only while the GitHub patch of the file is the same. A push that changes the file drops the mark. A push that does not touch the file keeps it.
- bb stores the marks in plugin storage. bb does not read or write the "Viewed" state on GitHub.
- The checkbox, the collapse button and the patch hash move to `review-ui/`, so both plugins use the same parts.

Out of scope:

- Sync with the GitHub "Viewed" state.
- A "mark all as viewed" action.
- Marks on files that GitHub sends without a patch.

## Capabilities

### New Capabilities

- `pr-review-viewed-files`: the "Viewed" mark, collapse and counter on the files of the PR Review tab, stored per PR.

### Modified Capabilities

None. The Changes tab keeps its behavior. Only its code moves to shared parts.

## Impact

- `bb-plugin-github-insight`: a new kv store for viewed marks per PR, marks in the `getReview` result, a new `updateViewed` RPC, and header controls and a counter in the Review tab.
- `review-ui/`: new shared `ViewedCheckbox`, `CollapseButton` and `patchIdentity`.
- `bb-plugin-changes`: uses the shared parts from `review-ui/`. No change in behavior.
- No new GitHub API calls.
