# Proposal

## Why

Task rows repeat label pills and long thread and PR explanations. At split-view widths, the title, key, and badges occupy three separate lines with weak text hierarchy, making dense lists harder to scan.

## What Changes

- Remove task label badges, including label overflow counts, from list rows at every container width. Apply this to parent tasks and subtasks in All tasks, project lists, and the active-work list.
- Keep label data, label filters, the row context menu, the label keyboard shortcut, and task-detail label editing unchanged.
- Use a compact two-line layout in constrained list panels: status and title first, then the key, priority, and available metadata together. Give titles more weight and use a smaller readable metadata step. Allow long content to wrap; do not shrink text or touch targets to force a fixed row height. Retain a single-line layout where the list panel is wide enough.
- Shorten thread archive wording to `All archived` or `N archived`, while preserving runtime counts, including Idle, failure priority, and full archive details in the thread menu.
- Keep the existing single-PR identity and primary state, such as `PR #7 · Merged`. Shorten secondary PR quality and lookup explanations to a visible textual detail control. Keep unavailable, stale, and incomplete data distinct and keep actionable PR problems visible.
- Do not render an empty metadata rail when a row has no progress, dependencies, threads, PRs, due date, or required project marker.
- Preserve the current metadata order, status and priority controls, subtask progress, dependency badges, and navigation behavior.

## Capabilities

### New Capabilities

- `task-list-presentation`: Defines label-free task rows, compact two-line layout and readable text hierarchy, compact but truthful work summaries, and unchanged access to secondary details.

### Modified Capabilities

None. The durable `task-list-subtasks` and `task-dependencies` requirements remain unchanged. Parents and subtasks still use the same metadata policy, and dependency badges retain their existing text and counts.

## Impact

- UI changes are limited to `bb-plugin-tasks-plus/views/list/row.tsx`, its props and callers in `views/list/index.tsx`, and the row-facing thread and PR summary components.
- Update focused row, mobile-layout, thread-summary, PR-summary, metadata, keyboard, and subtask tests. Remove label-display helpers only if they have no remaining callers.
- Coordinate with the in-flight `task-overview-thread-pr-status` change. Preserve its state aggregation, archive semantics, failure visibility, and uncertainty reporting; this change only narrows row presentation. Its design currently names `All threads archived` and tests assert verbose lookup text, so those visible-text expectations need reconciliation with the shorter wording.
- No task storage, API, CLI, polling, or backend changes are required. The user approved updating the Tasks Plus SDK pin and lockfile from `0.5.9` to `0.5.29` after the installed BB reported that build prerequisite.
- The board, filter bar, task details, and list-level work-status summary are outside this change. Do not add display settings or a second responsive component tree.
