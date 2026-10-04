Review a thread's diff file by file in a **Changes** tab, and send inline comments to the agent in one message.

- A **Changes** tab in the thread's right panel with the diff of the thread's environment.
- A picker for **All changes**, **Uncommitted**, **Committed on branch**, or one commit.
- File sections with added and deleted line counts, unified or split view, and a refresh button.
- A **+** in the gutter opens a comment form on that line. **Add to review** adds the comment to a pending review below its line.
- Comments whose line is not in the current diff show in **Not in this diff**.
- **Send feedback (N)** opens an editable prompt and sends it to the thread as one message.

Pending comments stay in memory per thread until bb reloads. The plugin never commits, pushes, or writes to GitHub.
