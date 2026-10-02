## Why

The "PR" tab of `github-insight` shows when a PR is ready to merge, but you must go to GitHub to merge it or add it to the merge queue. OpenForge has these two actions on its PR card. bb does not have them.

## What Changes

- The "PR" tab shows one action button when the PR is open and has no merge blockers:
  - **Enqueue** when the repository uses a merge queue.
  - **Merge** when it does not. The button label shows the merge method (for example "Squash and merge").
- **Merge** opens a confirm dialog first. **Enqueue** runs on one click.
- A PR that is in the merge queue shows a "Queued" label and no button.
- Each action sends the head commit that the tab showed. If the branch changed after the last refresh, GitHub rejects the action and the tab shows the error.
- After a successful action, the tab refreshes the PR insight.
- The composer banner in the chat view shows the same action. Today it shows only when the PR has blockers. Now a ready PR shows "Ready to merge" or "Ready to enqueue" with the same button, and a queued PR shows "Queued".
- The overview query reads more fields: PR node id, head commit, merge queue state, and the merge methods of the repository.

Out of scope for this change:
- Auto-merge (enable or disable).
- Dequeue.
- A merge method picker. The tab always uses your default merge method for the repository.
- Admin merge that bypasses branch rules.
- Merge or enqueue from the CLI or from an agent.

## Capabilities

### New Capabilities

- `pr-merge-actions`: when the "PR" tab and the composer banner offer Merge, Enqueue, or show "Queued", which merge method they use, the confirm step, the GitHub writes, and the result they show.

### Modified Capabilities

None. The `github-pr-insight` change that owns the "PR" tab is not archived, so no main spec exists to change.

## Impact

- Code in `bb-plugin-github-insight/`: overview query and parser, a new pure module for the action state, two new host handlers, one new RPC, the "PR" tab UI, and the composer banner.
- New GitHub writes through `gh api graphql`: `mergePullRequest` and `enqueuePullRequest`. They run only when you click.
- The writes run as the `gh` user, with the permissions of that user.
- No change to bb core. No new dependencies (`@radix-ui/react-alert-dialog` is already in the plugin).
