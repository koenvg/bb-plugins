## Why

bb's Changes panel shows the diff of a thread's worktree, but you cannot comment on a line. To give feedback on the agent's work, you type file names and line numbers into the chat. You review file by file, so the feedback must stay on its line until you finish, and then go to the agent in one message.

## What Changes

- New plugin `bb-plugin-changes` with a **Changes** tab in the thread's right panel.
- The tab shows the diff of the thread's environment, file by file. A picker selects the same diff targets as bb's panel: uncommitted, committed on the branch, all changes, or one commit.
- On a line, a "+" button in the gutter opens an inline comment form. "Add to review" adds the comment to a **pending review**. The comment shows below its line. You can remove it.
- "Send feedback (N)" opens the review prompt in an editable box. "Send to agent" sends it to the thread as one message. The sent comments then leave the diff.
- Shared review UI (diff with inline cards, comment form, comment card) goes into a package that `github-insight` can use later. A spike first proves that bb's plugin build accepts code from outside the plugin directory. If it does not, the code stays in the plugin for this change.
- The baseline is the self review of OpenForge. Pending comments are in memory only.

Out of scope for this change (later changes):
- Hiding bb's native Changes tab, and moving Cmd+D (`diff.toggle`) to the new tab, as an opt-in setting.
- Saving pending comments across a reload.
- Comments on a line range, and editing a comment.
- Reviewed-file marks, a file tree, and collapse of large files.
- An "Analyze" prompt mode.
- Moving `github-insight`'s Review tab to the shared package.

## Capabilities

### New Capabilities

- `changes-diff-view`: the Changes tab, the diff target picker, and how the files and diffs of the thread's environment show.
- `changes-review-feedback`: inline comments on the diff, the pending review, the review prompt, and sending it to the thread's agent.

### Modified Capabilities

None.

## Impact

- New plugin directory `bb-plugin-changes/` with its own `package.json`, tests, README, and CI matrix entry in `.github/workflows/tests.yml`.
- Possible new shared package directory (for example `review-ui/`), only if the spike passes.
- Uses SDK `environments.diffFiles` and `environments.diffPatch` for the diff, `threads.send` for the message, and `@pierre/diffs` (shimmed by bb) for the gutter button and inline annotations. bb's own `experimental_Diff` has no annotation or gutter API, so it cannot hold inline comments.
- Needs an SDK version with these environment diff calls. The repo uses `@get-bb/plugin-sdk` 0.5.29. The latest is 0.6.16.
- No change to `github-insight` and no change to bb core.
