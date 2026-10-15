# Proposal

## Why

The Tasks overview shows task workflow status and an Active badge, but hides idle, failed, and archived thread states and PR outcomes. Users must open individual tasks or threads to discover failed checks, pending reviews, or work that merged while the task remains In Review.

## What Changes

- Replace the task list's constant-text Active badge with a compact summary of all attached threads, including activity counts, failures, and archive state. Offer a drill-down to individual threads.
- Add a separate PR summary showing Draft, Open, Merged, and Closed plus failing or running checks, awaiting review, changes requested, conflicts, unresolved comments, other merge blockers, and ready to merge.
- Aggregate multiple PRs by distinct URL without allowing a merged PR or working thread to hide another item's problem.
- Preserve normal row navigation while making individual thread and PR links accessible from the summaries.
- Distinguish loading, no PR, stale details, and unavailable information. Reuse GitHub Insight metadata for rich status; retain basic host PR information when rich details are unavailable.
- Apply the same treatment to visible subtasks and all list entry points. Keep task workflow status, thread execution, archive state, and PR status independent.

## Capabilities

### New Capabilities

- `task-overview-work-status`: Aggregate attached-thread and PR status in Tasks list rows, with accessible drill-down, partial-data handling, and bounded enrichment.

### Modified Capabilities

None. Existing subtask metadata parity and task/thread lifecycle independence remain unchanged. Sidebar PR status behavior is a reference, not a target of this change.

## Impact

- Tasks Plus: `shared/contract.ts`, API handler registration, list metadata loading and presentation, and associated API/list/interaction tests.
- Add a read-only batch enrichment handler and internal status adapters. No task database migration, CLI change, or automatic task status transition is planned.
- GitHub Insight's version 1 `prSummary` metadata becomes an optional source for list enrichment. Tasks Plus remains usable without GitHub Insight or Threads with PRs installed; no cross-package runtime imports are introduced.
- Reuse existing BB thread/archive data, environment PR lookup, navigation, realtime, theme tokens, and compact-overlay conventions.
- Coordinate metadata compatibility with the pending `pr-merge-queue-status` change so a queued or unknown blocked PR cannot be reported as ready.
- Scope is the Tasks list overview. Board cards, status filters, sorting, merge/review actions, and broader lifecycle cleanup are excluded.
