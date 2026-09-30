# Design

## Context

See `proposal.md` for motivation and `specs/sidebar-task-counts/spec.md` for behavior.

In `bb-plugin-tasks-plus/api/index.ts`, `sidebarSummary` joins projects to top-level tasks and their agent threads. It computes both a distinct task count and a distinct active-agent count. Today, neither aggregate excludes finished tasks. `shell/sidebar.tsx` displays each returned `taskCount` and sums those values for All tasks.

The separate `openTaskCount` query already excludes `done` and `canceled`, but includes subtasks. It is not a substitute for the top-level sidebar summary. `shell/data.ts` already refreshes the summary on task, project, and thread changes.

A design is included to resolve where the status filter belongs. Filtering the shared join would also change the green activity indicators, which is outside the requested scope.

## Goals / Non-Goals

**Goals:** Keep the existing summary query, RPC shape, and frontend aggregation while changing only the meaning of its task-count field.

**Non-Goals:** Do not unify the separate counters, alter subtask handling, add frontend filtering or a new RPC field, or change project-deletion checks and task-list queries.

## Decisions

### Filter inside the task-count aggregate

Count distinct task IDs conditionally when status is not `done` or `canceled`. Keep the existing top-level join condition and active-agent aggregate unchanged.

This preserves zero-count project rows and avoids duplicate counts when a task has multiple attached threads. A filter in the shared join or outer query would remove finished tasks' working agents from the activity aggregate. A separate query would add work without improving the contract.

### Reuse the existing response and rendering

Keep `SidebarProjectSummary.taskCount` as the field consumed by the project badges and All tasks total. No UI production change is expected. Existing query invalidation handles later status changes.

Adding an `openTaskCount` field would require redundant contract and consumer changes when no sidebar consumer needs the old total. Fetching and filtering tasks in the frontend would duplicate backend logic and risk pagination-dependent totals.

### Preserve the current counting scope

Treat only top-level tasks as countable, including when an unfinished subtask belongs to a finished parent. This is a deliberate preservation of existing behavior, not a new subtask policy.

## Risks / Trade-offs

- Accidentally hiding working agents on finished tasks. Mitigate with API regression cases for both `done` and `canceled` tasks with active threads.
- Inflated totals from the thread join. Retain distinct counting and cover multiple threads attached to one task.
- The All tasks badge can differ from the number of visible list rows because finished tasks remain viewable. This is intentional, the badge represents unfinished work rather than list length.
- The existing API fixture expects `taskCount: 3` for one done, one todo, and one canceled top-level task. Update it to `1` while preserving `activeAgentCount: 1` and the separate open-task count of `2`, which includes a subtask.

## Migration Plan

No stored data or RPC shape changes. Build and deploy the plugin normally; its next summary fetch returns the new counts. Reverting the aggregate restores the previous counts without a data migration.
