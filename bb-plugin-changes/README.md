# Changes

Review the diff of a bb thread file by file, and write comments on its lines. The comments collect in a pending review. One click sends them to the thread's agent as one message.

## Install

```sh
bb plugin install git:https://github.com/koenvg/bb-plugins.git@main --subdirectory bb-plugin-changes
```

Requires bb 0.44 or later (`@get-bb/plugin-sdk` 0.5.29).

## The Changes tab

Open **Changes** from the new-tab list in a thread's right panel.

- The picker selects the diff: **All changes** (default), **Uncommitted**, **Committed on branch**, or one commit of the branch.
- Branch diffs compare with `origin/<default branch>` when that remote branch exists, else with the local default branch.
- The top shows the file count and the added lines (green) and deleted lines (red), for example `2 files +34 -5`.
- **Unified view** and **Split view** are the two icon buttons next to Refresh.
- Each file has its own section. Sections show folders first, then files, by name, at each folder level: `src/ui/a.ts`, then `src/b.ts`, then `README.md`. A binary file shows "Binary file". A file that is too large shows "Diff too large". A diff loads when its section comes near the visible area.
- **Refresh** (the arrow icon) loads the diff again. The last diff stays visible while it loads.

## Viewed files

- Check **Viewed** in a file header to mark the file as viewed. The file collapses to its header.
- Uncheck **Viewed** to remove the mark. The file expands.
- The chevron at the start of a file header expands or collapses the file. It does not change the mark.
- The top shows how many files you viewed, for example `2/3 viewed`. Binary files and files with "Diff too large" cannot be marked, and do not count.

A mark is linked to the patch you saw. When the file changes in any way, the mark drops and the file expands again. A mark also drops when the file leaves the diff.

Marks are per thread and per diff target, so a mark on **All changes** does not show on **Uncommitted**. They stay after a bb reload. The chevron state is lost when bb reloads.

When a mark cannot be saved, the checkbox goes back and the tab shows "Could not save viewed state" with the error.

The plugin saves marks in its kv storage, one entry per thread and target:

```text
key:   viewed:v1:<threadId>:<target>     target = all | uncommitted | branch_committed | commit:<sha>
value: { "v": 1, "marks": { "<path>": "<length>:<fnv1a32 of the patch>" } }
```

## File outline

When the Changes tab is 768px wide or more, a file outline shows at the left of the diff. Make the right panel narrower and the outline goes away.

- The outline is a folder tree, like the VS Code explorer. A folder with only one subfolder shows as one row, for example `src / ui / lib`.
- Click a folder to fold or unfold it. Folding hides rows in the outline only. The diff keeps all files.
- Each file row shows a file-type icon, the file name, the number of pending comments, a status letter, and the added and deleted lines.
- Status letters: **A** added, **M** modified, **D** deleted, **R** renamed, **C** copied, **T** type changed, **U** untracked.
- Click a file to scroll the diff to it. The file stays at the top while the diffs near it load.
- The outline marks the file at the top of the diff, and follows when you scroll.
- Drag the right edge of the outline to change its width (240px to 520px). The diff always keeps at least 400px. Double-click the edge to reset to 320px. With the edge focused, the arrow keys change the width by 10px. bb keeps the width after a reload.

The file-type icons come from [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme) through `vscode-material-icons` (MIT). See `ui/file-icons/LICENSE`.

## Inline comments

1. Move the pointer over a line and click **+** in the gutter.
2. Type the comment. **Add to review** (or Cmd/Ctrl+Enter) adds it to the pending review. **Cancel** (or Escape) closes the form.
3. The comment shows below its line. **Remove** deletes it.

A comment on an added or context line is on the new side. A comment on a deleted line is on the old side.

When a comment's line is not in the current diff (after a refresh, or with another diff target), the comment shows in **Not in this diff** at the top. It stays in the review.

The pending review belongs to one thread. It stays when you switch tabs or threads. It is lost when bb reloads.

## Send feedback

**Send feedback (N)** opens the review prompt. It lists the comments in the same file order as the sections, then by line. You can edit it. **Send to agent** (or Cmd/Ctrl+Enter) sends it to the thread as one message, and the sent comments leave the diff. **Cancel** keeps all comments and drops your edits to the prompt.

When the agent runs a turn, bb queues the message and the tab shows "Queued until the agent is idle". Otherwise it shows "Sent to agent".

The prompt has this format:

```text
Please address the following review comments:

1. `src/a.ts:42` - Null check missing
2. `src/b.ts:10 (deleted line)` - Why remove this?

Check each comment against the current code before you change anything.
Fix the valid ones at their location.
If a comment is invalid, stale, or already addressed, do not change code for it, and explain why.
```

The plugin never commits, pushes, or writes to GitHub.

## Known limits

- bb's own Changes tab stays visible next to this one.
- The marks of deleted threads stay in kv storage.
- bb 0.44 can fail to list the branch commits for some branches. Then the picker shows no commits, and the diff still loads. The plugin log shows "Branch commits unavailable".

## Development

```sh
npm ci
npm test
npm run typecheck
bb plugin build
```

The diff, comment form, and comment card come from [`../review-ui`](../review-ui).
