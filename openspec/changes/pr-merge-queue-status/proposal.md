# Proposal

## Why

The plugins do not know about GitHub merge queues. A PR in the queue shows its old blockers (for example "Blocked" in red), or "Ready". Both are wrong. The user cannot see that the PR waits in the queue, or that the queue failed it.

## What Changes

- github-insight reads the merge queue entry of the PR (position and state) in the overview query it already sends. No new API call.
- A queued PR has no merge blockers. The queue state replaces them.
- The PR summary gets an optional `mergeQueue` field. `version` stays `1`.
- The PR tab shows the queue state and position.
- The sidebar row shows "Queued #N", "Merging", or "Queue failed".
- The sidebar tabs put a queued or merging PR in In flight, and a failed queue entry in Needs attention.

Out of scope:
- "Removed from queue" after a failure (needs timeline events).
- Auto-merge (`autoMergeRequest`).

## Capabilities

### New Capabilities

- `pr-merge-queue`: how github-insight detects that a PR is in a merge queue, how the queue state replaces the merge blockers, and how the state goes into the PR summary and the PR tab.

### Modified Capabilities

- `sidebar-thread-list`: the PR status per thread also distinguishes queued, merging, and queue failed.
- `sidebar-thread-tabs`: the PR rule puts a queued or merging PR in In flight, and a failed queue entry in Needs attention.

## Impact

- `bb-plugin-github-insight`: `github/overview-query.ts`, `core/overview.ts`, `core/blockers.ts`, `core/summary.ts`, `core/banner.ts`, `ui/pr-tab.tsx`, README.
- `bb-plugin-pr-thread-list`: `pr-insight.ts`, `pr-status.ts`, `tabs.ts`, README.
- Summary contract: additive optional field. An old sidebar shows "Ready" for a queued PR, because its blockers are empty.
