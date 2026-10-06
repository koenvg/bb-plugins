---
name: tasks
description: "Read and manage BB Tasks, or work on explicitly assigned tasks. Task references do not assign work."
---

# Tasks

A task reference alone does not assign work. For read-only questions, use only the reads needed; do not attach, implement, comment or change status.

Use `bb tasks <command> --help` for syntax. Prefer stable task keys and `--json` for machine-readable output.

## Assigned task work

Read current requirements/blockers with `bb tasks show ABC-12 --json`. Report read failures; do not assume state. Proceed only after blockers are done/canceled; otherwise report the blocker and wait for explicit approval.

Fetch relevant attachments before relying on them. Attach result files that belong with the task. If not delegated from Tasks, attach this thread with `bb tasks attach ABC-12`.

Use `bb tasks update ABC-12 --status <status>`: in_review while review remains; done only after all gates.

Comment only for review readiness, completion, failure, blockers or user decisions. State result, relevant checks including unrun/blocked checks, material limits and evidence link; distinguish reported/verified checks.

Keep task-to-thread links through all work changes. Detach only on explicit user request. Detaching does not stop the thread or change status. Links grant no ownership or reporting authority.

## Operation references

Read only the reference for the requested operation:

- Creation, listing, dependencies or link repair: [Task records](references/task-records.md).
- Dispatch or preset edits: [Delegation](references/delegation.md).
- File operations: [Attachments](references/attachments.md).
- Posting comments: [Reporting](references/reporting.md).

## Chat links

Show task cards with `::task{key="ABC-12"}`, one per line. Use Markdown links inside task comments.
